// Content Sense — analyze-photo.js
// Upload maks 5 gambar / total 30MB, dikirim sekaligus (multipart/form-data,
// field "images") ke Edge Function analyze-photo. Tool sekali pakai — file
// tidak disimpan, cuma diproses lalu hasilnya ditampilkan.

const PHOTO_CATEGORY_META = {
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

const MAX_PHOTO_FILES = 5;
const MAX_PHOTO_TOTAL_BYTES = 30 * 1024 * 1024; // 30 MB

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function requestPhotoAnalysis(files) {
  const config = window.ContentSenseConfig || {};
  const endpoint = config.SUPABASE_PHOTO_FUNCTION_URL;
  const anonKey = config.SUPABASE_ANON_KEY;

  if (!endpoint) {
    throw new Error('URL Edge Function analyze-photo belum diisi di js/config.js');
  }
  if (!anonKey || anonKey.includes('PASTE_ANON_PUBLIC_KEY')) {
    throw new Error('Anon key Supabase belum diisi di js/config.js');
  }

  const formData = new FormData();
  files.forEach((file) => formData.append('images', file, file.name));

  // Sengaja TIDAK set header Content-Type manual — browser yang mengisi
  // boundary multipart secara otomatis.
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`,
    },
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Gagal menganalisis gambar.');
  }
  return data;
}

document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('photo-drop');
  const fileInput = document.getElementById('photo-input');
  const analyzeBtn = document.getElementById('analyze-btn');
  const listEl = document.getElementById('photo-file-list');

  let selectedFiles = [];

  function renderFileList() {
    if (!listEl) return;

    if (selectedFiles.length === 0) {
      listEl.innerHTML = '';
      dropZone.innerHTML = `
        <div>
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M13 17V6M13 6L8.5 10.5M13 6L17.5 10.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M5 17V19.5C5 20.6 5.9 21.5 7 21.5H19C20.1 21.5 21 20.6 21 19.5V17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
          <strong>Klik atau seret gambar ke sini</strong>
          JPG, PNG, WEBP &middot; Maks. 5 gambar, total 30 MB
        </div>
      `;
      return;
    }

    const totalBytes = selectedFiles.reduce((sum, f) => sum + f.size, 0);
    dropZone.innerHTML = `
      <div>
        <strong class="filename">${selectedFiles.length} gambar dipilih</strong>
        ${formatBytes(totalBytes)} dari maks 30 MB &middot; Klik untuk tambah lagi
      </div>
    `;

    listEl.innerHTML = selectedFiles
      .map((file, index) => `
        <li class="photo-file-item" data-index="${index}">
          <span class="photo-file-name">${file.name}</span>
          <span class="photo-file-size">${formatBytes(file.size)}</span>
          <button type="button" class="photo-file-remove" data-index="${index}" aria-label="Hapus ${file.name}">&times;</button>
        </li>
      `)
      .join('');

    listEl.querySelectorAll('.photo-file-remove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.index);
        selectedFiles.splice(idx, 1);
        renderFileList();
      });
    });
  }

  function addFiles(newFiles) {
    for (const file of newFiles) {
      if (!file.type.startsWith('image/')) continue;
      if (selectedFiles.length >= MAX_PHOTO_FILES) {
        alert(`Maksimal ${MAX_PHOTO_FILES} gambar per analisis.`);
        break;
      }
      const currentTotal = selectedFiles.reduce((sum, f) => sum + f.size, 0);
      if (currentTotal + file.size > MAX_PHOTO_TOTAL_BYTES) {
        alert('Total ukuran gambar melebihi batas 30 MB.');
        break;
      }
      selectedFiles.push(file);
    }
    renderFileList();
  }

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
      addFiles(Array.from(e.dataTransfer.files));
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      addFiles(Array.from(fileInput.files));
      fileInput.value = ''; // reset supaya bisa pilih file yang sama lagi kalau perlu
    }
  });

  analyzeBtn.addEventListener('click', () => {
    if (analyzeBtn.dataset.mode !== 'photo') return;

    if (selectedFiles.length === 0) {
      alert('Upload minimal 1 gambar terlebih dahulu.');
      return;
    }

    const labelEl = analyzeBtn.querySelector('.btn-label') || analyzeBtn;
    const originalText = labelEl.textContent;
    analyzeBtn.disabled = true;
    labelEl.textContent = 'Menganalisis...';

    requestPhotoAnalysis(selectedFiles)
      .then((result) => {
        const categories = (result.categories || []).map((cat) => ({
          ...cat,
          title: PHOTO_CATEGORY_META[cat.key]?.title || cat.key,
          icon: PHOTO_CATEGORY_META[cat.key]?.icon || '',
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
        alert(err.message || 'Terjadi kesalahan saat menganalisis gambar. Coba lagi.');
      })
      .finally(() => {
        analyzeBtn.disabled = false;
        labelEl.textContent = originalText;
      });
  });
});
