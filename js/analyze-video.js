// Content Sense — analyze-video.js
// SEGERA HADIR: mode Video belum aktif di MVP ini (input masih disabled
// di index.html). Logic upload/drag-drop disiapkan di sini supaya
// tinggal diaktifkan begitu backend/AI analisis video sudah siap.

document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('video-drop');
  const fileInput = document.getElementById('video-input');
  const analyzeBtn = document.getElementById('analyze-btn');

  let selectedFile = null;

  dropZone.addEventListener('click', () => {
    if (fileInput.disabled) return;
    fileInput.click();
  });

  dropZone.addEventListener('dragover', (e) => {
    if (fileInput.disabled) return;
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });
  dropZone.addEventListener('drop', (e) => {
    if (fileInput.disabled) return;
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

  analyzeBtn.addEventListener('click', () => {
    if (analyzeBtn.dataset.mode !== 'video') return;

    if (!selectedFile) {
      alert('Mode analisis Video segera hadir.');
      return;
    }

    // TODO: aktifkan mode ini (hapus atribut `disabled` di index.html),
    // lalu ganti blok ini dengan: upload `selectedFile` ke endpoint
    // backend, lalu render hasil asli (klaim, framing, provokasi, dsb).
    window.ContentSense.simulateProcessing(analyzeBtn, 'Menganalisis...', () => {
      window.ContentSense.renderResult(
        'Hasil Analisis Video',
        `<p>File: <b>${selectedFile.name}</b></p>
         <p>Narasi: netral &middot; Framing: tidak terdeteksi kuat &middot; Klaim: 2 klaim ditemukan (belum diverifikasi)</p>`
      );
    });
  });
});
