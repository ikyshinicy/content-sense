// Content Sense — analyze-text.js
// PLACEHOLDER: belum tersambung ke AI. Ganti bagian yang ditandai TODO
// saat backend/AI analisis teks sudah siap.

document.addEventListener('DOMContentLoaded', () => {
  const textarea = document.getElementById('text-input');
  const button = document.getElementById('text-analyze-btn');
  const resultEl = document.getElementById('text-result');

  button.addEventListener('click', () => {
    const value = textarea.value.trim();
    if (!value) {
      alert('Tempel teks terlebih dahulu.');
      return;
    }

    // TODO: ganti simulasi ini dengan panggilan API analisis teks sungguhan
    // (kirim `value` ke endpoint backend, lalu render hasil fact-check,
    // deteksi bias/framing, dan logical fallacy yang asli).
    window.ContentSense.simulateProcessing(button, 'Menganalisis...', () => {
      const wordCount = value.split(/\s+/).filter(Boolean).length;
      window.ContentSense.renderResult(
        resultEl,
        'Hasil Analisis Teks',
        `<p>Jumlah kata: <b>${wordCount}</b></p>
         <p>Nada: netral · Bias terdeteksi: rendah · Fallacy: tidak ditemukan</p>`
      );
    });
  });
});
