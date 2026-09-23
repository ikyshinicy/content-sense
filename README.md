# Content Sense

Analisis konten. Perluas perspektif. Latih nalar.
Cek fakta, deteksi framing, pahami konteks, dan belajar berpikir kritis.

Static site — HTML/CSS/JS polos, tanpa build tool.

## Struktur folder

```
content-sense/
├── index.html              # Halaman utama
├── css/
│   └── style.css           # Semua styling
├── js/
│   ├── main.js              # Util bersama (renderResult, simulateProcessing)
│   ├── analyze-video.js     # Logic upload + analisis video (placeholder)
│   ├── analyze-photo.js     # Logic upload + analisis foto (placeholder)
│   └── analyze-text.js      # Logic input + analisis teks (placeholder)
├── assets/                  # Untuk logo/icon/gambar ke depannya
└── .github/workflows/
    └── deploy.yml           # Auto-deploy ke GitHub Pages tiap push ke main
```

## Status saat ini

Semua fitur analisis (video, foto, teks) masih **placeholder**: UI dan alur
kerja (upload, klik analisis, loading state, tampil hasil) sudah jalan, tapi
hasilnya masih data dummy. Cari komentar `// TODO` di masing-masing file
`js/analyze-*.js` untuk tahu persis di mana nanti nyambungin ke API/AI asli.

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
