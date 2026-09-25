# Content Sense

Analisis konten. Perluas perspektif. Latih nalar.
Cek fakta, deteksi framing, pahami konteks, dan belajar berpikir kritis.

Static site — HTML/CSS/JS polos, tanpa build tool.

## Struktur folder

```
content-sense/
├── index.html              # Halaman utama / Beranda (tool: 2 kolom input | output)
├── pages/
│   ├── panduan.html          # Halaman Panduan — cara pakai tool
│   └── tentang.html          # Halaman Tentang — cerita kenapa tool ini dibuat
├── css/
│   └── style.css           # Semua styling
├── js/
│   ├── main.js              # Util bersama (renderResult, simulateProcessing)
│   ├── mode-toggle.js       # Switch antar mode: Teks / URL / Foto / Video
│   ├── analyze-text.js      # Logic analisis teks (aktif — placeholder AI)
│   ├── analyze-url.js       # Logic analisis URL (segera hadir, disabled)
│   ├── analyze-photo.js     # Logic upload + analisis foto (segera hadir, disabled)
│   └── analyze-video.js     # Logic upload + analisis video (segera hadir, disabled)
├── assets/                  # Untuk logo/icon/gambar ke depannya
└── .github/workflows/
    └── deploy.yml           # Auto-deploy ke GitHub Pages tiap push ke main
```

## Status saat ini

Halaman dibagi 1 card dengan 2 kolom: kiri toggle mode input (Teks, URL, Foto,
Video), kanan panel hasil. Mode **Teks**, **URL**, dan **Foto** sudah aktif
dan tersambung ke Edge Function masing-masing (`analyze-text`, `analyze-url`,
`analyze-photo`) yang jalanin analisis lewat Gemini 3 Flash via Replicate.
Mode **Video** masih "Segera hadir" dan inputnya dinonaktifkan (`disabled`)
sampai backend-nya dibuat.

Detail per mode:
- **Teks** — tempel/ketik teks, dianalisis langsung.
- **URL** — tempel link artikel berita; backend fetch HTML-nya, ekstrak isi
  artikel (linkedom + Readability), baru dianalisis. Belum tentu berhasil di
  situs yang render kontennya pakai JavaScript berat.
- **Foto** — upload maks 5 gambar / total 30MB, dianalisis sekaligus sebagai
  satu kesatuan (bukan storage — file diproses lalu dibuang). Analisisnya
  cuma berdasarkan isi gambar yang terlihat; belum ada reverse image search
  atau deteksi manipulasi/AI-generated.

Cari komentar `// TODO` di `js/analyze-video.js` untuk tahu di mana nanti
nyambungin mode Video, dan hapus atribut `disabled` terkait di `index.html`
saat mode itu mau diaktifkan.

Semua ikon di UI pakai SVG inline (bukan emoji).

## Jalanin lokal

Karena tanpa build tool, tinggal buka `index.html` langsung di browser, atau
pakai local server sederhana biar path-nya konsisten:

```bash
npx serve .
# atau
python3 -m http.server
```

## Deploy

Push ke branch `main` → GitHub Actions (`.github/workflows/deploy.yml`)
otomatis build & deploy ke GitHub Pages. Aktifkan GitHub Pages di
**Settings → Pages → Source: GitHub Actions** kalau belum pernah di-set.
