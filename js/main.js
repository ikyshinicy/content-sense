// Content Sense — main.js
// Logic umum yang dipakai di seluruh halaman (util bersama untuk render hasil
// dan inisialisasi elemen UI umum: char counter, banner asset, tombol aksi).

/**
 * Util: simulasikan proses analisis yang butuh waktu (loading state),
 * supaya UI kerasa hidup sebelum backend/AI beneran disambungkan.
 * Hanya mengganti teks di dalam elemen label (.btn-label), bukan seluruh
 * isi tombol, supaya ikon svg di dalam tombol tidak ikut terhapus.
 *
 * @param {HTMLButtonElement} buttonEl
 * @param {string} loadingText
 * @param {() => void} onDone - callback dipanggil setelah delay selesai
 */
function simulateProcessing(buttonEl, loadingText, onDone) {
  const labelEl = buttonEl.querySelector('.btn-label') || buttonEl;
  const originalText = labelEl.textContent;
  buttonEl.disabled = true;
  labelEl.textContent = loadingText;

  setTimeout(() => {
    buttonEl.disabled = false;
    labelEl.textContent = originalText;
    onDone();
  }, 1200);
}

/**
 * Util: render kartu hasil analisis lengkap (klaim, gauge kepercayaan,
 * 5 kategori, ringkasan) ke dalam output panel.
 *
 * @param {object} data
 * @param {string} data.quote - kutipan/klaim yang dianalisis
 * @param {string} data.source - label sumber, misal "Contoh teks yang kamu tempel"
 * @param {number} data.score - 0-100, tingkat kepercayaan klaim
 * @param {string} data.scoreStatus - label status gauge, misal "Perlu Verifikasi"
 * @param {Array<{key:string, title:string, badge:string, badgeTone:string, desc:string}>} data.categories
 * @param {string} data.summary - ringkasan analisis
 */
function renderAnalysisResult(data) {
  const outputBody = document.getElementById('output-body');

  const categoriesHtml = data.categories.map((cat) => `
    <div class="cat-card">
      <div class="cat-icon">${cat.icon}</div>
      <b>${cat.title}</b>
      <span class="cat-badge cat-badge-${cat.badgeTone}">${cat.badge}</span>
      <p>${cat.desc}</p>
      <a href="#" class="cat-detail" data-cat="${cat.key}">Lihat Detail
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 5.5H9M9 5.5L6 2.5M9 5.5L6 8.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </a>
    </div>
  `).join('');

  outputBody.innerHTML = `
    <div class="output-result">
      <div class="result-claim">
        <div class="result-claim-media" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="16" height="14" rx="2.2" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="9" r="1.6" stroke="currentColor" stroke-width="1.2"/><path d="M4 15L8 11.5L11 13.8L14 10.5L18 14.5" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
        </div>
        <div class="result-claim-text">
          <p class="claim-quote">&ldquo;${data.quote}&rdquo;</p>
          <span class="claim-source">Sumber: ${data.source}</span>
        </div>
        <div class="result-gauge">
          <span class="gauge-label">Tingkat Kepercayaan Klaim</span>
          <div class="gauge-circle" style="--val:${data.score}%">
            <div class="gauge-inner">${data.score}%</div>
          </div>
          <span class="cat-badge cat-badge-${data.scoreTone}">${data.scoreStatus}</span>
        </div>
      </div>

      <div class="result-categories">
        ${categoriesHtml}
      </div>

      <div class="result-summary">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 4.5C3 4.5 5 3.5 8 3.5C9.5 3.5 10.5 4 10.5 4V15.5C10.5 15.5 9.5 15 8 15C5 15 3 16 3 16V4.5Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M15 4.5C15 4.5 13 3.5 10.5 3.5C10.5 3.5 10.5 4 10.5 4V15.5C10.5 15.5 10.5 15 10.5 15C13 15 15 16 15 16V4.5Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
        <div>
          <b>Ringkasan Analisis</b>
          <p>${data.summary}</p>
        </div>
      </div>

      <span class="badge-placeholder">Contoh hasil — belum tersambung AI</span>
    </div>
  `;

  document.querySelectorAll('.output-actions .btn-ghost').forEach((btn) => {
    btn.disabled = false;
  });
}

/** Util: kembalikan output panel ke kondisi kosong (belum ada hasil). */
function resetOutputPanel() {
  const outputBody = document.getElementById('output-body');
  outputBody.innerHTML = `
    <div class="output-empty">
      <svg width="34" height="34" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="15" cy="15" r="9" stroke="currentColor" stroke-width="1.6"/>
        <path d="M21.5 21.5L26.5 26.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      </svg>
      <p>Hasil analisis akan muncul di sini setelah kamu menekan tombol Analisis.</p>
    </div>
  `;
  document.querySelectorAll('.output-actions .btn-ghost').forEach((btn) => {
    btn.disabled = true;
  });
}

// Ekspor ke window supaya bisa dipakai file js lain tanpa module bundler.
window.ContentSense = { simulateProcessing, renderAnalysisResult, resetOutputPanel };

document.addEventListener('DOMContentLoaded', () => {
  // Counter karakter untuk textarea teks.
  const textInput = document.getElementById('text-input');
  const charCount = document.getElementById('char-count');
  if (textInput && charCount) {
    textInput.addEventListener('input', () => {
      charCount.textContent = textInput.value.length;
    });
  }

  // Tombol "Analisis Ulang" mengembalikan panel hasil ke kondisi kosong.
  const btnUlang = document.getElementById('btn-ulang');
  if (btnUlang) {
    btnUlang.addEventListener('click', () => {
      if (btnUlang.disabled) return;
      resetOutputPanel();
    });
  }

  // Bagikan & Unduh PDF belum tersambung backend — beri tahu user.
  ['btn-bagikan', 'btn-pdf'].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        alert('Fitur ini masih dalam pengembangan — segera hadir.');
      });
    }
  });
});
