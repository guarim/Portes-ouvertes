/**
 * gesture-engine.js — Lycée Jules Verne
 * Utilise window.Hands et window.Camera déjà chargés par les balises <script> du HTML.
 * PAS de dynamic import() — c'était la source du bug principal.
 *
 * Gestes :
 *   Pinch main droite  → ouvrir lien de l'image sous le doigt
 *   Double pinch       → zoom proportionnel à l'écartement
 *   Poing fermé        → retour page précédente
 *   Curseur index      → point rouge/vert qui suit l'index droit en temps réel
 */

class GestureEngine {
  constructor(options = {}) {
    this.options = {
      videoElement: null,
      canvasElement: null,
      onPinchRight: null,   // callback(normX, normY) coords brutes MediaPipe
      onZoom:       null,   // callback(scale)
      onFist:       null,   // callback()
      onIndexMove:  null,   // callback(normX, normY) → retourne bool (sur lien ?)
      ...options
    };

    this.lastBothPinch    = false;
    this.lastTwoHandDist  = null;
    this.currentZoom      = 1.0;
    this.fistCooldown     = false;
    this.pinchCooldown    = false;
    this._cursorOnLink    = false;

    this.PINCH_THRESHOLD  = 0.07;
    this.ZOOM_SENSITIVITY = 2.5;

    this._cursor = this._createCursor();
    this._initMediaPipe();
  }

  /* ================================================================
     CURSEUR INDEX
  ================================================================ */

  _createCursor() {
    const old = document.getElementById('hand-cursor');
    if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'hand-cursor';
    el.style.cssText = [
      'position:fixed',
      'width:28px','height:28px',
      'border-radius:50%',
      'background:radial-gradient(circle at 35% 35%,#ff6060,#cc0000)',
      'border:3px solid rgba(255,255,255,0.85)',
      'box-shadow:0 0 12px 4px rgba(220,0,0,0.55),0 2px 8px rgba(0,0,0,0.5)',
      'pointer-events:none',
      'z-index:99999',
      'transform:translate(-50%,-50%)',
      'transition:background 0.15s,box-shadow 0.15s,width 0.1s,height 0.1s',
      'display:none'
    ].join(';');
    document.body.appendChild(el);
    return el;
  }

  _moveCursor(normX, normY, onLink, isPinching) {
    if (!this._cursor) return;
    // coords MediaPipe sont en miroir : inverser X
    const sx = (1 - normX) * window.innerWidth;
    const sy = normY * window.innerHeight;
    this._cursor.style.left    = sx + 'px';
    this._cursor.style.top     = sy + 'px';
    this._cursor.style.display = 'block';
    if (isPinching) {
      this._cursor.style.background = 'radial-gradient(circle at 35% 35%,#ffe066,#e8a020)';
      this._cursor.style.boxShadow  = '0 0 22px 8px rgba(232,160,32,0.75),0 2px 8px rgba(0,0,0,0.5)';
      this._cursor.style.width      = '40px';
      this._cursor.style.height     = '40px';
    } else if (onLink) {
      this._cursor.style.background = 'radial-gradient(circle at 35% 35%,#66ff99,#00cc55)';
      this._cursor.style.boxShadow  = '0 0 16px 6px rgba(0,220,80,0.65),0 2px 8px rgba(0,0,0,0.5)';
      this._cursor.style.width      = '32px';
      this._cursor.style.height     = '32px';
    } else {
      this._cursor.style.background = 'radial-gradient(circle at 35% 35%,#ff6060,#cc0000)';
      this._cursor.style.boxShadow  = '0 0 12px 4px rgba(220,0,0,0.55),0 2px 8px rgba(0,0,0,0.5)';
      this._cursor.style.width      = '28px';
      this._cursor.style.height     = '28px';
    }
  }

  _hideCursor() {
    if (this._cursor) this._cursor.style.display = 'none';
  }

  /* ================================================================
     INITIALISATION MEDIAPIPE
     window.Hands et window.Camera sont déjà présents via <script>.
  ================================================================ */

  _initMediaPipe() {
    const { videoElement: video, canvasElement: canvas } = this.options;
    if (!video || !canvas) {
      console.error('[GestureEngine] videoElement ou canvasElement manquant');
      return;
    }
    if (typeof Hands === 'undefined' || typeof Camera === 'undefined') {
      console.error('[GestureEngine] MediaPipe non chargé. Vérifier les balises <script>.');
      return;
    }

    this.hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${file}`
    });
    this.hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.6
    });
    this.hands.onResults((r) => this._onResults(r));

    this.camera = new Camera(video, {
      onFrame: async () => { await this.hands.send({ image: video }); },
      width: 640, height: 480
    });

    this.camera.start()
      .then(() => {
        console.log('[GestureEngine] ✅ Caméra active');
        const s = document.getElementById('gesture-status');
        if (s) s.textContent = '🟢 Détection gestuelle active';
      })
      .catch((err) => {
        console.error('[GestureEngine] Caméra refusée :', err);
        const s = document.getElementById('gesture-status');
        if (s) s.textContent = '⚠ Caméra refusée — navigation par clic';
      });
  }

  /* ================================================================
     HELPERS GÉOMÉTRIQUES
  ================================================================ */

  _dist(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  }

  _isPinch(lm) {
    return this._dist(lm[4], lm[8]) < this.PINCH_THRESHOLD;
  }

  // Tips (8,12,16,20) en dessous de leur MCP (5,9,13,17) en Y = doigt replié
  _isFist(lm) {
    const tips = [8, 12, 16, 20];
    const mcps = [5,  9, 13, 17];
    let n = 0;
    for (let i = 0; i < 4; i++) {
      if (lm[tips[i]].y > lm[mcps[i]].y) n++;
    }
    return n >= 3;
  }

  _pinchCenter(lm) {
    return { x: (lm[4].x + lm[8].x) / 2, y: (lm[4].y + lm[8].y) / 2 };
  }

  /* ================================================================
     TRAITEMENT FRAME PAR FRAME
  ================================================================ */

  _onResults(results) {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      this.lastBothPinch = false;
      this.lastTwoHandDist = null;
      this._hideCursor();
      return;
    }

    const lms  = results.multiHandLandmarks;
    const heds = results.multiHandedness;

    // MediaPipe labellise en vue miroir :
    //   "Left"  → main droite utilisateur
    //   "Right" → main gauche utilisateur
    let rightHand = null, leftHand = null;
    heds.forEach((h, i) => {
      if (h.label === 'Left') rightHand = lms[i];
      else                    leftHand  = lms[i];
    });

    /* -- Curseur index droit -- */
    if (rightHand) {
      const tip = rightHand[8];
      const pinching = this._isPinch(rightHand);
      if (this.options.onIndexMove) {
        this._cursorOnLink = !!this.options.onIndexMove(tip.x, tip.y);
      }
      this._moveCursor(tip.x, tip.y, this._cursorOnLink, pinching);
    } else {
      this._hideCursor();
    }

    /* -- Poing fermé → retour -- */
    if (!this.fistCooldown) {
      if ((rightHand && this._isFist(rightHand)) ||
          (leftHand  && this._isFist(leftHand))) {
        this.fistCooldown = true;
        setTimeout(() => { this.fistCooldown = false; }, 2000);
        if (this.options.onFist) this.options.onFist();
        return;
      }
    }

    const rPinch = rightHand && this._isPinch(rightHand);
    const lPinch = leftHand  && this._isPinch(leftHand);

    /* -- Double pinch → zoom -- */
    if (rPinch && lPinch) {
      const dist = this._dist(this._pinchCenter(rightHand), this._pinchCenter(leftHand));
      if (this.lastTwoHandDist !== null) {
        const delta = dist - this.lastTwoHandDist;
        const nz = Math.max(1.0, Math.min(5.0,
                     this.currentZoom + delta * this.ZOOM_SENSITIVITY));
        if (Math.abs(nz - this.currentZoom) > 0.005) {
          this.currentZoom = nz;
          if (this.options.onZoom) this.options.onZoom(this.currentZoom);
        }
      }
      this.lastTwoHandDist = dist;
      this.lastBothPinch   = true;
      return;
    }

    this.lastTwoHandDist = null;
    this.lastBothPinch   = false;

    /* -- Pinch main droite → clic -- */
    if (rPinch && !lPinch && !this.pinchCooldown) {
      this.pinchCooldown = true;
      setTimeout(() => { this.pinchCooldown = false; }, 1000);
      const c = this._pinchCenter(rightHand);
      // Passer les coords brutes ; page-engine corrige le miroir lui-même
      if (this.options.onPinchRight) this.options.onPinchRight(c.x, c.y);
    }
  }

  /* ================================================================
     API PUBLIQUE
  ================================================================ */

  resetZoom() {
    this.currentZoom = 1.0;
    if (this.options.onZoom) this.options.onZoom(1.0);
  }

  destroy() {
    try { if (this.camera) this.camera.stop(); } catch(e) {}
    try { if (this.hands)  this.hands.close(); } catch(e) {}
    this._hideCursor();
  }
}

window.GestureEngine = GestureEngine;
