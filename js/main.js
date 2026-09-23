// Content Sense — main.js
// Logic umum yang dipakai di seluruh halaman (nav, util bersama).

/**
 * Util: tampilkan panel hasil analisis di dalam sebuah card.
 * Dipakai bareng oleh analyze-video.js, analyze-photo.js, analyze-text.js
 * supaya format hasilnya konsisten.
 *
 * @param {HTMLElement} resultEl - elemen .result di dalam card terkait
 * @param {string} title - judul hasil, misal "Hasil Analisis Video"
 * @param {string} html - isi body hasil (boleh HTML sederhana)
 */
function renderResult(resultEl, title, html) {
  resultEl.innerHTML = `
    <b>${title}</b>
    ${html}
    <span class="badge-placeholder">Contoh hasil — belum tersambung AI</span>
  `;
  resultEl.classList.add('show');
}

/**
 * Util: simulasikan proses analisis yang butuh waktu (loading state),
 * supaya UI kerasa hidup sebelum backend/AI beneran disambungkan.
 *
 * @param {HTMLButtonElement} buttonEl
 * @param {string} loadingText
 * @param {() => void} onDone - callback dipanggil setelah delay selesai
 */
function simulateProcessing(buttonEl, loadingText, onDone) {
  const originalText = buttonEl.textContent;
  buttonEl.disabled = true;
  buttonEl.textContent = loadingText;

  setTimeout(() => {
    buttonEl.disabled = false;
    buttonEl.textContent = originalText;
    onDone();
  }, 1200);
}

// Ekspor ke window supaya bisa dipakai file js lain tanpa module bundler.
window.ContentSense = { renderResult, simulateProcessing };
