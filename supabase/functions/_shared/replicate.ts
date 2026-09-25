// Content Sense — _shared/replicate.ts
// Wrapper panggil Replicate (Gemini 3 Flash) + polling, diekstrak dari
// pola yang sudah dipakai di analyze-text/index.ts (Prefer: wait=55, lalu
// polling manual kalau belum selesai) supaya analyze-url & analyze-photo
// tidak perlu tulis ulang boilerplate ini. analyze-text/index.ts sengaja
// TIDAK diubah untuk hindari risiko regresi di mode Teks yang sudah live.

export const REPLICATE_MODEL = "google/gemini-3-flash";
export const REPLICATE_PREDICTIONS_URL = `https://api.replicate.com/v1/models/${REPLICATE_MODEL}/predictions`;

const POLL_INTERVAL_MS = 1_500;

export type GeminiInput = {
  prompt: string;
  system_instruction: string;
  thinking_level?: "low" | "high";
  max_output_tokens?: number;
  // Array data URI ("data:image/jpeg;base64,...") atau URL gambar publik.
  // Dipakai khusus mode Foto — dibiarkan opsional supaya input mode
  // teks/URL (tanpa gambar) tetap valid.
  images?: string[];
};

export type GeminiCallResult =
  | { ok: true; rawText: string }
  | { ok: false; status: number; error: string };

// Panggil Replicate dan tunggu sampai prediksi selesai (atau deadline
// habis). deadlineMs adalah Date.now()-style epoch ms, bukan durasi.
export async function callGemini(apiKey: string, input: GeminiInput, deadlineMs: number): Promise<GeminiCallResult> {
  let prediction: any;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(deadlineMs - Date.now(), 1000));
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
        body: JSON.stringify({ input }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const errText = await res.text();
        console.error(`Replicate API error ${res.status}:`, errText);
        if (res.status === 401 || res.status === 403) {
          return { ok: false, status: 502, error: "Replicate API tidak terautorisasi. Periksa REPLICATE_API_TOKEN." };
        }
        if (res.status === 429) {
          return { ok: false, status: 429, error: "Batas penggunaan Replicate tercapai. Coba lagi nanti." };
        }
        return { ok: false, status: 502, error: "Layanan AI mengembalikan error." };
      }

      prediction = await res.json();
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.error("Gagal menghubungi Replicate:", err);
    return { ok: false, status: 502, error: "Gagal menghubungi layanan AI." };
  }

  // Kalau "Prefer: wait" belum sempat selesai (status masih starting/
  // processing), polling manual sampai selesai atau deadline habis.
  const pollUrl: string | undefined = prediction?.urls?.get;
  while (
    prediction &&
    (prediction.status === "starting" || prediction.status === "processing") &&
    Date.now() < deadlineMs
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
      return { ok: false, status: 504, error: "Analisis AI memakan waktu terlalu lama. Coba lagi." };
    }
    return { ok: false, status: 502, error: "Layanan AI mengembalikan error." };
  }

  const output = prediction.output;
  const rawText = Array.isArray(output) ? output.join("") : (typeof output === "string" ? output : "");

  if (!rawText) {
    console.error("Respons Replicate tidak berisi teks:", JSON.stringify(prediction));
    return { ok: false, status: 502, error: "Respons AI tidak valid." };
  }

  return { ok: true, rawText };
}
