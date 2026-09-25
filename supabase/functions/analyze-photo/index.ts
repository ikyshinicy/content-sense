// Content Sense — Supabase Edge Function: analyze-photo
// Terima upload gambar (multipart/form-data, field "images", 1-5 file,
// total maks 30MB), analisis SEKALIGUS (digabung jadi satu hasil) lewat
// Gemini 3 Flash (multimodal) via Replicate. Tool ini sekali pakai — file
// tidak disimpan di storage, cuma diproses in-memory lalu dibuang begitu
// response dikirim.
//
// PENTING (asumsi yang perlu dicek pas deploy): field "images" di model
// Replicate google/gemini-3-flash didokumentasikan menerima array
// URI/string gambar. Kode ini mengirim data URI base64
// ("data:image/jpeg;base64,...") per gambar, mengikuti konvensi umum
// Replicate untuk input bertipe file lewat HTTP API mentah (tanpa client
// library yang auto-upload). Kalau ternyata versi model ini menolak data
// URI dan hanya menerima URL publik, Replicate akan balas error yang
// providernya lempar ke sini — pesan errornya bakal muncul di log
// Supabase, jadi gampang dicek & disesuaikan.
//
// Ruang lingkup analisis SENGAJA dibatasi: cuma menilai isi yang terlihat
// di gambar (teks/klaim yang ada di gambar, kejanggalan visual yang
// teramati). TIDAK melakukan/mengklaim reverse image search atau deteksi
// manipulasi/AI-generated — itu di luar scope MVP ini (butuh API pihak
// ketiga terpisah, belum diimplementasi).

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { extractJson, SCHEMA_HINT } from "../_shared/analysis.ts";
import { callGemini } from "../_shared/replicate.ts";

const MAX_FILES = 5;
const MAX_TOTAL_BYTES = 30 * 1024 * 1024; // 30 MB
const TOTAL_BUDGET_MS = 45_000; // sedikit lebih longgar dari teks/URL — payload gambar lebih berat
const ALLOWED_MIME_PREFIX = "image/";

const SCHEMA_HINT_WITH_QUOTE = SCHEMA_HINT.replace(
  '"score": <integer 0-100>,',
  '"quote": "<1 kalimat pendek: ringkasan klaim/isi utama yang terlihat di gambar>",\n  "score": <integer 0-100>,',
);

const SYSTEM_INSTRUCTION = `
Kamu adalah mesin analisis literasi informasi untuk Content Sense, khusus
menganalisis GAMBAR (bisa 1 sampai 5 gambar sekaligus — misalnya
screenshot berita, tangkapan layar chat, poster, atau foto).

Analisis SEMUA gambar yang diberikan SEBAGAI SATU KESATUAN (satu hasil
gabungan, bukan per gambar), dari 5 sudut pandang, masing-masing WAJIB
muncul satu kali di array "categories" dengan key persis: fakta, framing,
logika, provokasi, konteks.
1. fakta: kalau ada teks/klaim tertulis di dalam gambar (mis. isi berita, caption, chat), apakah klaim itu dapat diverifikasi. Kalau gambar tidak memuat klaim tertulis apa pun, sebutkan itu apa adanya — jangan memaksakan penilaian.
2. framing: apakah cara pengambilan gambar, cropping, atau teks/caption yang menyertai gambar cenderung menggiring opini tertentu.
3. logika: apakah ada kejanggalan visual yang teramati secara masuk akal (proporsi, konsistensi elemen) ATAU logical fallacy dalam klaim tertulis di gambar (kalau ada).
4. provokasi: apakah gambar tampak dirancang untuk memicu reaksi emosional yang kuat/berlebihan.
5. konteks: informasi penting apa yang tidak terlihat dari gambar itu sendiri (mis. tidak ada tanggal/lokasi/sumber yang jelas) sehingga rawan disalahartikan di luar konteks.

Aturan isi (WAJIB dipatuhi):
- Jawab hanya dalam Bahasa Indonesia.
- JANGAN PERNAH mengklaim gambar ini "asli", "palsu", "hasil AI/edit", atau menyebutkan asal-usul/tanggal aslinya secara pasti — kamu TIDAK punya akses reverse image search atau tool deteksi manipulasi. Kalau ada kecurigaan visual, sampaikan sebagai observasi ("tampak ada ketidakwajaran di X"), bukan vonis, dan sarankan verifikasi lebih lanjut lewat sumber lain.
- score adalah tingkat kepercayaan terhadap klaim utama yang TERLIHAT di gambar (bukan soal keaslian gambar itu sendiri), 0-100. Kalau tidak ada klaim tertulis untuk dinilai, gunakan score netral (mis. 50) dan jelaskan itu di summary.
- Jangan mengarang nama sumber, statistik, atau fakta yang tidak diketahui.
- "quote" WAJIB diisi 1 kalimat pendek yang meringkas apa yang terlihat/diklaim di gambar (bukan vonis benar/salah).
- summary harus 2-4 kalimat, netral, jelas, dan mendidik. Kalau lebih dari satu gambar diberikan, sebutkan singkat kalau gambar-gambarnya berkaitan atau tampak membahas hal berbeda.
- "desc" di setiap kategori WAJIB singkat: maksimal 1 kalimat pendek (sekitar 20 kata).

Aturan format (WAJIB, ini paling penting):
- Balas HANYA dengan satu objek JSON valid, sesuai struktur berikut. Tidak
  boleh ada teks lain, tidak boleh ada markdown code fence (\`\`\`), tidak
  boleh ada penjelasan sebelum/sesudah JSON.
${SCHEMA_HINT_WITH_QUOTE}
`;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
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

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return jsonResponse({ error: "Request harus berupa multipart/form-data." }, 400);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    console.error("Gagal parse form-data:", err);
    return jsonResponse({ error: "Gagal membaca file yang diupload." }, 400);
  }

  const files = form.getAll("images").filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return jsonResponse({ error: "Tidak ada gambar yang diupload. Field 'images' kosong." }, 400);
  }
  if (files.length > MAX_FILES) {
    return jsonResponse({ error: `Maksimal ${MAX_FILES} gambar per analisis.` }, 400);
  }

  let totalBytes = 0;
  for (const file of files) {
    if (!file.type.startsWith(ALLOWED_MIME_PREFIX)) {
      return jsonResponse({ error: `File "${file.name}" bukan gambar yang didukung.` }, 400);
    }
    totalBytes += file.size;
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    return jsonResponse({ error: `Total ukuran gambar maksimal ${MAX_TOTAL_BYTES / (1024 * 1024)} MB.` }, 400);
  }

  const deadline = Date.now() + TOTAL_BUDGET_MS;

  let imageDataUris: string[];
  try {
    imageDataUris = await Promise.all(
      files.map(async (file) => {
        const buffer = new Uint8Array(await file.arrayBuffer());
        const base64 = bytesToBase64(buffer);
        return `data:${file.type};base64,${base64}`;
      }),
    );
  } catch (err) {
    console.error("Gagal membaca isi file:", err);
    return jsonResponse({ error: "Gagal membaca isi file yang diupload." }, 400);
  }

  const promptIntro = files.length === 1
    ? "Analisis gambar berikut:"
    : `Analisis ${files.length} gambar berikut sebagai satu kesatuan:`;

  const result = await callGemini(
    apiKey,
    {
      prompt: promptIntro,
      system_instruction: SYSTEM_INSTRUCTION,
      thinking_level: "low",
      max_output_tokens: 2500,
      images: imageDataUris,
    },
    deadline,
  );

  if (!result.ok) {
    return jsonResponse({ error: result.error }, result.status);
  }

  const analysis = extractJson(result.rawText);
  if (!analysis) {
    console.error("Gagal parse/validasi JSON dari model:", result.rawText);
    return jsonResponse({ error: "Format hasil analisis tidak valid." }, 502);
  }

  return jsonResponse({
    quote: analysis.quote || "Isi gambar yang kamu upload",
    source: files.length === 1 ? "1 gambar yang kamu upload" : `${files.length} gambar yang kamu upload`,
    score: analysis.score,
    scoreTone: analysis.scoreTone,
    scoreStatus: analysis.scoreStatus,
    categories: analysis.categories,
    summary: analysis.summary,
  });
});
