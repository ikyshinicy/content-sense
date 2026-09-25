// Consens — Supabase Edge Function: analyze-photo
//
// SELF-CONTAINED VERSION
// Sengaja TANPA import ../_shared/* karena function ini di-update manual
// lewat Supabase Dashboard. Cukup upload/update file index.ts ini.
//
// Flow:
// Browser -> Supabase -> Replicate Files API (temporary) -> Gemini 3 Flash
// -> hasil JSON -> hapus file temporary di Replicate.
//
// Secret yang diperlukan:
// REPLICATE_API_TOKEN
//
// Model:
// google/gemini-3-flash

const MODEL = "google/gemini-3-flash";
const PREDICTION_URL =
  `https://api.replicate.com/v1/models/${MODEL}/predictions`;
const FILES_URL = "https://api.replicate.com/v1/files";

const MAX_FILES = 5;
const MAX_FILE_BYTES = 7 * 1024 * 1024; // Gemini 3 Flash: max 7 MB/gambar
const TOTAL_BUDGET_MS = 50_000;
const POLL_INTERVAL_MS = 1_500;

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

type Analysis = {
  quote?: string;
  score: number;
  scoreTone: string;
  scoreStatus: string;
  categories: Array<{
    key: string;
    badge: string;
    badgeTone: string;
    desc: string;
  }>;
  summary: string;
};

function isValidAnalysis(value: unknown): value is Analysis {
  if (!value || typeof value !== "object") return false;

  const v = value as Record<string, unknown>;

  return (
    typeof v.score === "number" &&
    v.score >= 0 &&
    v.score <= 100 &&
    typeof v.scoreTone === "string" &&
    typeof v.scoreStatus === "string" &&
    Array.isArray(v.categories) &&
    typeof v.summary === "string"
  );
}

function extractJson(raw: string): Analysis | null {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (isValidAnalysis(parsed)) return parsed;
  } catch {
    // fallback di bawah
  }

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      if (isValidAnalysis(parsed)) return parsed;
    } catch {
      // invalid JSON
    }
  }

  return null;
}

const SYSTEM_INSTRUCTION = `
Kamu adalah mesin analisis literasi informasi untuk Consens, khusus
menganalisis GAMBAR. Gambar dapat berupa screenshot berita, tangkapan layar
chat, poster, meme, foto, atau kombinasi beberapa gambar.

Analisis SEMUA gambar sebagai satu kesatuan dan hasilkan SATU analisis.

Lima kategori WAJIB muncul tepat satu kali:
- fakta
- framing
- logika
- provokasi
- konteks

Definisi:
1. fakta:
   Jika terdapat teks/klaim di dalam gambar, nilai apakah klaim tersebut dapat
   diverifikasi dari informasi yang tersedia. Jika membutuhkan sumber terkini
   atau kamu tidak yakin, tandai perlu verifikasi.
2. framing:
   Analisis pemilihan kata, cropping, komposisi, atau cara penyajian yang
   berpotensi menggiring interpretasi.
3. logika:
   Analisis logical fallacy pada klaim tertulis atau kejanggalan visual yang
   benar-benar dapat diamati. Jangan mengarang manipulasi.
4. provokasi:
   Nilai apakah penyajian gambar/teks cenderung memicu reaksi emosional kuat.
5. konteks:
   Jelaskan informasi penting yang tidak tersedia dari gambar, misalnya
   tanggal, lokasi, sumber, atau konteks sebelum/sesudahnya.

ATURAN:
- Jawab hanya Bahasa Indonesia.
- Jangan pernah menyatakan gambar pasti asli, palsu, hasil AI, atau telah diedit.
  Kamu tidak memiliki reverse image search atau forensic image detector.
- Jika ada kejanggalan visual, tulis sebagai observasi, bukan vonis.
- Jangan membuat nama sumber, statistik, tanggal, kutipan, atau fakta.
- score 0-100 adalah tingkat kepercayaan terhadap klaim utama yang terlihat,
  BUKAN skor keaslian gambar.
- Jika tidak ada klaim faktual yang bisa dinilai, gunakan score sekitar 50 dan
  jelaskan alasannya.
- quote adalah satu kalimat pendek yang menggambarkan isi/klaim utama yang
  terlihat, bukan vonis benar/salah.
- summary 2-4 kalimat, netral dan edukatif.
- desc setiap kategori maksimal satu kalimat pendek.
- Jangan menambahkan kategori selain lima kategori tersebut.

Kembalikan HANYA satu objek JSON valid, tanpa markdown dan tanpa teks lain:

{
  "quote": "<ringkasan singkat isi/klaim yang terlihat>",
  "score": 0,
  "scoreTone": "ok",
  "scoreStatus": "<label singkat>",
  "categories": [
    {
      "key": "fakta",
      "badge": "<label singkat>",
      "badgeTone": "ok",
      "desc": "<penjelasan singkat>"
    },
    {
      "key": "framing",
      "badge": "<label singkat>",
      "badgeTone": "neutral",
      "desc": "<penjelasan singkat>"
    },
    {
      "key": "logika",
      "badge": "<label singkat>",
      "badgeTone": "neutral",
      "desc": "<penjelasan singkat>"
    },
    {
      "key": "provokasi",
      "badge": "<label singkat>",
      "badgeTone": "neutral",
      "desc": "<penjelasan singkat>"
    },
    {
      "key": "konteks",
      "badge": "<label singkat>",
      "badgeTone": "info",
      "desc": "<penjelasan singkat>"
    }
  ],
  "summary": "<2-4 kalimat>"
}
`;

async function uploadTemporaryFile(
  apiKey: string,
  file: File,
): Promise<{ id: string; url: string }> {
  const form = new FormData();

  // Replicate Files API menerima multipart/form-data.
  form.append("content", file, file.name || "image");

  const res = await fetch(FILES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Replicate file upload error:", res.status, errText);

    if (res.status === 401 || res.status === 403) {
      throw new Error("Replicate API tidak terautorisasi.");
    }

    if (res.status === 429) {
      throw new Error("Batas penggunaan Replicate tercapai.");
    }

    throw new Error("Gagal mengupload gambar ke layanan AI.");
  }

  const data = await res.json();

  if (!data?.id || !data?.urls?.get) {
    console.error("Respons upload Replicate tidak valid:", data);
    throw new Error("Respons upload gambar tidak valid.");
  }

  return {
    id: data.id,
    url: data.urls.get,
  };
}

async function deleteTemporaryFile(
  apiKey: string,
  fileId: string,
): Promise<void> {
  try {
    const res = await fetch(`${FILES_URL}/${fileId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!res.ok) {
      console.error(
        `Gagal menghapus temporary file ${fileId}:`,
        res.status,
        await res.text(),
      );
    }
  } catch (err) {
    console.error(`Exception saat menghapus temporary file ${fileId}:`, err);
  }
}

async function runGemini(
  apiKey: string,
  imageUrls: string[],
  prompt: string,
  deadline: number,
): Promise<{ ok: true; text: string } | {
  ok: false;
  status: number;
  error: string;
}> {
  let prediction: any;

  const remaining = Math.max(deadline - Date.now(), 1_000);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      remaining,
    );

    try {
      const res = await fetch(PREDICTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          // Replicate menunggu sampai selesai sebelum mengembalikan response,
          // jika model selesai dalam batas wait.
          Prefer: "wait=45",
        },
        body: JSON.stringify({
          input: {
            prompt,
            images: imageUrls,
            system_instruction: SYSTEM_INSTRUCTION,
            thinking_level: "low",
            temperature: 0.3,
            max_output_tokens: 2500,
          },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(
          `Replicate prediction error ${res.status}:`,
          errText,
        );

        if (res.status === 401 || res.status === 403) {
          return {
            ok: false,
            status: 502,
            error:
              "Replicate API tidak terautorisasi. Periksa REPLICATE_API_TOKEN.",
          };
        }

        if (res.status === 429) {
          return {
            ok: false,
            status: 429,
            error:
              "Batas penggunaan Replicate tercapai. Coba lagi nanti.",
          };
        }

        return {
          ok: false,
          status: 502,
          error: "Layanan AI mengembalikan error.",
        };
      }

      prediction = await res.json();
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.error("Gagal menghubungi Replicate:", err);

    return {
      ok: false,
      status: 502,
      error: "Gagal menghubungi layanan AI.",
    };
  }

  // Kalau belum selesai, polling sampai deadline.
  while (
    prediction &&
    (prediction.status === "starting" ||
      prediction.status === "processing") &&
    Date.now() < deadline
  ) {
    const pollUrl = prediction?.urls?.get;

    if (!pollUrl) break;

    await new Promise((resolve) =>
      setTimeout(resolve, POLL_INTERVAL_MS)
    );

    try {
      const pollRes = await fetch(pollUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!pollRes.ok) {
        console.error(
          "Gagal polling Replicate:",
          pollRes.status,
          await pollRes.text(),
        );
        break;
      }

      prediction = await pollRes.json();
    } catch (err) {
      console.error("Error polling Replicate:", err);
      break;
    }
  }

  if (!prediction || prediction.status !== "succeeded") {
    console.error(
      "Prediksi Replicate tidak sukses:",
      JSON.stringify(prediction),
    );

    if (
      prediction?.status === "starting" ||
      prediction?.status === "processing"
    ) {
      return {
        ok: false,
        status: 504,
        error:
          "Analisis AI memakan waktu terlalu lama. Coba lagi.",
      };
    }

    return {
      ok: false,
      status: 502,
      error: "Layanan AI mengembalikan error.",
    };
  }

  const output = prediction.output;

  const rawText = Array.isArray(output)
    ? output.join("")
    : typeof output === "string"
      ? output
      : "";

  if (!rawText) {
    console.error(
      "Respons Replicate tidak berisi teks:",
      JSON.stringify(prediction),
    );

    return {
      ok: false,
      status: 502,
      error: "Respons AI tidak valid.",
    };
  }

  return {
    ok: true,
    text: rawText,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const apiKey = Deno.env.get("REPLICATE_API_TOKEN");

  if (!apiKey) {
    console.error("REPLICATE_API_TOKEN belum di-set.");
    return jsonResponse(
      { error: "Server belum dikonfigurasi." },
      500,
    );
  }

  const contentType = req.headers.get("content-type") || "";

  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return jsonResponse(
      { error: "Request harus berupa multipart/form-data." },
      400,
    );
  }

  let form: FormData;

  try {
    form = await req.formData();
  } catch (err) {
    console.error("Gagal parse form-data:", err);
    return jsonResponse(
      { error: "Gagal membaca file yang diupload." },
      400,
    );
  }

  const files = form
    .getAll("images")
    .filter((value): value is File => value instanceof File);

  if (files.length === 0) {
    return jsonResponse(
      {
        error:
          "Tidak ada gambar yang diupload. Field 'images' kosong.",
      },
      400,
    );
  }

  if (files.length > MAX_FILES) {
    return jsonResponse(
      {
        error: `Maksimal ${MAX_FILES} gambar per analisis.`,
      },
      400,
    );
  }

  let totalBytes = 0;

  for (const file of files) {
    if (!file.type.toLowerCase().startsWith("image/")) {
      return jsonResponse(
        {
          error:
            `File "${file.name}" bukan gambar yang didukung.`,
        },
        400,
      );
    }

    if (file.size > MAX_FILE_BYTES) {
      return jsonResponse(
        {
          error:
            `File "${file.name}" terlalu besar. Maksimal 7 MB per gambar.`,
        },
        400,
      );
    }

    totalBytes += file.size;
  }

  const deadline = Date.now() + TOTAL_BUDGET_MS;

  const uploadedFileIds: string[] = [];
  const uploadedFileUrls: string[] = [];

  try {
    // Upload sementara ke Replicate Files API.
    // Setelah analisis selesai, semua file dihapus lagi.
    for (const file of files) {
      if (Date.now() >= deadline) {
        return jsonResponse(
          {
            error:
              "Waktu upload habis. Coba gunakan gambar yang lebih kecil.",
          },
          504,
        );
      }

      const uploaded = await uploadTemporaryFile(apiKey, file);

      uploadedFileIds.push(uploaded.id);
      uploadedFileUrls.push(uploaded.url);
    }

    const prompt =
      files.length === 1
        ? "Analisis gambar yang diberikan sesuai instruksi Consens."
        : `Analisis ${files.length} gambar yang diberikan sebagai satu kesatuan sesuai instruksi Consens.`;

    const result = await runGemini(
      apiKey,
      uploadedFileUrls,
      prompt,
      deadline,
    );

    if (!result.ok) {
      return jsonResponse(
        { error: result.error },
        result.status,
      );
    }

    const analysis = extractJson(result.text);

    if (!analysis) {
      console.error(
        "Gagal parse JSON dari Gemini:",
        result.text,
      );

      return jsonResponse(
        { error: "Format hasil analisis tidak valid." },
        502,
      );
    }

    return jsonResponse({
      quote:
        analysis.quote ||
        "Isi gambar yang kamu upload",
      source:
        files.length === 1
          ? "1 gambar yang kamu upload"
          : `${files.length} gambar yang kamu upload`,
      score: analysis.score,
      scoreTone: analysis.scoreTone,
      scoreStatus: analysis.scoreStatus,
      categories: analysis.categories,
      summary: analysis.summary,
    });
  } catch (err) {
    console.error("analyze-photo error:", err);

    const message =
      err instanceof Error ? err.message : String(err);

    if (message.includes("Replicate API tidak terautorisasi")) {
      return jsonResponse(
        {
          error:
            "Replicate API tidak terautorisasi. Periksa REPLICATE_API_TOKEN.",
        },
        502,
      );
    }

    if (message.includes("Batas penggunaan Replicate")) {
      return jsonResponse(
        {
          error:
            "Batas penggunaan Replicate tercapai. Coba lagi nanti.",
        },
        429,
      );
    }

    return jsonResponse(
      { error: "Gagal memproses gambar." },
      500,
    );
  } finally {
    // WAJIB: hapus semua file temporary dari Replicate.
    await Promise.all(
      uploadedFileIds.map((fileId) =>
        deleteTemporaryFile(apiKey, fileId)
      ),
    );
  }
});
