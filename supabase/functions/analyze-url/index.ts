// Consens — Supabase Edge Function: analyze-url
//
// SELF-CONTAINED VERSION
// Upload/update manual: cukup 1 file index.ts.
// Tidak memakai ../_shared/*
//
// Fungsi:
// URL berita publik -> Gemini Flash URL Context -> analisis Consens -> JSON.
//
// Secret yang diperlukan:
// GEMINI_API_KEY
//
// Model:
// gemini-3.8-flash

const GEMINI_MODEL = "gemini-3.8-flash";

const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const MAX_URL_LENGTH = 2048;
const REQUEST_TIMEOUT_MS = 45_000;

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

type Category = {
  key: string;
  badge: string;
  badgeTone: string;
  desc: string;
};

type Analysis = {
  quote?: string;
  score: number;
  scoreTone: string;
  scoreStatus: string;
  categories: Category[];
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
    v.categories.length >= 5 &&
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
    // lanjut ke fallback
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
Kamu adalah mesin analisis literasi informasi untuk Consens.

Kamu menerima URL artikel berita atau halaman informasi publik.
Gunakan URL Context untuk membaca isi URL yang diberikan. Analisis hanya
informasi yang benar-benar dapat kamu akses dari halaman tersebut.

Analisis dari 5 sudut pandang:
1. fakta
2. framing
3. logika
4. provokasi
5. konteks

Fakta:
- Identifikasi klaim faktual utama dalam artikel.
- Bedakan fakta yang dinyatakan artikel dengan hal yang belum dapat diverifikasi.
- Jangan mengarang sumber atau fakta dari luar halaman.
- Jika klaim membutuhkan informasi terkini atau verifikasi eksternal, tandai
  "Perlu Verifikasi".

Framing:
- Analisis pilihan kata, judul, penekanan, sudut pandang, dan informasi yang
  ditonjolkan.
- Jangan menganggap framing otomatis berarti informasi tersebut salah.

Logika:
- Cari logical fallacy atau lompatan kesimpulan jika memang terlihat.
- Jangan memaksakan adanya logical fallacy.

Provokasi:
- Analisis apakah judul atau bahasa artikel cenderung memicu emosi kuat,
  kemarahan, ketakutan, atau konflik.
- Bedakan bahasa emosional dengan bukti manipulasi.

Konteks:
- Identifikasi informasi penting yang belum tersedia dari halaman tersebut,
  seperti tanggal, sumber primer, data pembanding, kronologi, atau konteks
  kejadian.

ATURAN:
- Jawab hanya Bahasa Indonesia.
- Jangan membuat-buat nama sumber, angka, tanggal, kutipan, atau fakta.
- Jangan memberikan vonis "hoaks" hanya karena informasi belum terverifikasi.
- Jika informasi tidak cukup, katakan perlu verifikasi.
- score 0-100 adalah tingkat kepercayaan terhadap klaim utama berdasarkan
  informasi yang tersedia, bukan skor kualitas media atau penulis.
- Jika artikel tidak memiliki klaim faktual yang jelas, gunakan score sekitar
  50 dan jelaskan keterbatasannya.
- summary 2-4 kalimat.
- desc setiap kategori maksimal 1-2 kalimat.
- Kategori harus tepat: fakta, framing, logika, provokasi, konteks.
- Kembalikan HANYA JSON valid. Jangan gunakan markdown.

Format JSON:
{
  "quote": "<klaim/judul utama artikel secara singkat>",
  "score": 0,
  "scoreTone": "warn",
  "scoreStatus": "Perlu Verifikasi",
  "categories": [
    {
      "key": "fakta",
      "badge": "Perlu Verifikasi",
      "badgeTone": "warn",
      "desc": "..."
    },
    {
      "key": "framing",
      "badge": "Netral",
      "badgeTone": "neutral",
      "desc": "..."
    },
    {
      "key": "logika",
      "badge": "Tidak Ada Temuan Jelas",
      "badgeTone": "neutral",
      "desc": "..."
    },
    {
      "key": "provokasi",
      "badge": "Perlu Diperhatikan",
      "badgeTone": "info",
      "desc": "..."
    },
    {
      "key": "konteks",
      "badge": "Butuh Konteks",
      "badgeTone": "info",
      "desc": "..."
    }
  ],
  "summary": "..."
}
`;

function validatePublicUrl(value: string): string | null {
  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    // URL Context hanya bekerja pada URL publik.
    // Tolak localhost/private host dasar agar endpoint tidak digunakan
    // sebagai proxy internal.
    const hostname = url.hostname.toLowerCase();

    const blockedHosts = new Set([
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "::1",
    ]);

    if (blockedHosts.has(hostname)) {
      return null;
    }

    if (
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("127.")
    ) {
      return null;
    }

    if (value.length > MAX_URL_LENGTH) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function getGeminiText(data: any): string {
  const parts = data?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts)) return "";

  return parts
    .map((part: any) => part?.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
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

  const apiKey = Deno.env.get("GEMINI_API_KEY");

  if (!apiKey) {
    console.error("GEMINI_API_KEY belum di-set.");
    return jsonResponse(
      { error: "Server belum dikonfigurasi." },
      500,
    );
  }

  let body: { url?: unknown };

  try {
    body = await req.json();
  } catch {
    return jsonResponse(
      { error: "Body harus berupa JSON." },
      400,
    );
  }

  if (typeof body.url !== "string") {
    return jsonResponse(
      { error: "Field 'url' harus berupa string." },
      400,
    );
  }

  const url = validatePublicUrl(body.url.trim());

  if (!url) {
    return jsonResponse(
      {
        error:
          "URL tidak valid. Gunakan URL publik lengkap yang diawali http:// atau https://.",
      },
      400,
    );
  }

  const prompt = `
Analisis artikel/halaman web pada URL berikut menggunakan URL Context:

${url}

Fokus pada isi halaman yang berhasil kamu ambil dari URL tersebut.
Jangan mengarang informasi yang tidak tersedia.
Kembalikan hasil sesuai JSON schema yang diminta dalam system instruction.
`;

  const payload = {
    systemInstruction: {
      parts: [{ text: SYSTEM_INSTRUCTION }],
    },

    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],

    // URL Context adalah tool resmi Gemini untuk mengambil konten dari
    // URL publik yang diberikan.
    tools: [
      {
        url_context: {},
      },
    ],

    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
      maxOutputTokens: 2500,
    },
  };

  let geminiRes: Response;

  try {
    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS,
    );

    try {
      geminiRes = await fetch(GEMINI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.error("Gagal menghubungi Gemini:", err);

    return jsonResponse(
      { error: "Gagal menghubungi layanan AI." },
      502,
    );
  }

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();

    console.error(
      `Gemini API error ${geminiRes.status}:`,
      errText,
    );

    if (geminiRes.status === 400) {
      return jsonResponse(
        {
          error:
            "Request URL tidak dapat diproses oleh Gemini.",
        },
        502,
      );
    }

    if (geminiRes.status === 401 || geminiRes.status === 403) {
      return jsonResponse(
        {
          error:
            "Gemini API tidak terautorisasi. Periksa GEMINI_API_KEY dan billing.",
        },
        502,
      );
    }

    if (geminiRes.status === 429) {
      return jsonResponse(
        {
          error:
            "Batas penggunaan Gemini tercapai. Coba lagi nanti.",
        },
        429,
      );
    }

    return jsonResponse(
      { error: "Layanan AI mengembalikan error." },
      502,
    );
  }

  let geminiData: any;

  try {
    geminiData = await geminiRes.json();
  } catch (err) {
    console.error("Respons Gemini bukan JSON valid:", err);

    return jsonResponse(
      { error: "Respons AI tidak valid." },
      502,
    );
  }

  const rawText = getGeminiText(geminiData);

  if (!rawText) {
    console.error(
      "Gemini tidak mengembalikan teks:",
      JSON.stringify(geminiData),
    );

    return jsonResponse(
      {
        error:
          "Gemini tidak berhasil mengambil atau menganalisis URL tersebut.",
      },
      502,
    );
  }

  const analysis = extractJson(rawText);

  if (!analysis) {
    console.error(
      "Gagal parse JSON Gemini:",
      rawText,
    );

    return jsonResponse(
      { error: "Format hasil analisis tidak valid." },
      502,
    );
  }

  // Metadata retrieval dari URL Context dapat digunakan untuk debugging.
  const urlMetadata =
    geminiData?.candidates?.[0]?.url_context_metadata?.url_metadata ||
    [];

  const retrievedUrl =
    urlMetadata.find(
      (item: any) =>
        item?.url_retrieval_status ===
        "URL_RETRIEVAL_STATUS_SUCCESS",
    )?.retrieved_url || url;

  return jsonResponse({
    quote:
      analysis.quote ||
      "Artikel dari URL yang kamu masukkan",
    source: retrievedUrl,
    url,
    score: analysis.score,
    scoreTone: analysis.scoreTone,
    scoreStatus: analysis.scoreStatus,
    categories: analysis.categories,
    summary: analysis.summary,
  });
});
