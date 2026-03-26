/**
 * handTracker.js
 * Module de reconnaissance des mains via MediaPipe Hands (Tasks API - WASM).
 * Détecte :
 *   - Index seul levé  → affiche curseur souris
 *   - Pincement pouce+index (main droite) sur image → ouvre le lien
 *   - Deux mains, pouces+index qui s'écartent → zoom proportionnel
 *   - Poing fermé → page précédente
 */

const HandTracker = (() => {

  /* ── CONFIG ───────────────────────────────────────────────── */
  const PINCH_DIST_THRESHOLD   = 0.07;  // distance normalisée pour pinch
  const ZOOM_START_DIST        = 0.25;  // distance inter-mains de départ zoom
  const ZOOM_MAX               = 2.8;
  const ZOOM_MIN               = 1.0;
  const CURSOR_SMOOTH          = 0.30;  // facteur de lissage (0=aucun, 1=max lag)
  const FIST_FRAMES_NEEDED     = 12;    // frames consécutives pour confirmer poing
  const GESTURE_COOLDOWN_MS    = 700;

  /* ── ÉTAT ─────────────────────────────────────────────────── */
  let handsModel    = null;
  let videoEl       = null;
  let canvasEl      = null;
  let canvasCtx     = null;
  let animId        = null;
  let lastGestureTs = 0;
  let fistFrames    = 0;
  let zoomRefDist   = null;
  let currentZoom   = 1.0;
  let cursorX       = 0;
  let cursorY       = 0;
  let statusEl      = null;
  let cursorEl      = null;

  /* Callbacks fournis par la page */
  let onCursorMove   = null;  // (x, y, visible)
  let onPinchImage   = null;  // (x, y)  → ouvre le lien sous le curseur
  let onZoomChange   = null;  // (zoomFactor, imageSrc | null)
  let onGoBack       = null;  // ()

  /* ── INIT WEBCAM ─────────────────────────────────────────── */
  async function initCamera() {
    videoEl   = document.getElementById('webcam-video');
    canvasEl  = document.getElementById('webcam-canvas');
    canvasCtx = canvasEl.getContext('2d');
    statusEl  = document.getElementById('hand-status');
    cursorEl  = document.getElementById('hand-cursor');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 360, facingMode: 'user' },
        audio: false
      });
      videoEl.srcObject = stream;
      await new Promise(res => { videoEl.onloadedmetadata = res; });
      videoEl.play();
      setStatus('📷 Caméra active…');
      return true;
    } catch(e) {
      setStatus('❌ Pas de caméra');
      console.warn('HandTracker: webcam non disponible', e);
      return false;
    }
  }

  /* ── INIT MEDIAPIPE ──────────────────────────────────────── */
  async function initMediaPipe() {
    // MediaPipe Hands via le CDN JSDelivr (GestureRecognizer non nécessaire)
    const vision = await import(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs'
    );
    const { HandLandmarker, FilesetResolver } = vision;

    const filesetResolver = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    );

    handsModel = await HandLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU'
      },
      runningMode:           'VIDEO',
      numHands:              2,
      minHandDetectionConfidence: 0.55,
      minHandPresenceConfidence:  0.55,
      minTrackingConfidence:      0.50
    });

    setStatus('✋ Reconnaissance active');
    return true;
  }

  /* ── BOUCLE PRINCIPALE ───────────────────────────────────── */
  function startLoop() {
    let lastTs = 0;
    const loop = (ts) => {
      animId = requestAnimationFrame(loop);
      if (!handsModel || videoEl.readyState < 2) return;
      if (ts - lastTs < 33) return; // ≈ 30 fps max
      lastTs = ts;

      const result = handsModel.detectForVideo(videoEl, ts);
      processResults(result);
    };
    animId = requestAnimationFrame(loop);
  }

  /* ── TRAITEMENT DES RÉSULTATS ────────────────────────────── */
  function processResults(result) {
    drawDebug(result);

    if (!result.landmarks || result.landmarks.length === 0) {
      hideCursor();
      zoomRefDist = null;
      fistFrames  = 0;
      return;
    }

    // On classe les mains (left/right) selon handedness
    const hands = classifyHands(result);

    // CAS 1 : une seule main détectée
    if (hands.length === 1) {
      zoomRefDist = null;
      const h = hands[0];

      if (isFist(h.landmarks)) {
        fistFrames++;
        if (fistFrames >= FIST_FRAMES_NEEDED) {
          fistFrames = 0;
          triggerGoBack();
        }
      } else {
        fistFrames = 0;
      }

      if (isIndexOnly(h.landmarks)) {
        const tip = h.landmarks[8]; // index fingertip
        moveCursor(tip.x, tip.y);

        if (h.label === 'Right') {
          const pinch = getPinchDist(h.landmarks);
          if (pinch < PINCH_DIST_THRESHOLD) {
            triggerPinch(cursorX, cursorY);
          }
        }
      } else {
        hideCursor();
      }
    }
    // CAS 2 : deux mains — zoom
    else if (hands.length === 2) {
      fistFrames = 0;
      const h0 = hands[0], h1 = hands[1];

      const bothPinching =
        getPinchDist(h0.landmarks) < PINCH_DIST_THRESHOLD &&
        getPinchDist(h1.landmarks) < PINCH_DIST_THRESHOLD;

      if (bothPinching) {
        const dist = interHandDist(h0.landmarks, h1.landmarks);
        if (zoomRefDist === null) zoomRefDist = dist;

        const ratio = dist / zoomRefDist;
        currentZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, ratio));
        if (onZoomChange) onZoomChange(currentZoom);
        hideCursor();
      } else {
        if (zoomRefDist !== null) {
          zoomRefDist = null;
          currentZoom = 1.0;
          if (onZoomChange) onZoomChange(1.0);
        }

        // Si index seulement sur une main → curseur
        for (const h of hands) {
          if (isIndexOnly(h.landmarks)) {
            const tip = h.landmarks[8];
            moveCursor(tip.x, tip.y);
            break;
          } else { hideCursor(); }
        }
      }
    }
  }

  /* ── UTILITAIRES GESTURE ─────────────────────────────────── */

  /**
   * Classe les mains et retourne [{label, landmarks}]
   * MediaPipe retourne 'Left'/'Right' depuis le point de vue caméra.
   * La vidéo est miroir (scaleX(-1)), donc on inverse.
   */
  function classifyHands(result) {
    const out = [];
    for (let i = 0; i < result.landmarks.length; i++) {
      const raw   = result.handednesses[i][0].categoryName; // 'Left' ou 'Right'
      const label = raw === 'Left' ? 'Right' : 'Left'; // inversion miroir
      out.push({ label, landmarks: result.landmarks[i] });
    }
    return out;
  }

  /** Un seul doigt levé = index */
  function isIndexOnly(lm) {
    // Fingertip au dessus du PIP joint = doigt tendu
    const indexUp  = lm[8].y  < lm[6].y;
    const middleUp = lm[12].y < lm[10].y;
    const ringUp   = lm[16].y < lm[14].y;
    const pinkyUp  = lm[20].y < lm[18].y;
    // pouce : tip.x ≠ base.x selon orientation, on utilise distance
    const thumbTip   = lm[4];
    const thumbBase  = lm[2];
    const thumbUp    = dist2D(thumbTip, thumbBase) > 0.09;
    return indexUp && !middleUp && !ringUp && !pinkyUp && !thumbUp;
  }

  /** Distance pouce-index normalisée */
  function getPinchDist(lm) {
    return dist2D(lm[4], lm[8]);
  }

  /** Poing fermé = tous les doigts repliés */
  function isFist(lm) {
    const tips  = [8, 12, 16, 20];
    const pips  = [6, 10, 14, 18];
    let   count = 0;
    for (let i = 0; i < 4; i++) {
      if (lm[tips[i]].y > lm[pips[i]].y) count++;
    }
    return count === 4;
  }

  /** Distance entre les index des deux mains (pour le zoom) */
  function interHandDist(lm0, lm1) {
    return dist2D(lm0[0], lm1[0]); // distance entre poignets
  }

  function dist2D(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx*dx + dy*dy);
  }

  /* ── CURSEUR ─────────────────────────────────────────────── */
  function moveCursor(nx, ny) {
    // nx/ny sont [0,1] depuis la caméra (déjà miroir grâce à CSS scaleX(-1) vidéo)
    // on doit inverser x car la vidéo est miroir
    const tx = (1 - nx) * window.innerWidth;
    const ty = ny * window.innerHeight;

    // Lissage exponentiel
    cursorX += (tx - cursorX) * (1 - CURSOR_SMOOTH);
    cursorY += (ty - cursorY) * (1 - CURSOR_SMOOTH);

    if (cursorEl) {
      cursorEl.style.display = 'block';
      cursorEl.style.left    = cursorX + 'px';
      cursorEl.style.top     = cursorY  + 'px';
    }
    if (onCursorMove) onCursorMove(cursorX, cursorY, true);
  }

  function hideCursor() {
    if (cursorEl) cursorEl.style.display = 'none';
    if (onCursorMove) onCursorMove(0, 0, false);
  }

  /* ── TRIGGERS ────────────────────────────────────────────── */
  function triggerPinch(x, y) {
    const now = Date.now();
    if (now - lastGestureTs < GESTURE_COOLDOWN_MS) return;
    lastGestureTs = now;
    if (cursorEl) cursorEl.classList.add('pinch');
    setTimeout(() => { if (cursorEl) cursorEl.classList.remove('pinch'); }, 350);
    if (onPinchImage) onPinchImage(x, y);
  }

  function triggerGoBack() {
    const now = Date.now();
    if (now - lastGestureTs < GESTURE_COOLDOWN_MS * 2) return;
    lastGestureTs = now;
    showToast('✊ Retour page précédente…');
    if (onGoBack) onGoBack();
  }

  /* ── DEBUG CANVAS ────────────────────────────────────────── */
  function drawDebug(result) {
    if (!canvasCtx) return;
    canvasCtx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    if (!result.landmarks) return;
    const W = canvasEl.width, H = canvasEl.height;
    for (const lm of result.landmarks) {
      for (const pt of lm) {
        canvasCtx.beginPath();
        canvasCtx.arc(pt.x * W, pt.y * H, 3, 0, Math.PI*2);
        canvasCtx.fillStyle = 'rgba(232,160,32,0.85)';
        canvasCtx.fill();
      }
    }
  }

  /* ── STATUS & TOAST ──────────────────────────────────────── */
  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  function showToast(msg) {
    const toast = document.getElementById('gesture-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 1800);
  }

  /* ── API PUBLIQUE ────────────────────────────────────────── */
  async function init(callbacks = {}) {
    onCursorMove  = callbacks.onCursorMove  || null;
    onPinchImage  = callbacks.onPinchImage  || null;
    onZoomChange  = callbacks.onZoomChange  || null;
    onGoBack      = callbacks.onGoBack      || null;

    const camOk = await initCamera();
    if (!camOk) return;

    try {
      await initMediaPipe();
      startLoop();
    } catch(e) {
      setStatus('⚠️ MediaPipe erreur');
      console.error('HandTracker init error:', e);
    }
  }

  function destroy() {
    if (animId) cancelAnimationFrame(animId);
    if (videoEl && videoEl.srcObject) {
      videoEl.srcObject.getTracks().forEach(t => t.stop());
    }
  }

  return { init, destroy, showToast };

})();

export default HandTracker;
