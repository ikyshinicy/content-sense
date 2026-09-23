// Content Sense — analyze-photo.js
// PLACEHOLDER: belum tersambung ke AI. Ganti bagian yang ditandai TODO
// saat backend/AI analisis foto sudah siap.

document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('photo-drop');
  const fileInput = document.getElementById('photo-input');
  const button = document.getElementById('photo-analyze-btn');
  const resultEl = document.getElementById('photo-result');

  let selectedFile = null;

  dropZone.addEventListener('click', () => fileInput.click());

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
    dropZone.innerHTML = `<div><strong class="filename">${file.name}</strong>Klik untuk ganti foto</div>`;
  }

  button.addEventListener('click', () => {
    if (!selectedFile) {
      alert('Pilih foto terlebih dahulu.');
      return;
    }

    // TODO: ganti simulasi ini dengan panggilan API analisis gambar sungguhan
    // (misal: reverse image search, deteksi manipulasi, cek konteks asal foto).
    window.ContentSense.simulateProcessing(button, 'Menganalisis...', () => {
      window.ContentSense.renderResult(
        resultEl,
        'Hasil Analisis Foto',
        `<p>File: <b>${selectedFile.name}</b></p>
         <p>Indikasi manipulasi: rendah · Konteks asal: belum terverifikasi</p>`
      );
    });
  });
});
