// Content Sense — analyze-url.js
// SEGERA HADIR: mode URL belum aktif di MVP ini (input masih disabled
// di index.html). Logic-nya disiapkan di sini supaya tinggal
// diaktifkan begitu backend fetch+analisis link sudah siap.

document.addEventListener('DOMContentLoaded', () => {
  const urlInput = document.getElementById('url-input');
  const analyzeBtn = document.getElementById('analyze-btn');

  analyzeBtn.addEventListener('click', () => {
    if (analyzeBtn.dataset.mode !== 'url') return;

    // TODO: aktifkan mode ini (hapus atribut `disabled` di index.html),
    // lalu ganti blok ini dengan: fetch konten dari `urlInput.value`
    // (artikel/postingan/video), baru kirim ke API analisis.
    alert('Mode analisis URL segera hadir.');
  });
});
