// Content Sense — mode-toggle.js
// Mengatur perpindahan antar mode input (Teks / URL / Foto / Video)
// dan menyesuaikan label tombol analisis + deskripsi sesuai mode aktif.

const CONTENT_SENSE_MODES = {
  text: {
    label: 'Teks',
    desc: 'Tempel teks, caption, atau transkrip untuk dianalisis fakta, bias, framing, dan logikanya.',
    buttonText: 'Analisis Teks',
  },
  url: {
    label: 'URL',
    desc: 'Tempel link artikel, postingan, atau video untuk dianalisis. Segera hadir.',
    buttonText: 'Analisis URL',
  },
  photo: {
    label: 'Foto',
    desc: 'Unggah gambar untuk mengecek konteks, manipulasi visual, dan klaim yang menyertainya. Segera hadir.',
    buttonText: 'Analisis Foto',
  },
  video: {
    label: 'Video',
    desc: 'Unggah video untuk menganalisis narasi, framing, provokasi, konteks, dan klaim. Segera hadir.',
    buttonText: 'Analisis Video',
  },
};

document.addEventListener('DOMContentLoaded', () => {
  const modeButtons = document.querySelectorAll('.mode-btn');
  const modeBodies = document.querySelectorAll('[data-mode-body]');
  const modeDesc = document.getElementById('mode-desc');
  const analyzeBtn = document.getElementById('analyze-btn');

  function setActiveMode(mode) {
    modeButtons.forEach((btn) => {
      const isActive = btn.dataset.mode === mode;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    modeBodies.forEach((body) => {
      body.classList.toggle('active', body.dataset.modeBody === mode);
    });

    const config = CONTENT_SENSE_MODES[mode];
    modeDesc.textContent = config.desc;
    analyzeBtn.textContent = config.buttonText;
    analyzeBtn.dataset.mode = mode;
  }

  modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      setActiveMode(btn.dataset.mode);
    });
  });

  // Mode default saat halaman dibuka.
  setActiveMode('text');
});
