// Content Sense — _shared/analysis.ts
// Tipe hasil analisis + parsing JSON dari output model, dipakai bersama
// oleh analyze-url dan analyze-photo. Logic-nya sama persis dengan yang
// ada di analyze-text/index.ts (extractJson dengan fallback strip code
// fence + ekstrak objek JSON pertama), diekstrak ke sini supaya tidak
// dobel-tulis. analyze-text/index.ts sengaja TIDAK diubah untuk hindari
// risiko regresi di mode Teks yang sudah live.

export const SCHEMA_HINT = `{
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

export type Analysis = {
  score: number;
  scoreTone: string;
  scoreStatus: string;
  categories: Array<{ key: string; badge: string; badgeTone: string; desc: string }>;
  summary: string;
  // Field opsional tambahan (dipakai mode Foto untuk kalimat ringkas
  // klaim/isi utama gambar — tidak divalidasi wajib ada di sini karena
  // mode Teks/URL tidak memakainya).
  quote?: string;
};

export function isValidAnalysis(value: unknown): value is Analysis {
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
export function extractJson(raw: string): Analysis | null {
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
