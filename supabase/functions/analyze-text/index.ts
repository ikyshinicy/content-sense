// Consens — Supabase Edge Function: analyze-text
// Gemini API proxy. API key hanya di Supabase Secret.

const GEMINI_MODEL = "gemini-3.8-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_TEXT_LENGTH = 5000;
const GEMINI_TIMEOUT_MS = 45_000;
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

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "integer", description: "Tingkat kepercayaan klaim, 0-100." },
    scoreTone: { type: "string", enum: ["ok", "warn", "danger"] },
    scoreStatus: { type: "string", description: "Label singkat status analisis." },
    categories: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string", enum: ["fakta", "framing", "logika", "provokasi", "konteks"] },
          badge: { type: "string" },
          badgeTone: { type: "string", enum: ["ok", "warn", "danger", "info", "neutral"] },
          desc: { type: "string" },
        },
        required: ["key", "badge", "badgeTone", "desc"],
      },
    },
    summary: { type: "string", description: "Ringkasan analisis, 2-4 kalimat." },
  },
  required: ["score", "scoreTone", "scoreStatus", "categories", "summary"],
};

const SYSTEM_INSTRUCTION = `
Kamu adalah mesin analisis literasi informasi untuk Consens.
Analisis teks pengguna dari 5 sudut pandang:
1. fakta: apakah klaim dapat diverifikasi berdasarkan informasi yang tersedia. Jika tidak yakin atau membutuhkan sumber terkini, tandai perlu verifikasi. Jangan mengarang sumber atau fakta.
2. framing: apakah pemilihan kata atau sudut pandang cenderung menggiring opini.
3. logika: apakah terdapat logical fallacy atau alur berpikir yang tidak valid.
4. provokasi: apakah teks dirancang untuk memicu reaksi emosional.
5. konteks: apakah ada informasi penting yang mungkin hilang atau dihilangkan.

Aturan:
- Jawab hanya dalam Bahasa Indonesia.
- badgeTone: ok, warn, danger, info, atau neutral.
- score adalah tingkat kepercayaan terhadap klaim secara keseluruhan, 0-100.
- Jika teks adalah opini/curhat dan bukan klaim faktual, jangan memaksakan penilaian benar atau salah.
- Jangan membuat nama sumber, statistik, kutipan, atau fakta yang tidak diketahui.
- summary harus 2-4 kalimat, netral, jelas, dan mendidik.
- Kembalikan JSON sesuai schema.
`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.error("GEMINI_API_KEY belum di-set.");
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

  // PENTING: endpoint ":generateContent" (bukan Interactions API baru) masih
  // memakai GenerationConfig lama — field-nya "responseMimeType" +
  // "responseSchema" (flat), BUKAN "responseFormat" bergaya Interactions API.
  // "temperature/top_p/top_k" juga sudah tidak direkomendasikan Google untuk
  // model Gemini 3.x, jadi sengaja tidak diikutkan di sini.
  const geminiPayload = {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{
      role: "user",
      parts: [{ text: `Analisis teks berikut:\n\n"""${text}"""` }],
    }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      maxOutputTokens: 1200,
    },
  };

  let geminiRes: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    try {
      geminiRes = await fetch(GEMINI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(geminiPayload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.error("Gagal menghubungi Gemini API:", err);
    return jsonResponse({ error: "Gagal menghubungi layanan AI." }, 502);
  }

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    console.error(`Gemini API error ${geminiRes.status}:`, errText);

    if (geminiRes.status === 401 || geminiRes.status === 403) {
      return jsonResponse({ error: "API Gemini tidak terautorisasi. Periksa API key dan billing." }, 502);
    }
    if (geminiRes.status === 429) {
      return jsonResponse({ error: "Batas penggunaan Gemini tercapai. Coba lagi nanti." }, 429);
    }
    if (geminiRes.status === 400) {
      return jsonResponse({ error: "Request ke Gemini tidak valid." }, 502);
    }
    return jsonResponse({ error: "Layanan AI mengembalikan error." }, 502);
  }

  let geminiData: any;
  try {
    geminiData = await geminiRes.json();
  } catch (err) {
    console.error("Respons Gemini bukan JSON valid:", err);
    return jsonResponse({ error: "Respons AI tidak valid." }, 502);
  }

  const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    console.error("Respons Gemini tidak berisi teks:", JSON.stringify(geminiData));
    return jsonResponse({ error: "Respons AI tidak valid." }, 502);
  }

  let analysis: {
    score: number;
    scoreTone: string;
    scoreStatus: string;
    categories: Array<{ key: string; badge: string; badgeTone: string; desc: string }>;
    summary: string;
  };

  try {
    analysis = JSON.parse(rawText);
  } catch {
    console.error("Gagal parse JSON Gemini:", rawText);
    return jsonResponse({ error: "Respons AI tidak bisa diproses." }, 502);
  }

  if (
    typeof analysis.score !== "number" ||
    typeof analysis.scoreTone !== "string" ||
    typeof analysis.scoreStatus !== "string" ||
    !Array.isArray(analysis.categories) ||
    typeof analysis.summary !== "string"
  ) {
    console.error("Struktur analisis Gemini tidak sesuai schema:", JSON.stringify(analysis));
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
