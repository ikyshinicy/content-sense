// Consens — Supabase Edge Function: analyze-text
// Gemini 3 Flash via Replicate (bukan langsung ke Google AI).
// Kenapa: Google generativelanguage API sempat 503 "high demand" berulang.
// Replicate host model yang sama tapi TIDAK punya JSON schema enforcement
// native — jadi kita minta format JSON lewat system_instruction, lalu
// parsing-nya dibikin lebih defensif (strip code fence, fallback ekstrak
// objek JSON pertama) karena hasil model bisa saja tidak 100% bersih.

const REPLICATE_MODEL = "google/gemini-3-flash";
const REPLICATE_PREDICTIONS_URL = `https://api.replicate.com/v1/models/${REPLICATE_MODEL}/predictions`;
const MAX_TEXT_LENGTH = 5000;

// Total anggaran waktu (initial request + polling) sebelum kita nyerah.
// Supabase Edge Function punya batas waktu eksekusi, jadi jangan kepanjangan.
const TOTAL_BUDGET_MS = 40_000;
const POLL_INTERVAL_MS = 1_500;

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8" },
  });
}

const SCHEMA_HINT = `{
  "score": <integer 0-100>,
  "scoreTone": "ok" | "warn" | "danger",
  "scoreStatus": "<label singkat>",
  "categories": [
    {
      "key": "fakta" | "framing" | "logika" | "provokasi" | "konteks",
      "badge": "<label singkat>",
      "badgeTone": "ok" | "warn" | "danger" | "info" | "neutral",
      "desc": "<1-2 kalimat>"
    }
  ],
  "summary": "<2-4 kalimat>"
}`;

const SYSTEM_INSTRUCTION = `
Kamu adalah mesin analisis literasi informasi untuk Consens.
Analisis teks pengguna dari 5 sudut pandang, masing-masing WAJIB muncul satu
kali di array "categories" dengan key persis: fakta, framing, logika,
provokasi, konteks.
1. fakta: apakah klaim dapat diverifikasi berdasarkan informasi yang tersedia. Jika tidak yakin atau membutuhkan sumber terkini, tandai perlu verifikasi. Jangan mengarang sumber atau fakta.
2. framing: apakah pemilihan kata atau sudut pandang cenderung menggiring opini.
3. logika: apakah terdapat logical fallacy atau alur berpikir yang tidak valid.
4. provokasi: apakah teks dirancang untuk memicu reaksi emosional.
5. konteks: apakah ada informasi penting yang mungkin hilang atau dihilangkan.

Aturan isi:
- Jawab hanya dalam Bahasa Indonesia.
- score adalah tingkat kepercayaan terhadap klaim secara keseluruhan, 0-100.
- Jika teks adalah opini/curhat dan bukan klaim faktual, jangan memaksakan penilaian benar atau salah.
- Jangan membuat nama sumber, statistik, kutipan, atau fakta yang tidak diketahui.
- summary harus 2-4 kalimat, netral, jelas, dan mendidik.
- "desc" di setiap kategori WAJIB singkat: maksimal 1 kalimat pendek (sekitar 20 kata). Jangan bertele-tele — ini supaya seluruh JSON muat dan tidak terpotong.

Aturan format (WAJIB, ini paling penting):
- Balas HANYA dengan satu objek JSON valid, sesuai struktur berikut. Tidak
  boleh ada teks lain, tidak boleh ada markdown code fence (\`\`\`), tidak
  boleh ada penjelasan sebelum/sesudah JSON.
${SCHEMA_HINT}
`;

type Analysis = {
  score: number;
  scoreTone: string;
  scoreStatus: string;
  categories: Array<{ key: string; badge: string; badgeTone: string; desc: string }>;
  summary: string;
};

function isValidAnalysis(value: unknown): value is Analysis {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.score === "number" &&
    typeof v.scoreTone === "string" &&
    typeof v.scoreStatus === "string" &&
    Array.isArray(v.categories) &&
    typeof v.summary === "string"
  );
}

// Model kadang membungkus JSON dengan ```json ... ``` atau nambah kalimat
// pembuka/penutup meskipun sudah dilarang di system instruction. Fungsi ini
// coba beberapa cara untuk tetap dapat objek JSON-nya.
function extractJson(raw: string): Analysis | null {
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (isValidAnalysis(parsed)) return parsed;
  } catch {
    // lanjut ke fallback
  }

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      if (isValidAnalysis(parsed)) return parsed;
    } catch {
      // menyerah
    }
  }

  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const apiKey = Deno.env.get("REPLICATE_API_TOKEN");
  if (!apiKey) {
    console.error("REPLICATE_API_TOKEN belum di-set.");
    return jsonResponse({ error: "Server belum dikonfigurasi." }, 500);
  }

  let body: { text?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Body harus berupa JSON." }, 400);
  }

  if (typeof body.text !== "string") {
    return jsonResponse({ error: "Field 'text' harus berupa string." }, 400);
  }

  const text = body.text.trim();
  if (!text) return jsonResponse({ error: "Teks kosong." }, 400);
  if (text.length > MAX_TEXT_LENGTH) {
    return jsonResponse({ error: `Teks maksimal ${MAX_TEXT_LENGTH} karakter.` }, 400);
  }

  const deadline = Date.now() + TOTAL_BUDGET_MS;

  const replicatePayload = {
    input: {
      prompt: `Analisis teks berikut:\n\n"""${text}"""`,
      system_instruction: SYSTEM_INSTRUCTION,
      thinking_level: "low",
      max_output_tokens: 2500,
    },
  };

  let prediction: any;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(deadline - Date.now(), 1000));
    try {
      const res = await fetch(REPLICATE_PREDICTIONS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          // Minta Replicate nunggu sampai selesai (maks ~55 detik) supaya
          // kita tidak perlu polling di kasus umum.
          "Prefer": "wait=55",
        },
        body: JSON.stringify(replicatePayload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const errText = await res.text();
        console.error(`Replicate API error ${res.status}:`, errText);
        if (res.status === 401 || res.status === 403) {
          return jsonResponse({ error: "Replicate API tidak terautorisasi. Periksa REPLICATE_API_TOKEN." }, 502);
        }
        if (res.status === 429) {
          return jsonResponse({ error: "Batas penggunaan Replicate tercapai. Coba lagi nanti." }, 429);
        }
        return jsonResponse({ error: "Layanan AI mengembalikan error." }, 502);
      }

      prediction = await res.json();
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.error("Gagal menghubungi Replicate:", err);
    return jsonResponse({ error: "Gagal menghubungi layanan AI." }, 502);
  }

  // Kalau "Prefer: wait" belum sempat selesai (status masih starting/
  // processing), polling manual sampai selesai atau anggaran waktu habis.
  const pollUrl: string | undefined = prediction?.urls?.get;
  while (
    prediction &&
    (prediction.status === "starting" || prediction.status === "processing") &&
    Date.now() < deadline
  ) {
    if (!pollUrl) break;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    try {
      const pollRes = await fetch(pollUrl, {
        headers: { "Authorization": `Bearer ${apiKey}` },
      });
      if (!pollRes.ok) {
        console.error("Gagal polling status Replicate:", pollRes.status, await pollRes.text());
        break;
      }
      prediction = await pollRes.json();
    } catch (err) {
      console.error("Error saat polling Replicate:", err);
      break;
    }
  }

  if (!prediction || prediction.status !== "succeeded") {
    console.error("Prediksi Replicate tidak selesai dengan sukses:", JSON.stringify(prediction));
    if (prediction?.status === "starting" || prediction?.status === "processing") {
      return jsonResponse({ error: "Analisis AI memakan waktu terlalu lama. Coba lagi." }, 504);
    }
    return jsonResponse({ error: "Layanan AI mengembalikan error." }, 502);
  }

  const output = prediction.output;
  const rawText = Array.isArray(output) ? output.join("") : (typeof output === "string" ? output : "");

  if (!rawText) {
    console.error("Respons Replicate tidak berisi teks:", JSON.stringify(prediction));
    return jsonResponse({ error: "Respons AI tidak valid." }, 502);
  }

  const analysis = extractJson(rawText);
  if (!analysis) {
    console.error("Gagal parse/validasi JSON dari model:", rawText);
    return jsonResponse({ error: "Format hasil analisis tidak valid." }, 502);
  }

  const quote = text.length > 140 ? `${text.slice(0, 140)}…` : text;

  return jsonResponse({
    quote,
    source: "Teks yang kamu tempel",
    score: analysis.score,
    scoreTone: analysis.scoreTone,
    scoreStatus: analysis.scoreStatus,
    categories: analysis.categories,
    summary: analysis.summary,
  });
});
