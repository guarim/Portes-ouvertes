/**
 * pageBuilder.js
 * Construit dynamiquement le contenu de chaque page
 * depuis pages.json, puis initialise le hand-tracker.
 */

import HandTracker from './handTracker.js';

/* ── Chargement du JSON ─────────────────────────────────────── */
async function loadPagesConfig() {
  const resp = await fetch('pages.json');
  return resp.json();
}

/* ── Utilitaire : trouve la config par nom de fichier ─────── */
function findPage(config, filename) {
  return config.pages.find(p => p.file === filename) || null;
}

/* ── Éléments communs de toute page ──────────────────────── */
function injectCommonElements() {
  // Curseur main
  let cursor = document.getElementById('hand-cursor');
  if (!cursor) {
    cursor = document.createElement('div');
    cursor.id = 'hand-cursor';
    document.body.appendChild(cursor);
  }
  // Vidéo + canvas webcam
  ['webcam-video','webcam-canvas'].forEach(id => {
    if (!document.getElementById(id)) {
      const el = document.createElement(id === 'webcam-video' ? 'video' : 'canvas');
      el.id = id; el.width = 200; el.height = 113;
      if (id === 'webcam-video') { el.autoplay = true; el.playsInline = true; el.muted = true; }
      document.body.appendChild(el);
    }
  });
  // Status
  if (!document.getElementById('hand-status')) {
    const s = document.createElement('div');
    s.id = 'hand-status'; s.textContent = '⏳ Chargement…';
    document.body.appendChild(s);
  }
  // Toast
  if (!document.getElementById('gesture-toast')) {
    const t = document.createElement('div');
    t.id = 'gesture-toast';
    document.body.appendChild(t);
  }
}

/* ── Header commun ─────────────────────────────────────────── */
function buildHeader(title, showBack = true) {
  const hdr = document.createElement('header');
  hdr.className = 'page-header fade-in';
  const titleParts = title.split(' – ');
  const mainTitle = titleParts[0];
  const sub       = titleParts[1] ? ` – <span>${titleParts[1]}</span>` : '';
  hdr.innerHTML = `
    <h1>${mainTitle}${sub}</h1>
    ${showBack ? `<button class="back-btn" onclick="history.back()">← Retour</button>` : ''}
  `;
  return hdr;
}

/* ── Décoration coins ──────────────────────────────────────── */
function buildDeco() {
  const svgTL = `<svg width="180" height="180" viewBox="0 0 180 180"><polyline points="0,180 0,0 180,0" fill="none" stroke="#1a6fc4" stroke-width="2"/><polyline points="20,180 20,20 180,20" fill="none" stroke="#e8a020" stroke-width="1"/></svg>`;
  const svgBR = `<svg width="180" height="180" viewBox="0 0 180 180"><polyline points="180,0 180,180 0,180" fill="none" stroke="#1a6fc4" stroke-width="2"/><polyline points="160,0 160,160 0,160" fill="none" stroke="#e8a020" stroke-width="1"/></svg>`;
  const tl = document.createElement('div'); tl.className = 'deco-corner deco-tl'; tl.innerHTML = svgTL;
  const br = document.createElement('div'); br.className = 'deco-corner deco-br'; br.innerHTML = svgBR;
  document.body.appendChild(tl);
  document.body.appendChild(br);
}

/* ================================================================
   RENDERERS PAR TYPE DE PAGE
   ================================================================ */

/* ── TYPE : accueil ────────────────────────────────────────── */
function renderAccueil(page) {
  document.title = page.title;
  const wrap = document.createElement('div');
  wrap.id = 'page-accueil';

  const paragraphs = page.text.split('\n\n').filter(Boolean)
    .map(p => `<p>${p}</p>`).join('');

  wrap.innerHTML = `
    <img src="${page.background}" alt="Lycée Jules Verne" class="accueil-bg">
    <div class="accueil-overlay"></div>
    <div class="accueil-content fade-in">
      <h1 class="accueil-title">
        Bienvenue au<br>
        <em>Lycée Professionnel<br>Jules Verne</em>
      </h1>
      <div class="accueil-text">${paragraphs}</div>
      <div class="accueil-countdown">
        <div class="countdown-bar"><div class="countdown-fill"></div></div>
        <span class="countdown-label">Redirection automatique…</span>
      </div>
    </div>
  `;
  document.body.prepend(wrap);

  // Auto-redirect
  if (page.autoRedirect) {
    setTimeout(() => {
      window.location.href = page.autoRedirect.to;
    }, page.autoRedirect.delay);
  }
}

/* ── TYPE : gallery ────────────────────────────────────────── */
function renderGallery(page) {
  document.title = page.title;
  const wrap = document.createElement('div');
  wrap.id = 'page-galerie';
  wrap.innerHTML = `
    <div class="galerie-grid-wrapper">
      <div class="galerie-grid cols-${page.layout.cols} rows-${page.layout.rows}"></div>
    </div>
  `;
  document.body.prepend(wrap);
  document.body.insertBefore(buildHeader(page.title, true), wrap);

  const grid = wrap.querySelector('.galerie-grid');
  page.images.forEach((img, i) => {
    const item = document.createElement('div');
    item.className = 'galerie-item fade-in';
    item.style.animationDelay = (i * 0.07) + 's';
    item.dataset.link = img.link;
    item.innerHTML = `
      <img src="${img.src}" alt="${img.alt}" loading="lazy">
      <div class="item-overlay"></div>
    `;
    item.addEventListener('click', () => { window.location.href = img.link; });
    grid.appendChild(item);
  });

  return grid; // retourné pour le hand-tracker
}

/* ── TYPE : detail (image + vidéo) ─────────────────────────── */
function renderDetail(page) {
  document.title = page.title;
  const wrap = document.createElement('div');
  wrap.id = 'page-detail';

  const videoSrc = page.video.youtube;

  wrap.innerHTML = `
    <div class="detail-body fade-in">
      <div class="detail-image-side">
        <img src="${page.image.src}" alt="${page.image.alt}">
      </div>
      <div class="detail-video-side" id="video-side">
        <div class="video-placeholder">
          <div class="play-icon">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
          <span class="play-label">Cliquer pour lancer la vidéo</span>
        </div>
        <iframe id="yt-iframe" src="" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
      </div>
    </div>
    <!-- Overlay plein écran vidéo -->
    <div class="video-fullscreen-overlay" id="video-overlay">
      <button class="close-video-btn" id="close-video">✕</button>
      <iframe id="yt-fullscreen" src="" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
    </div>
  `;
  document.body.prepend(wrap);
  document.body.insertBefore(buildHeader(page.title, true), wrap);

  // Gestion vidéo
  const videoSide = document.getElementById('video-side');
  const iframe    = document.getElementById('yt-iframe');
  const overlay   = document.getElementById('video-overlay');
  const fsIframe  = document.getElementById('yt-fullscreen');
  const closeBtn  = document.getElementById('close-video');

  const autoplay = videoSrc + '?autoplay=1&rel=0&enablejsapi=1';

  function openVideo() {
    fsIframe.src = autoplay;
    overlay.classList.add('active');
  }
  function closeVideo() {
    fsIframe.src = '';
    overlay.classList.remove('active');
    videoSide.classList.remove('playing');
    iframe.src = '';
  }

  videoSide.addEventListener('click', openVideo);
  closeBtn.addEventListener('click', closeVideo);

  // Fermeture si iframe envoie message de fin (postMessage YouTube)
  window.addEventListener('message', (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.event === 'onStateChange' && data.info === 0) closeVideo(); // 0 = ended
    } catch {}
  });
}

/* ── TYPE : single-image (CDI) ─────────────────────────────── */
function renderSingleImage(page) {
  document.title = page.title;
  const wrap = document.createElement('div');
  wrap.id = 'page-single-image';

  wrap.innerHTML = `
    <div class="single-image-body">
      <div class="single-image-wrapper fade-in" id="single-img-wrap">
        <img src="${page.image.src}" alt="${page.image.alt}">
      </div>
    </div>
  `;
  document.body.prepend(wrap);
  document.body.insertBefore(buildHeader(page.title, true), wrap);

  if (page.image.clickable && page.image.link) {
    const imgWrap = document.getElementById('single-img-wrap');
    imgWrap.style.cursor = 'pointer';
    imgWrap.addEventListener('click', () => {
      if (page.image.external) window.open(page.image.link, '_blank');
      else window.location.href = page.image.link;
    });
    imgWrap.dataset.link = page.image.link;
    imgWrap.dataset.external = page.image.external ? '1' : '0';
  }
}

/* ================================================================
   HAND-TRACKER INTÉGRATION
   ================================================================ */
function setupHandTracker(pageType) {

  const clickableSelector = (() => {
    if (pageType === 'gallery')      return '.galerie-item';
    if (pageType === 'single-image') return '.single-image-wrapper';
    if (pageType === 'detail')       return '#video-side';
    return null;
  })();

  /* Hover visuel via curseur main */
  function onCursorMove(x, y, visible) {
    if (!clickableSelector) return;
    const items = document.querySelectorAll(clickableSelector);
    items.forEach(el => {
      if (!visible) { el.classList.remove('hovered'); return; }
      const r = el.getBoundingClientRect();
      const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      el.classList.toggle('hovered', inside);
    });
  }

  /* Pinch → action sur l'élément sous le curseur */
  function onPinchImage(x, y) {
    if (!clickableSelector) return;
    const items = document.querySelectorAll(clickableSelector);
    for (const el of items) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        if (el.dataset.link) {
          const ext = el.dataset.external === '1';
          if (ext) window.open(el.dataset.link, '_blank');
          else window.location.href = el.dataset.link;
        } else if (el.id === 'video-side') {
          el.click();
        }
        break;
      }
    }
  }

  /* Zoom gestuel (deux mains) */
  let zoomedEl = null;
  function onZoomChange(zoom) {
    if (pageType === 'gallery') {
      // Zoom sur l'image survolée ou la première visible
      const hovered = document.querySelector('.galerie-item.hovered') ||
                      document.querySelector('.galerie-item');
      if (!hovered) return;
      if (zoomedEl && zoomedEl !== hovered) {
        zoomedEl.style.transform = '';
        zoomedEl.style.zIndex    = '';
      }
      zoomedEl = hovered;
      if (zoom <= 1.01) {
        hovered.style.transform = '';
        hovered.style.zIndex    = '';
      } else {
        hovered.style.transform = `scale(${zoom})`;
        hovered.style.zIndex    = '20';
      }
    } else if (pageType === 'detail') {
      const img = document.querySelector('.detail-image-side img');
      if (!img) return;
      img.style.transform = zoom <= 1.01 ? '' : `scale(${zoom})`;
    } else if (pageType === 'single-image') {
      const w = document.querySelector('.single-image-wrapper');
      if (!w) return;
      w.style.transform = zoom <= 1.01 ? '' : `scale(${zoom})`;
    }
    HandTracker.showToast(zoom <= 1.01 ? '🔍 Zoom réinitialisé' : `🔍 Zoom ×${zoom.toFixed(1)}`);
  }

  /* Poing → retour */
  function onGoBack() {
    history.back();
  }

  HandTracker.init({ onCursorMove, onPinchImage, onZoomChange, onGoBack });
}

/* ================================================================
   INIT GLOBALE
   ================================================================ */
async function init() {
  injectCommonElements();
  buildDeco();

  const config   = await loadPagesConfig();
  const filename = location.pathname.split('/').pop() || 'index.html';
  const pageConf = findPage(config, filename);

  if (!pageConf) {
    document.body.innerHTML = `<p style="color:red;padding:2rem">Page non trouvée dans pages.json : ${filename}</p>`;
    return;
  }

  switch (pageConf.type) {
    case 'accueil':      renderAccueil(pageConf);     break;
    case 'gallery':      renderGallery(pageConf);     break;
    case 'detail':       renderDetail(pageConf);      break;
    case 'single-image': renderSingleImage(pageConf); break;
  }

  setupHandTracker(pageConf.type);
}

document.addEventListener('DOMContentLoaded', init);
