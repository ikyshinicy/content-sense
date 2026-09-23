// Content Sense — analyze-video.js
// PLACEHOLDER: belum tersambung ke AI. Ganti bagian yang ditandai TODO
// saat backend/AI analisis video sudah siap.

document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('video-drop');
  const fileInput = document.getElementById('video-input');
  const button = document.getElementById('video-analyze-btn');
  const resultEl = document.getElementById('video-result');

  let selectedFile = null;

  // Klik drop zone -> buka file picker
  dropZone.addEventListener('click', () => fileInput.click());

  // Drag & drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      handleFile(fileInput.files[0]);
    }
  });

  function handleFile(file) {
    selectedFile = file;
    dropZone.innerHTML = `<div><strong class="filename">${file.name}</strong>Klik untuk ganti video</div>`;
  }

  button.addEventListener('click', () => {
    if (!selectedFile) {
      alert('Pilih video terlebih dahulu.');
      return;
    }

    // TODO: ganti simulasi ini dengan panggilan API analisis video sungguhan.
    // Contoh nanti: upload `selectedFile` ke endpoint backend, lalu render
    // hasil asli (klaim, framing, provokasi, dsb) ke `resultEl`.
    window.ContentSense.simulateProcessing(button, 'Menganalisis...', () => {
      window.ContentSense.renderResult(
        resultEl,
        'Hasil Analisis Video',
        `<p>File: <b>${selectedFile.name}</b></p>
         <p>Narasi: netral · Framing: tidak terdeteksi kuat · Klaim: 2 klaim ditemukan (belum diverifikasi)</p>`
      );
    });
  });
});
