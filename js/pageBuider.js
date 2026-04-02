/**
 * page-engine.js — Lycée Jules Verne
 * Lit pages.json et génère l'affichage selon le type de page.
 * Démarre les gestes automatiquement au chargement.
 */

class PageEngine {
  constructor() {
    this.pageData      = null;
    this.pagesConfig   = null;
    this.gestureEngine = null;
    this.currentZoom   = 1.0;

    this.currentFile = window.location.pathname.split('/').pop() || 'index.html';
    if (!this.currentFile.endsWith('.html')) this.currentFile = 'index.html';
  }

  async init() {
    try {
      const resp = await fetch('pages.json');
      this.pagesConfig = await resp.json();
      this.pageData = this.pagesConfig.pages.find(p => p.file === this.currentFile);
      if (!this.pageData) {
        document.body.innerHTML = `<h1 style="color:#fff;padding:2rem">Page non trouvée : ${this.currentFile}</h1>`;
        return;
      }
      document.title = this.pageData.title;
      this._render();
      this._startGestures();   // démarrage automatique
    } catch (err) {
      console.error('[PageEngine]', err);
    }
  }

  /* ================================================================
     RENDU
  ================================================================ */

  _render() {
    const main = document.getElementById('page-content');
    switch (this.pageData.type) {
      case 'home':         this._renderHome(main);        break;
      case 'grid':         this._renderGrid(main);        break;
      case 'detail_video': this._renderDetailVideo(main); break;
      case 'link_image':   this._renderLinkImage(main);   break;
      default: main.innerHTML = `<p style="color:#fff">Type inconnu : ${this.pageData.type}</p>`;
    }
  }

  _renderHome(c) {
    const { background, text, title, autoRedirect } = this.pageData;
    c.innerHTML = `
      <div class="home-wrapper" style="background-image:url('${background}')">
        <div class="home-overlay"></div>
        <div class="home-content">
          <h1 class="home-title">${title}</h1>
          <p class="home-text">${text.replace(/\n\n/g,'</p><p class="home-text">')}</p>
          ${autoRedirect ? `
            <div class="countdown-bar"><div class="countdown-fill" id="cdf"></div></div>
            <p class="countdown-text">Redirection dans <span id="cdn">${autoRedirect.delay/1000}</span>s</p>
          ` : ''}
        </div>
      </div>`;
    if (autoRedirect) {
      let rem = autoRedirect.delay / 1000;
      const tot = rem;
      const numEl  = document.getElementById('cdn');
      const fillEl = document.getElementById('cdf');
      const iv = setInterval(() => {
        rem--;
        if (numEl)  numEl.textContent  = rem;
        if (fillEl) fillEl.style.width = ((tot - rem) / tot * 100) + '%';
        if (rem <= 0) { clearInterval(iv); window.location.href = autoRedirect.target; }
      }, 1000);
    }
  }

  _renderGrid(c) {
    const { images, columns, title, back } = this.pageData;
    const cols    = columns || 3;
    const backBtn = back ? `<button class="back-btn" onclick="history.back()">← Retour</button>` : '';
    c.innerHTML = `
      <div class="page-header">${backBtn}<h1 class="page-title">${title}</h1></div>
      <div class="grid-container" style="--cols:${cols}">
        ${images.map((img, i) => `
          <div class="grid-item" data-index="${i}" data-link="${img.link}">
            <img src="${img.src}" alt="${img.alt||''}" class="grid-img" draggable="false"/>
            <div class="grid-caption">${img.alt||''}</div>
            <div class="grid-hover-overlay"><span class="pinch-icon">👌 Pincer pour ouvrir</span></div>
          </div>`).join('')}
      </div>`;
    c.querySelectorAll('.grid-item').forEach(item => {
      item.addEventListener('click', () => {
        if (item.dataset.link) window.location.href = item.dataset.link;
      });
    });
  }

  _renderDetailVideo(c) {
    const { title, image, video, back } = this.pageData;
    const backBtn  = back ? `<button class="back-btn" onclick="history.back()">← Retour</button>` : '';
    const videoId  = this._ytId(video);
    const embedUrl = videoId
      ? `https://www.youtube.com/embed/${videoId}?enablejsapi=1&rel=0`
      : video;
    c.innerHTML = `
      <div class="page-header">${backBtn}<h1 class="page-title">${title}</h1></div>
      <div class="detail-layout" id="detail-layout" data-mode="normal">
        <div class="detail-image-wrap" id="detail-image-wrap">
          <img src="${image.src}" alt="${image.alt||''}" class="detail-img" id="detail-img" draggable="false"/>
        </div>
        <div class="detail-video-wrap" id="detail-video-wrap">
          <div class="video-container" id="video-container">
            <div class="video-placeholder" id="video-placeholder">
              <div class="play-icon">▶</div>
              <p>Cliquez ou pincez pour lancer la vidéo</p>
            </div>
            <iframe id="video-iframe"
              src="${embedUrl}"
              frameborder="0"
              allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture"
              allowfullscreen
              style="display:none;width:100%;height:100%;"></iframe>
          </div>
          <div class="video-mode-hint" id="video-mode-hint"></div>
        </div>
      </div>`;
    // État de disposition : 'normal' | 'zoomed' | 'playing'
    this._layoutMode  = 'normal';
    this._videoPlaying = false;
    this._applyLayout('normal');
    this._setupVideo();
  }

  // Applique les flex-grow selon le mode
  _applyLayout(mode) {
    const layout   = document.getElementById('detail-layout');
    const imgWrap  = document.getElementById('detail-image-wrap');
    const vidWrap  = document.getElementById('detail-video-wrap');
    const hint     = document.getElementById('video-mode-hint');
    const img      = document.getElementById('detail-img');
    if (!layout || !imgWrap || !vidWrap) return;

    this._layoutMode = mode;

    // Supprimer les classes de mode précédentes
    layout.dataset.mode = mode;

    if (mode === 'normal') {
      imgWrap.style.flex = '4';   // 4/5
      vidWrap.style.flex = '1';   // 1/5
      if (img) { img.style.transform = 'scale(1)'; img.style.transition = 'transform 0.3s ease'; }
      if (hint) hint.textContent = '';
    } else if (mode === 'zoomed') {
      imgWrap.style.flex = '1';   // tout l'espace (vidéo à 0)
      vidWrap.style.flex = '0 0 0px';
      vidWrap.style.overflow = 'hidden';
      if (hint) hint.textContent = '';
    } else if (mode === 'playing') {
      imgWrap.style.flex = '1';   // 1/5
      vidWrap.style.flex = '4';   // 4/5
      vidWrap.style.overflow = '';
      if (hint) hint.textContent = '▶ Lecture en cours';
    }

    // Transition fluide
    imgWrap.style.transition = 'flex 0.4s cubic-bezier(0.4,0,0.2,1)';
    vidWrap.style.transition = 'flex 0.4s cubic-bezier(0.4,0,0.2,1)';
  }

  _renderLinkImage(c) {
    const { title, image, back } = this.pageData;
    const backBtn = back ? `<button class="back-btn" onclick="history.back()">← Retour</button>` : '';
    c.innerHTML = `
      <div class="page-header">${backBtn}<h1 class="page-title">${title}</h1></div>
      <div class="link-image-center">
        <a href="${image.link}" target="_blank" class="link-image-link">
          <img src="${image.src}" alt="${image.alt||''}" class="link-img" draggable="false"/>
          <div class="link-overlay"><span>👌 Pincer pour ouvrir</span></div>
        </a>
      </div>`;
  }

  _setupVideo() {
    const ph  = document.getElementById('video-placeholder');
    const ifr = document.getElementById('video-iframe');
    const vc  = document.getElementById('video-container');
    if (!ph || !ifr) return;

    const open = () => {
      ph.style.display  = 'none';
      ifr.style.display = 'block';
      this._videoPlaying = true;
      // Si pas en mode zoom, passer en mode lecture → vidéo prend 4/5
      if (this._layoutMode !== 'zoomed') this._applyLayout('playing');

      setTimeout(() => {
        try {
          ifr.contentWindow.postMessage(
            JSON.stringify({ event:'command', func:'playVideo' }), '*');
        } catch(e) {}
      }, 400);
    };

    const close = () => {
      ifr.style.display = 'none';
      ph.style.display  = 'flex';
      this._videoPlaying = false;
      // Retour au mode approprié selon le zoom
      if (this._layoutMode !== 'zoomed') {
        this._applyLayout(this.currentZoom > 1.05 ? 'zoomed' : 'normal');
      }
      try {
        ifr.contentWindow.postMessage(
          JSON.stringify({ event:'command', func:'stopVideo' }), '*');
      } catch(e) {}
    };

    ph.addEventListener('click', open);

    // Clic sur la zone vidéo quand elle tourne → fermer
    vc.addEventListener('click', (e) => {
      if (ifr.style.display !== 'none' && !e.target.closest('#video-placeholder')) close();
    });

    // Écouter les messages YouTube API (fin de vidéo = state 0)
    window.addEventListener('message', (ev) => {
      try {
        const data = JSON.parse(ev.data);
        // playerState 0 = ended, 2 = paused
        if (data.event === 'infoDelivery' && data.info && data.info.playerState === 0) {
          close();
        }
      } catch(e) {}
    });

    this._openVideo  = open;
    this._closeVideo = close;
  }

  _ytId(url) {
    if (!url) return null;
    const m = url.match(/(?:embed\/|watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  /* ================================================================
     GESTES — démarrage automatique
  ================================================================ */

  _startGestures() {
    const video  = document.getElementById('gesture-video');
    const canvas = document.getElementById('gesture-canvas');
    if (!video || !canvas) return;

    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then(stream => {
        video.srcObject = stream;
        video.play();
        this.gestureEngine = new GestureEngine({
          videoElement: video,
          canvasElement: canvas,
          onPinchRight: (x, y) => this._handlePinch(x, y),
          onZoom:       (s)    => this._handleZoom(s),
          onFist:       ()     => this._handleFist(),
          onIndexMove:  (x, y) => this._isIndexOnLink(x, y)
        });
      })
      .catch(err => {
        console.warn('[PageEngine] Caméra non disponible :', err);
        const s = document.getElementById('gesture-status');
        if (s) s.textContent = '⚠ Caméra refusée — navigation par clic uniquement';
      });
  }

  /* ================================================================
     DÉTECTION HOVER (coordonnées brutes MediaPipe → corrigées miroir)
     Retourne true si l'index est au-dessus d'un élément cliquable.
  ================================================================ */

  _normToScreen(normX, normY) {
    return {
      sx: (1 - normX) * window.innerWidth,   // correction miroir
      sy: normY * window.innerHeight
    };
  }

  _hitTest(sx, sy, selector) {
    for (const el of document.querySelectorAll(selector)) {
      const r = el.getBoundingClientRect();
      if (sx >= r.left && sx <= r.right && sy >= r.top && sy <= r.bottom) return el;
    }
    return null;
  }

  _isIndexOnLink(normX, normY) {
    const { sx, sy } = this._normToScreen(normX, normY);
    const t = this.pageData ? this.pageData.type : '';
    if (t === 'grid')         return !!this._hitTest(sx, sy, '.grid-item');
    if (t === 'detail_video') {
      // Curseur vert sur image ET sur zone vidéo
      return !!(this._hitTest(sx, sy, '.detail-image-wrap') ||
                this._hitTest(sx, sy, '#video-container'));
    }
    if (t === 'link_image')   return !!this._hitTest(sx, sy, '.link-img');
    return false;
  }

  /* ================================================================
     HANDLERS GESTES
  ================================================================ */

  _handlePinch(normX, normY) {
    const { sx, sy } = this._normToScreen(normX, normY);
    this._pinchFlash(sx, sy);

    const t = this.pageData ? this.pageData.type : '';

    if (t === 'grid') {
      const item = this._hitTest(sx, sy, '.grid-item');
      if (item && item.dataset.link) {
        item.classList.add('pinch-activate');
        setTimeout(() => window.location.href = item.dataset.link, 300);
      }
    } else if (t === 'detail_video') {
      const ph  = document.getElementById('video-placeholder');
      const ifr = document.getElementById('video-iframe');
      const onVideo = !!this._hitTest(sx, sy, '#video-container');
      const onImage = !!this._hitTest(sx, sy, '.detail-image-wrap');

      if (onVideo) {
        // Pinch sur la zone vidéo
        if (ph && ph.style.display !== 'none') {
          // Lancer la lecture
          if (this._openVideo) this._openVideo();
        } else if (ifr && ifr.style.display !== 'none') {
          // Arrêter la lecture
          if (this._closeVideo) this._closeVideo();
        }
      }
      // Pinch sur l'image → le zoom est géré par _handleZoom via le double pinch
    } else if (t === 'link_image') {
      if (this._hitTest(sx, sy, '.link-img')) {
        window.open(this.pageData.image.link, '_blank');
      }
    }
  }

  _handleZoom(scale) {
    this.currentZoom = scale;

    // Mise à jour de la disposition sur les pages detail_video
    if (this.pageData && this.pageData.type === 'detail_video') {
      const img = document.getElementById('detail-img');
      if (scale > 1.05) {
        // Zoom actif → image occupe tout (sauf si vidéo en lecture)
        if (!this._videoPlaying) this._applyLayout('zoomed');
        if (img) {
          img.style.transform  = `scale(${scale})`;
          img.style.transition = 'transform 0.15s ease';
        }
      } else {
        // Retour zoom initial
        if (img) { img.style.transform = 'scale(1)'; img.style.transition = 'transform 0.3s ease'; }
        if (!this._videoPlaying) this._applyLayout('normal');
      }
    } else {
      // Sur les autres types de pages, zoom classique sur les images
      document.querySelectorAll('.grid-img, .detail-img, .link-img').forEach(img => {
        img.style.transform  = `scale(${scale})`;
        img.style.transition = 'transform 0.15s ease';
      });
    }

    const ind = document.getElementById('zoom-indicator');
    if (ind) {
      ind.textContent   = `🔍 ${Math.round(scale * 100)}%`;
      ind.style.opacity = '1';
      clearTimeout(this._zt);
      this._zt = setTimeout(() => { ind.style.opacity = '0'; }, 1500);
    }
  }

  _handleFist() {
    document.body.classList.add('fist-exit');
    setTimeout(() => {
      if (window.history.length > 1) window.history.back();
      else window.location.href = 'index.html';
    }, 400);
  }

  _pinchFlash(x, y) {
    const d = document.createElement('div');
    d.style.cssText = `position:fixed;left:${x-30}px;top:${y-30}px;
      width:60px;height:60px;border-radius:50%;
      border:3px solid #00FF88;background:rgba(0,255,136,0.2);
      pointer-events:none;z-index:99998;
      animation:pinch-flash 0.5s ease-out forwards;`;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 500);
  }
}

window.PageEngine = PageEngine;
