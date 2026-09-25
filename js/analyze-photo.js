// Content Sense — analyze-photo.js
// SEGERA HADIR: mode Foto belum aktif di MVP ini (input masih disabled
// di index.html). Logic upload/drag-drop disiapkan di sini supaya
// tinggal diaktifkan begitu backend/AI analisis foto sudah siap.

document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('photo-drop');
  const fileInput = document.getElementById('photo-input');
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
    dropZone.innerHTML = `<div><strong class="filename">${file.name}</strong>Klik untuk ganti foto</div>`;
  }

  analyzeBtn.addEventListener('click', () => {
    if (analyzeBtn.dataset.mode !== 'photo') return;

    if (!selectedFile) {
      alert('Mode analisis Foto segera hadir.');
      return;
    }

    // TODO: aktifkan mode ini (hapus atribut `disabled` di index.html),
    // lalu ganti blok ini dengan panggilan API analisis gambar sungguhan
    // (reverse image search, deteksi manipulasi, cek konteks asal foto).
    // Placeholder: mode ini belum aktif, jadi belum memanggil
    // window.ContentSense.renderAnalysisResult sungguhan.
    window.ContentSense.simulateProcessing(analyzeBtn, 'Menganalisis...', () => {
      alert(`Mode analisis Foto segera hadir. (File terpilih: ${selectedFile.name})`);
    });
  });
});
