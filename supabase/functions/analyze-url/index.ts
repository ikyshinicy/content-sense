// Content Sense — Supabase Edge Function: analyze-url
// Alur: terima link berita -> fetch HTML-nya (dengan validasi SSRF &
// batas ukuran) -> ekstrak isi artikel bersih pakai linkedom + Readability
// (self-hosted, bukan reader service pihak ketiga — konsisten dengan
// alasan project ini pindah dari Google API langsung ke Replicate: hindari
// ketergantungan ke layanan luar yang bisa goyah) -> kirim ke Gemini 3
// Flash via Replicate pakai kerangka analisis yang sama persis dengan
// mode Teks (fakta/framing/logika/provokasi/konteks).
//
// analyze-text/index.ts sengaja TIDAK disentuh/refactor supaya mode Teks
// yang sudah live tidak ikut berisiko regresi. Boilerplate yang sama
// (CORS, panggilan Replicate, parsing JSON) diekstrak ke folder _shared/
// dan dipakai bersama di sini.

import { parseHTML } from "https://esm.sh/linkedom@0.16.11";
import { Readability } from "https://esm.sh/@mozilla/readability@0.5.0";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { extractJson, SCHEMA_HINT } from "../_shared/analysis.ts";
import { callGemini } from "../_shared/replicate.ts";
import { checkUrlSafety } from "../_shared/ssrf-guard.ts";

const MAX_ARTICLE_LENGTH = 6000; // artikel biasanya lebih panjang dari teks tempelan
const MAX_HTML_BYTES = 3_000_000; // ~3MB, cukup buat halaman berita wajar
const MAX_REDIRECTS = 5;
const TOTAL_BUDGET_MS = 40_000; // anggaran waktu fetch + AI, sebelum edge function nyerah
const FETCH_USER_AGENT =
  "Mozilla/5.0 (compatible; ContentSenseBot/1.0; +https://ranz-ai.com) AppleWebKit/537.36";

const SYSTEM_INSTRUCTION = `
Kamu adalah mesin analisis literasi informasi untuk Content Sense.
Analisis artikel berita berikut (hasil ekstraksi otomatis dari sebuah
link, bukan tempelan manual pengguna) dari 5 sudut pandang, masing-masing
WAJIB muncul satu kali di array "categories" dengan key persis: fakta,
framing, logika, provokasi, konteks.
1. fakta: apakah klaim utama artikel dapat diverifikasi berdasarkan informasi yang tersedia. Jika tidak yakin atau butuh sumber terkini, tandai perlu verifikasi. Jangan mengarang sumber atau fakta.
2. framing: apakah pemilihan kata, judul, atau sudut pandang artikel cenderung menggiring opini.
3. logika: apakah terdapat logical fallacy atau alur berpikir yang tidak valid dalam argumen artikel.
4. provokasi: apakah artikel dirancang untuk memicu reaksi emosional yang berlebihan.
5. konteks: apakah ada informasi penting yang mungkin hilang atau dihilangkan dari artikel.

Aturan isi:
- Jawab hanya dalam Bahasa Indonesia.
- score adalah tingkat kepercayaan terhadap klaim utama artikel secara keseluruhan, 0-100.
- Kalau artikel lebih berupa opini/kolom dan bukan klaim faktual, jangan memaksakan penilaian benar atau salah.
- Jangan membuat nama sumber, statistik, kutipan, atau fakta yang tidak diketahui.
- Teks yang kamu terima adalah hasil ekstraksi otomatis dari HTML — mungkin ada sisa noise (nama penulis, tanggal, label kategori). Fokus ke isi artikelnya, abaikan noise semacam itu.
- summary harus 2-4 kalimat, netral, jelas, dan mendidik.
- "desc" di setiap kategori WAJIB singkat: maksimal 1 kalimat pendek (sekitar 20 kata). Jangan bertele-tele — ini supaya seluruh JSON muat dan tidak terpotong.

Aturan format (WAJIB, ini paling penting):
- Balas HANYA dengan satu objek JSON valid, sesuai struktur berikut. Tidak
  boleh ada teks lain, tidak boleh ada markdown code fence (\`\`\`), tidak
  boleh ada penjelasan sebelum/sesudah JSON.
${SCHEMA_HINT}
`;

// Baca body dengan batas ukuran, supaya halaman raksasa/aneh-aneh tidak
// menghabiskan memory edge function.
async function readBodyWithLimit(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return await res.text();

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    chunks.push(value);
    if (total >= maxBytes) {
      await reader.cancel().catch(() => {});
      break;
    }
  }

  const size = Math.min(total, maxBytes);
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    const remaining = buffer.length - offset;
    if (remaining <= 0) break;
    const slice = chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk;
    buffer.set(slice, offset);
    offset += slice.byteLength;
  }
  return new TextDecoder("utf-8").decode(buffer);
}

// Fetch dengan validasi SSRF di SETIAP hop redirect (redirect: "manual"),
// bukan cuma di URL awal — supaya redirect ke alamat internal tidak lolos.
async function fetchArticleHtml(
  startUrl: URL,
  deadlineMs: number,
): Promise<{ ok: true; html: string; finalUrl: URL } | { ok: false; status: number; error: string }> {
  let current = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = checkUrlSafety(current.toString());
    if (!check.safe) {
      return { ok: false, status: 400, error: check.reason };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(deadlineMs - Date.now(), 1000));
    let res: Response;
    try {
      res = await fetch(current.toString(), {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          "User-Agent": FETCH_USER_AGENT,
          "Accept": "text/html,application/xhtml+xml",
        },
      });
    } catch (err) {
      clearTimeout(timeout);
      console.error("Gagal fetch URL:", err);
      return { ok: false, status: 502, error: "Gagal mengakses URL tersebut. Pastikan link bisa diakses publik." };
    } finally {
      clearTimeout(timeout);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        return { ok: false, status: 502, error: "URL redirect tanpa tujuan yang jelas." };
      }
      try {
        current = new URL(location, current);
      } catch {
        return { ok: false, status: 502, error: "URL redirect tidak valid." };
      }
      continue;
    }

    if (!res.ok) {
      return { ok: false, status: 502, error: `Halaman mengembalikan status ${res.status}.` };
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("html")) {
      return { ok: false, status: 400, error: "URL ini bukan halaman HTML (artikel/berita)." };
    }

    const html = await readBodyWithLimit(res, MAX_HTML_BYTES);
    return { ok: true, html, finalUrl: current };
  }

  return { ok: false, status: 502, error: "Terlalu banyak redirect." };
}

function extractArticle(html: string, baseUrl: string): { title: string; text: string } | null {
  try {
    const { document } = parseHTML(html);
    const base = document.createElement("base");
    base.setAttribute("href", baseUrl);
    document.head?.appendChild(base);

    // deno-lint-ignore no-explicit-any
    const reader = new Readability(document as any);
    const article = reader.parse();
    if (!article || !article.textContent) return null;

    const text = article.textContent.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (!text) return null;

    return { title: (article.title || "").trim(), text };
  } catch (err) {
    console.error("Gagal parsing artikel:", err);
    return null;
  }
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

  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Body harus berupa JSON." }, 400);
  }

  if (typeof body.url !== "string" || !body.url.trim()) {
    return jsonResponse({ error: "Field 'url' harus berupa string dan tidak boleh kosong." }, 400);
  }

  const rawUrl = body.url.trim();
  const initialCheck = checkUrlSafety(rawUrl);
  if (!initialCheck.safe) {
    return jsonResponse({ error: initialCheck.reason }, 400);
  }

  const deadline = Date.now() + TOTAL_BUDGET_MS;

  const fetched = await fetchArticleHtml(initialCheck.url, deadline);
  if (!fetched.ok) {
    return jsonResponse({ error: fetched.error }, fetched.status);
  }

  const article = extractArticle(fetched.html, fetched.finalUrl.toString());
  if (!article) {
    return jsonResponse(
      { error: "Gagal mengambil isi artikel dari halaman ini. Coba link lain, atau halaman ini mungkin butuh JavaScript untuk menampilkan kontennya." },
      422,
    );
  }

  const articleText = article.text.length > MAX_ARTICLE_LENGTH
    ? `${article.text.slice(0, MAX_ARTICLE_LENGTH)}…`
    : article.text;

  const result = await callGemini(
    apiKey,
    {
      prompt: `Analisis artikel berikut:\n\nJudul: ${article.title || "(tanpa judul)"}\n\nIsi:\n"""${articleText}"""`,
      system_instruction: SYSTEM_INSTRUCTION,
      thinking_level: "low",
      max_output_tokens: 2500,
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

  const fallbackQuote = articleText.length > 140 ? `${articleText.slice(0, 140)}…` : articleText;

  return jsonResponse({
    quote: article.title || fallbackQuote,
    source: fetched.finalUrl.hostname.replace(/^www\./, ""),
    score: analysis.score,
    scoreTone: analysis.scoreTone,
    scoreStatus: analysis.scoreStatus,
    categories: analysis.categories,
    summary: analysis.summary,
  });
});
