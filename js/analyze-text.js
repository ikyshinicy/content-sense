// Content Sense — analyze-text.js
// PLACEHOLDER: belum tersambung ke AI. Ganti bagian yang ditandai TODO
// saat backend/AI analisis teks sudah siap.

document.addEventListener('DOMContentLoaded', () => {
  const textarea = document.getElementById('text-input');
  const analyzeBtn = document.getElementById('analyze-btn');

  analyzeBtn.addEventListener('click', () => {
    // Tombol analisis dipakai bersama semua mode — hanya jalan kalau
    // mode aktif saat ini adalah "text".
    if (analyzeBtn.dataset.mode !== 'text') return;

    const value = textarea.value.trim();
    if (!value) {
      alert('Tempel teks terlebih dahulu.');
      return;
    }

    // TODO: ganti simulasi ini dengan panggilan API analisis teks sungguhan
    // (kirim `value` ke endpoint backend, lalu render hasil fact-check,
    // deteksi bias/framing, dan logical fallacy yang asli).
    window.ContentSense.simulateProcessing(analyzeBtn, 'Menganalisis...', () => {
      const wordCount = value.split(/\s+/).filter(Boolean).length;
      window.ContentSense.renderResult(
        'Hasil Analisis Teks',
        `<p>Jumlah kata: <b>${wordCount}</b></p>
         <p>Nada: netral &middot; Bias terdeteksi: rendah &middot; Fallacy: tidak ditemukan</p>`
      );
    });
  });
});
