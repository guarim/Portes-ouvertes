/**
 * page-engine.js — Lycée Jules Verne
 * Version : image pleine page + bouton vidéo flottant + canvas overlay centré
 */

class PageEngine {
  constructor() {
    this.pageData      = null;
    this.pagesConfig   = null;
    this.gestureEngine = null;
    this.currentZoom   = 1.0;
    this._videoOpen    = false;

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
      this._startGestures();
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

  /* ----------------------------------------------------------------
     PAGE DETAIL VIDEO
     Layout : image occupe toute la zone de contenu
              bouton ▶ flottant ancré à droite au centre vertical
              clic/pinch sur bouton → canvas overlay centré avec iframe YT
  ---------------------------------------------------------------- */
  _renderDetailVideo(c) {
    const { title, image, video, back } = this.pageData;
    const backBtn = back ? `<button class="back-btn" onclick="history.back()">← Retour</button>` : '';
    const videoId  = this._ytId(video);
    const embedUrl = videoId
      ? `https://www.youtube.com/embed/${videoId}?enablejsapi=1&rel=0&autoplay=1`
      : video;

    c.innerHTML = `
      <div class="page-header">${backBtn}<h1 class="page-title">${title}</h1></div>
      <div class="dv-layout">

        <!-- Image pleine zone -->
        <div class="dv-image-wrap">
          <img src="${image.src}" alt="${image.alt||''}" class="dv-img" id="dv-img" draggable="false"/>
        </div>

        <!-- Bouton vidéo flottant — ancré à droite, centré verticalement, hors du flux -->
        <button class="dv-video-btn" id="dv-video-btn" title="Lancer la vidéo">
          <span class="dv-btn-icon">▶</span>
          <span class="dv-btn-label">Vidéo</span>
        </button>

      </div>

      <!-- Overlay canvas vidéo (caché par défaut) -->
      <div class="dv-overlay" id="dv-overlay">
        <div class="dv-modal" id="dv-modal">
          <button class="dv-close-btn" id="dv-close-btn" title="Fermer">✕</button>
          <iframe
            id="dv-iframe"
            src=""
            data-src="${embedUrl}"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen>
          </iframe>
        </div>
      </div>`;

    this._embedUrl = embedUrl;
    this._setupDetailVideo();
  }

  _setupDetailVideo() {
    const btn     = document.getElementById('dv-video-btn');
    const overlay = document.getElementById('dv-overlay');
    const modal   = document.getElementById('dv-modal');
    const iframe  = document.getElementById('dv-iframe');
    const closeBtn= document.getElementById('dv-close-btn');
    if (!btn || !overlay || !iframe) return;

    const openVideo = () => {
      if (this._videoOpen) return;
      this._videoOpen = true;
      // Charger la src seulement à l'ouverture (autoplay)
      iframe.src = iframe.dataset.src;
      overlay.classList.add('dv-overlay--visible');
      modal.classList.add('dv-modal--visible');
      // Indiquer au curseur geste que le bouton est "actif"
      btn.classList.add('dv-video-btn--active');
    };

    const closeVideo = () => {
      if (!this._videoOpen) return;
      this._videoOpen = false;
      overlay.classList.remove('dv-overlay--visible');
      modal.classList.remove('dv-modal--visible');
      btn.classList.remove('dv-video-btn--active');
      // Arrêter la vidéo en vidant la src
      setTimeout(() => { iframe.src = ''; }, 350); // après animation de fermeture
    };

    // Clic sur le bouton → ouvrir
    btn.addEventListener('click', openVideo);
    // Clic sur le bouton de fermeture
    closeBtn.addEventListener('click', closeVideo);
    // Clic sur le fond sombre → fermer
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeVideo();
    });

    // Fin de lecture YouTube (playerState 0 = ended)
    window.addEventListener('message', (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.event === 'infoDelivery' &&
            data.info && data.info.playerState === 0) {
          closeVideo();
        }
      } catch(e) {}
    });

    this._openVideo  = openVideo;
    this._closeVideo = closeVideo;
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

  _ytId(url) {
    if (!url) return null;
    const m = url.match(/(?:embed\/|watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  /* ================================================================
     GESTES
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
        console.warn('[PageEngine] Caméra :', err);
        const s = document.getElementById('gesture-status');
        if (s) s.textContent = '⚠ Caméra refusée — navigation par clic';
      });
  }

  _normToScreen(normX, normY) {
    return {
      sx: (1 - normX) * window.innerWidth,
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

  /* Retourne true si le doigt survole un élément interactif → curseur vert */
  _isIndexOnLink(normX, normY) {
    const { sx, sy } = this._normToScreen(normX, normY);
    const t = this.pageData ? this.pageData.type : '';

    // Si l'overlay vidéo est ouvert, le bouton ✕ est interactif
    if (this._videoOpen) {
      return !!this._hitTest(sx, sy, '#dv-close-btn');
    }

    if (t === 'grid')         return !!this._hitTest(sx, sy, '.grid-item');
    if (t === 'detail_video') return !!this._hitTest(sx, sy, '#dv-video-btn');
    if (t === 'link_image')   return !!this._hitTest(sx, sy, '.link-img');
    return false;
  }

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
      // Overlay ouvert → pinch sur ✕ ferme
      if (this._videoOpen) {
        if (this._hitTest(sx, sy, '#dv-close-btn') && this._closeVideo) this._closeVideo();
        return;
      }
      // Pinch sur le bouton vidéo → ouvrir
      if (this._hitTest(sx, sy, '#dv-video-btn') && this._openVideo) this._openVideo();
    } else if (t === 'link_image') {
      if (this._hitTest(sx, sy, '.link-img')) {
        window.open(this.pageData.image.link, '_blank');
      }
    }
  }

  _handleZoom(scale) {
    this.currentZoom = scale;
    // Zoom sur l'image principale (detail_video ou autres)
    const imgs = document.querySelectorAll('.dv-img, .grid-img, .link-img');
    imgs.forEach(img => {
      img.style.transform  = `scale(${scale})`;
      img.style.transition = 'transform 0.15s ease';
    });
    const ind = document.getElementById('zoom-indicator');
    if (ind) {
      ind.textContent   = `🔍 ${Math.round(scale * 100)}%`;
      ind.style.opacity = '1';
      clearTimeout(this._zt);
      this._zt = setTimeout(() => { ind.style.opacity = '0'; }, 1500);
    }
  }

  _handleFist() {
    // Fermer la vidéo si ouverte, sinon retour page
    if (this._videoOpen && this._closeVideo) {
      this._closeVideo();
      return;
    }
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
