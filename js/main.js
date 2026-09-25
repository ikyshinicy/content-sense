// Content Sense — main.js
// Logic umum yang dipakai di seluruh halaman (util bersama untuk render hasil).

/**
 * Util: tampilkan panel hasil analisis di dalam output panel.
 * Dipakai bareng oleh analyze-text.js (dan nanti analyze-url.js,
 * analyze-photo.js, analyze-video.js) supaya format hasilnya konsisten.
 *
 * @param {string} title - judul hasil, misal "Hasil Analisis Teks"
 * @param {string} html - isi body hasil (boleh HTML sederhana)
 */
function renderResult(title, html) {
  const outputBody = document.getElementById('output-body');
  outputBody.classList.remove('output-empty-state');
  outputBody.innerHTML = `
    <div class="output-result">
      <b>${title}</b>
      ${html}
      <span class="badge-placeholder">Contoh hasil — belum tersambung AI</span>
    </div>
  `;
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
