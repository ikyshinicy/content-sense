// Content Sense — analyze-text.js
// PLACEHOLDER: belum tersambung ke AI. Ganti bagian yang ditandai TODO
// saat backend/AI analisis teks sudah siap.

// Teks contoh untuk chip "Coba contoh cepat". Menekan chip cuma mengisi
// textarea — analisisnya tetap harus ditekan manual lewat tombol Analisis.
const QUICK_EXAMPLES = {
  politik: 'Pemerintah resmi melarang penggunaan plastik sekali pakai mulai tahun depan.',
  kesehatan: 'Minum air lemon setiap pagi terbukti membakar lemak lebih cepat daripada olahraga apapun.',
  misinformasi: 'BREAKING: Ilmuwan mengonfirmasi microchip 5G ditanam lewat vaksin, sebar sebelum dihapus!',
  sosmed: 'Katanya sih tetangga gue baru menang lotre miliaran, langsung pindah rumah dalam semalam.',
};

// Definisi tetap untuk 5 kategori (title + icon selalu sama, cuma
// badge/badgeTone/desc yang datang dari hasil analisis AI).
const CATEGORY_META = {
  fakta: {
    title: 'Cek Fakta',
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.4"/><path d="M10.8 10.8L14 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  },
  framing: {
    title: 'Deteksi Framing',
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2.5" y="2.5" width="11" height="11" rx="2.4" stroke="currentColor" stroke-width="1.3"/><rect x="5.3" y="5.3" width="5.4" height="5.4" rx="1.2" stroke="currentColor" stroke-width="1.1"/></svg>',
  },
  logika: {
    title: 'Analisis Logika',
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 2C5.79 2 4 3.79 4 6C4 7.48 4.8 8.76 6 9.45V11C6 11.28 6.22 11.5 6.5 11.5H9.5C9.78 11.5 10 11.28 10 11V9.45C11.2 8.76 12 7.48 12 6C12 3.79 10.21 2 8 2Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.5 13.5H9.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  },
  provokasi: {
    title: 'Provokasi / Opini',
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.5 5.5C2.5 4.4 3.4 3.5 4.5 3.5H8.5L13 1V13L8.5 11.5H4.5C3.4 11.5 2.5 10.6 2.5 9.5V5.5Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
  },
  konteks: {
    title: 'Analisis Konteks',
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2.5" y="2.5" width="11" height="11" rx="2.4" stroke="currentColor" stroke-width="1.3"/><path d="M5.3 8H10.7M5.3 5.5H10.7M5.3 10.5H8.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>',
  },
};

async function requestAnalysis(text) {
  const config = window.ContentSenseConfig || {};
  const url = config.SUPABASE_FUNCTION_URL;
  const anonKey = config.SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error('URL Edge Function belum diisi di js/config.js');
  }
  if (!anonKey || anonKey.includes('PASTE_ANON_PUBLIC_KEY')) {
    throw new Error('Anon key Supabase belum diisi di js/config.js');
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ text }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Gagal menganalisis teks.');
  }
  return data;
}

document.addEventListener('DOMContentLoaded', () => {
  const textarea = document.getElementById('text-input');
  const charCount = document.getElementById('char-count');
  const analyzeBtn = document.getElementById('analyze-btn');

  // Chip contoh cepat — isi textarea dengan teks contoh sesuai kategori.
  document.querySelectorAll('.chip[data-example]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const example = QUICK_EXAMPLES[chip.dataset.example];
      if (!example) return;
      textarea.value = example;
      textarea.focus();
      if (charCount) charCount.textContent = textarea.value.length;
    });
  });

  analyzeBtn.addEventListener('click', () => {
    // Tombol analisis dipakai bersama semua mode — hanya jalan kalau
    // mode aktif saat ini adalah "text".
    if (analyzeBtn.dataset.mode !== 'text') return;

    const value = textarea.value.trim();
    if (!value) {
      alert('Tempel atau ketik teks terlebih dahulu.');
      return;
    }

    const labelEl = analyzeBtn.querySelector('.btn-label') || analyzeBtn;
    const originalText = labelEl.textContent;
    analyzeBtn.disabled = true;
    labelEl.textContent = 'Menganalisis...';

    requestAnalysis(value)
      .then((result) => {
        const categories = (result.categories || []).map((cat) => ({
          ...cat,
          title: CATEGORY_META[cat.key]?.title || cat.key,
          icon: CATEGORY_META[cat.key]?.icon || '',
        }));

        window.ContentSense.renderAnalysisResult({
          quote: result.quote,
          source: result.source,
          score: result.score,
          scoreTone: result.scoreTone,
          scoreStatus: result.scoreStatus,
          categories,
          summary: result.summary,
        });
      })
      .catch((err) => {
        console.error(err);
        alert(err.message || 'Terjadi kesalahan saat menganalisis teks. Coba lagi.');
      })
      .finally(() => {
        analyzeBtn.disabled = false;
        labelEl.textContent = originalText;
      });
  });
});
