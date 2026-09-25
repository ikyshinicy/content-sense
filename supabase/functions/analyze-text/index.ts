// Content Sense — Supabase Edge Function: analyze-text
//
// Proxy tipis ke Gemini API. Menerima teks dari frontend, minta Gemini
// menganalisis fakta/framing/logika/provokasi/konteks dalam format JSON
// terstruktur, lalu balikin hasilnya ke frontend.
//
// API key Gemini TIDAK PERNAH dikirim ke browser — disimpan sebagai
// secret Supabase dan hanya dipakai di server (fungsi ini).
//
// Deploy:
//   supabase functions deploy analyze-text
// Set secret (sekali saja, ganti YOUR_KEY):
//   supabase secrets set GEMINI_API_KEY=YOUR_KEY
// Opsional, batasi origin yang boleh manggil (default: izinkan semua):
//   supabase secrets set ALLOWED_ORIGIN=https://username.github.io

const GEMINI_MODEL = "gemini-3.5-flash";
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const MAX_TEXT_LENGTH = 5000; // sinkron dengan maxlength textarea di frontend

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
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

// Skema output yang wajib diikuti Gemini — biar hasilnya selalu punya
// bentuk yang sama persis dengan yang dibutuhkan UI (lihat js/main.js
// renderAnalysisResult() dan js/analyze-text.js di frontend).
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "integer", description: "Tingkat kepercayaan klaim, 0-100" },
    scoreTone: { type: "string", enum: ["ok", "warn", "danger"] },
    scoreStatus: { type: "string", description: "Label singkat, misal 'Perlu Verifikasi'" },
    categories: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string", enum: ["fakta", "framing", "logika", "provokasi", "konteks"] },
          badge: { type: "string", description: "Label singkat status kategori" },
          badgeTone: { type: "string", enum: ["ok", "warn", "danger", "info", "neutral"] },
          desc: { type: "string", description: "1-2 kalimat penjelasan" },
        },
        required: ["key", "badge", "badgeTone", "desc"],
      },
    },
    summary: { type: "string", description: "Ringkasan analisis keseluruhan, 2-4 kalimat" },
  },
  required: ["score", "scoreTone", "scoreStatus", "categories", "summary"],
};

const SYSTEM_INSTRUCTION = `Kamu adalah mesin analisis literasi media untuk Content Sense.
Tugasmu: menganalisis teks (berita, caption, postingan, klaim) yang ditempel
pengguna dari 5 sudut pandang tetap, dengan key persis seperti ini:
- "fakta": apakah klaim ini bisa diverifikasi berdasarkan pengetahuanmu.
  Kalau kamu tidak yakin atau ini butuh sumber terkini, jangan mengarang —
  tandai sebagai perlu verifikasi (badgeTone "warn" atau "info"), jangan
  pernah menyatakan sesuatu benar/salah kalau kamu sendiri tidak yakin.
- "framing": apakah pemilihan kata/sudut pandang cenderung menggiring opini.
- "logika": apakah ada logical fallacy atau alur berpikir yang tidak valid.
- "provokasi": apakah teks ini dirancang untuk memicu reaksi emosional.
- "konteks": apakah ada informasi penting yang kemungkinan hilang/dihilangkan.

Aturan:
- Jawab HANYA dalam Bahasa Indonesia.
- badgeTone: "ok" (aman/baik), "warn" (perlu hati-hati), "danger" (masalah
  jelas), "info" (butuh konteks tambahan), "neutral" (tidak ada temuan
  berarti).
- score = tingkat kepercayaan klaim secara keseluruhan (0-100). Kalau teks
  bukan klaim faktual (opini murni, curhat, dll), nilai berdasarkan
  kewajaran & transparansi teksnya, bukan "kebenaran" yang tidak relevan.
- Jangan pernah membuat-buat nama sumber, statistik, atau kutipan yang
  tidak benar-benar kamu ketahui.
- summary: rangkum temuan di atas secara natural, 2-4 kalimat, nada netral
  dan mendidik (bukan menggurui).`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.error("GEMINI_API_KEY belum di-set sebagai secret Supabase.");
    return jsonResponse({ error: "Server belum dikonfigurasi." }, 500);
  }

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Body harus JSON." }, 400);
  }

  const text = (body.text || "").trim();
  if (!text) {
    return jsonResponse({ error: "Teks kosong." }, 400);
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return jsonResponse({ error: `Teks maksimal ${MAX_TEXT_LENGTH} karakter.` }, 400);
  }

  const geminiPayload = {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{ role: "user", parts: [{ text: `Analisis teks berikut:\n\n"""${text}"""` }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.3,
    },
  };

  let geminiRes: Response;
  try {
    geminiRes = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(geminiPayload),
    });
  } catch (err) {
    console.error("Gagal menghubungi Gemini API:", err);
    return jsonResponse({ error: "Gagal menghubungi layanan AI." }, 502);
  }

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    console.error("Gemini API error:", geminiRes.status, errText);
    return jsonResponse({ error: "Layanan AI mengembalikan error." }, 502);
  }

  const geminiData = await geminiRes.json();
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
  } catch (err) {
    console.error("Gagal parse JSON dari Gemini:", rawText);
    return jsonResponse({ error: "Respons AI tidak bisa diproses." }, 502);
  }

  // Bentuk field tambahan yang dibutuhkan UI (quote & source) — dibikin di
  // sini, bukan diminta dari Gemini, biar selalu akurat sama input asli.
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
