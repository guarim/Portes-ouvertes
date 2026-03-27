/**
 * handTracker.js  v2
 * ─────────────────────────────────────────────────────────────
 * Reconnaissance des mains via MediaPipe HandLandmarker (Tasks Vision API).
 *
 * Gestes détectés :
 *   ☝  Index seul levé (une main)    → curseur à l'écran
 *   ⏱  Curseur immobile 5s sur image → déclenche le lien (dwell)
 *   ✊  Poing fermé (≥14 frames)      → page précédente
 *   🤏🤏 Pinch bilatéral (deux mains) →
 *         • distance croissante  : zoom
 *         • distance décroissante: dé-zoom jusqu'à zoom=1
 *         • déplacement du centre inter-mains → translate de l'image zoomée
 */

const HandTracker = (() => {

  /* ══════════════════════════════════════════════════════════
     CONFIG
  ══════════════════════════════════════════════════════════ */
  const PINCH_DIST_THRESHOLD = 0.075;
  const ZOOM_MAX             = 6.5;
  const ZOOM_MIN             = 1.0;
  const CURSOR_SMOOTH        = 0.28;
  const FIST_FRAMES_NEEDED   = 14;
  const GESTURE_COOLDOWN_MS  = 800;
  const DWELL_DURATION_MS    = 1500;
  const DWELL_MOVE_TOLERANCE = 28;   // px max de mouvement toléré pendant le dwell

  /* ══════════════════════════════════════════════════════════
     ÉTAT INTERNE
  ══════════════════════════════════════════════════════════ */
  let handsModel    = null;
  let videoEl       = null;
  let canvasEl      = null;
  let canvasCtx     = null;
  let animId        = null;
  let lastGestureTs = 0;
  let fistFrames    = 0;
  let statusEl      = null;
  let cursorEl      = null;
  let dwellFillEl   = null;

  // Curseur lissé
  let cursorX = window.innerWidth  / 2;
  let cursorY = window.innerHeight / 2;

  // Dwell
  let dwellStartTs  = 0;
  let dwellStartX   = 0;
  let dwellStartY   = 0;
  let dwellTargetEl = null;
  let dwellActive   = false;

  // Zoom + Pan
  let zoomRefDist   = null;
  let zoomRefZoom   = 1.0;
  let currentZoom   = 1.0;
  let panRefCX      = null;
  let panRefCY      = null;
  let panOffsetX    = 0;
  let panOffsetY    = 0;
  let panBaseX      = 0;
  let panBaseY      = 0;

  // Callbacks
  let onCursorMove    = null;
  let onDwellProgress = null;
  let onDwellFire     = null;
  let onZoomPan       = null;
  let onGoBack        = null;
  let _clickableSel   = null;

  /* ══════════════════════════════════════════════════════════
     INIT WEBCAM
  ══════════════════════════════════════════════════════════ */
  async function initCamera() {
    videoEl     = document.getElementById('webcam-video');
    canvasEl    = document.getElementById('webcam-canvas');
    canvasCtx   = canvasEl.getContext('2d');
    statusEl    = document.getElementById('hand-status');
    cursorEl    = document.getElementById('hand-cursor');
    dwellFillEl = cursorEl ? cursorEl.querySelector('circle.dwell-fill') : null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 360, facingMode: 'user' },
        audio: false
      });
      videoEl.srcObject = stream;
      await new Promise(res => { videoEl.onloadedmetadata = res; });
      await videoEl.play();
      setStatus('📷 Caméra active…');
      return true;
    } catch (e) {
      setStatus('❌ Pas de caméra');
      console.warn('HandTracker: webcam indisponible', e);
      return false;
    }
  }

  /* ══════════════════════════════════════════════════════════
     INIT MEDIAPIPE
  ══════════════════════════════════════════════════════════ */
  async function initMediaPipe() {
    const vision = await import(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs'
    );
    const { HandLandmarker, FilesetResolver } = vision;

    const fs = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    );

    handsModel = await HandLandmarker.createFromOptions(fs, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU'
      },
      runningMode:                'VIDEO',
      numHands:                   2,
      minHandDetectionConfidence: 0.55,
      minHandPresenceConfidence:  0.55,
      minTrackingConfidence:      0.50
    });

    setStatus('✋ Reconnaissance active');
  }

  /* ══════════════════════════════════════════════════════════
     BOUCLE
  ══════════════════════════════════════════════════════════ */
  function startLoop() {
    let lastTs = 0;
    const loop = (ts) => {
      animId = requestAnimationFrame(loop);
      if (!handsModel || videoEl.readyState < 2) return;
      if (ts - lastTs < 30) return;
      lastTs = ts;
      processResults(handsModel.detectForVideo(videoEl, ts), ts);
    };
    animId = requestAnimationFrame(loop);
  }

  /* ══════════════════════════════════════════════════════════
     TRAITEMENT
  ══════════════════════════════════════════════════════════ */
  function processResults(result, ts) {
    drawDebug(result);

    if (!result.landmarks || result.landmarks.length === 0) {
      hideCursor();
      resetDwell();
      resetZoomGesture();
      fistFrames = 0;
      return;
    }

    const hands = classifyHands(result);

    /* ── UNE MAIN ── */
    if (hands.length === 1) {
      resetZoomGesture();
      const h = hands[0];

      if (isFist(h.landmarks)) {
        fistFrames++;
        resetDwell();
        hideCursor();
        if (fistFrames >= FIST_FRAMES_NEEDED) {
          fistFrames = 0;
          triggerGoBack();
        }
        return;
      }
      fistFrames = 0;

      if (isIndexOnly(h.landmarks)) {
        const tip = h.landmarks[8];
        moveCursor(tip.x, tip.y);
        processDwell(cursorX, cursorY, ts);
      } else {
        hideCursor();
        resetDwell();
      }
    }

    /* ── DEUX MAINS ── */
    else if (hands.length === 2) {
      fistFrames = 0;
      resetDwell();
      hideCursor();

      const h0 = hands[0], h1 = hands[1];
      const p0 = getPinchDist(h0.landmarks) < PINCH_DIST_THRESHOLD;
      const p1 = getPinchDist(h1.landmarks) < PINCH_DIST_THRESHOLD;

      if (p0 && p1) {
        // Distance entre poignets (repère stable)
        const dist = dist2D(h0.landmarks[0], h1.landmarks[0]);

        // Centre inter-mains → coordonnées écran (miroir)
        const nx = (h0.landmarks[0].x + h1.landmarks[0].x) / 2;
        const ny = (h0.landmarks[0].y + h1.landmarks[0].y) / 2;
        const cxPx = (1 - nx) * window.innerWidth;
        const cyPx = ny * window.innerHeight;

        if (zoomRefDist === null) {
          // Début du geste : mémoriser la référence
          zoomRefDist = dist;
          zoomRefZoom = currentZoom;
          panRefCX    = cxPx;
          panRefCY    = cyPx;
          panBaseX    = panOffsetX;
          panBaseY    = panOffsetY;
        } else {
          const ratio   = dist / zoomRefDist;
          const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomRefZoom * ratio));

          // Déplacement du centre inter-mains → translation
          const PAN_SENSITIVITY = 1.6;
          const dx = (cxPx - panRefCX) * PAN_SENSITIVITY;
          const dy = (cyPx - panRefCY) * PAN_SENSITIVITY;

          if (newZoom <= ZOOM_MIN + 0.04) {
            // Retour au zoom initial → reset pan aussi
            currentZoom = ZOOM_MIN;
            panOffsetX  = 0;
            panOffsetY  = 0;
          } else {
            currentZoom = newZoom;
            panOffsetX  = panBaseX + dx;
            panOffsetY  = panBaseY + dy;
          }

          if (onZoomPan) onZoomPan(currentZoom, panOffsetX, panOffsetY);

          const label = currentZoom <= ZOOM_MIN + 0.04
            ? '🔍 Zoom réinitialisé'
            : `🔍 ×${currentZoom.toFixed(1)}`;
          showToast(label);
        }
      } else {
        // Pinch relâché → on fige zoom & pan courants
        resetZoomGesture();
      }
    }
  }

  /* ══════════════════════════════════════════════════════════
     DWELL (hover 5 secondes)
  ══════════════════════════════════════════════════════════ */
  function processDwell(x, y, ts) {
    const el = getClickableAt(x, y);

    if (!el) {
      // Sortie de toute zone cliquable
      if (dwellActive) resetDwell();
      return;
    }

    if (el !== dwellTargetEl) {
      // Nouvelle cible
      resetDwell();
      dwellTargetEl = el;
      dwellStartTs  = ts;
      dwellStartX   = x;
      dwellStartY   = y;
      dwellActive   = true;
      return;
    }

    // Même cible : vérifier déplacement
    const moved = Math.hypot(x - dwellStartX, y - dwellStartY);
    if (moved > DWELL_MOVE_TOLERANCE) {
      // Trop bougé → réinitialiser le timer sur la même cible
      dwellStartTs = ts;
      dwellStartX  = x;
      dwellStartY  = y;
      return;
    }

    const progress = Math.min(1, (ts - dwellStartTs) / DWELL_DURATION_MS);
    updateDwellRing(progress);
    if (onDwellProgress) onDwellProgress(progress, el);
    if (cursorEl) cursorEl.classList.add('dwelling');

    if (progress >= 1) {
      resetDwell();
      fireDwell(x, y, el);
    }
  }

  function resetDwell() {
    dwellActive   = false;
    dwellTargetEl = null;
    dwellStartTs  = 0;
    updateDwellRing(0);
    if (cursorEl) cursorEl.classList.remove('dwelling', 'fired');
  }

  function fireDwell(x, y, el) {
    const now = Date.now();
    if (now - lastGestureTs < GESTURE_COOLDOWN_MS) return;
    lastGestureTs = now;
    if (cursorEl) {
      cursorEl.classList.add('fired');
      setTimeout(() => cursorEl && cursorEl.classList.remove('fired'), 400);
    }
    if (onDwellFire) onDwellFire(x, y, el);
  }

  /** Mise à jour de l'arc SVG dans le curseur */
  function updateDwellRing(progress) {
    if (!dwellFillEl) return;
    const circ = 132; // 2π × r(21px) ≈ 132
    dwellFillEl.style.strokeDashoffset = circ * (1 - progress);
  }

  /* ══════════════════════════════════════════════════════════
     ÉLÉMENT CLIQUABLE SOUS LE CURSEUR
  ══════════════════════════════════════════════════════════ */
  function getClickableAt(x, y) {
    if (!_clickableSel) return null;
    for (const el of document.querySelectorAll(_clickableSel)) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el;
    }
    return null;
  }

  /* ══════════════════════════════════════════════════════════
     UTILITAIRES GESTURE
  ══════════════════════════════════════════════════════════ */
  function classifyHands(result) {
    return result.landmarks.map((lm, i) => {
      const raw   = result.handednesses[i][0].categoryName;
      const label = raw === 'Left' ? 'Right' : 'Left';
      return { label, landmarks: lm };
    });
  }

  function isIndexOnly(lm) {
    return lm[8].y < lm[6].y          // index UP
      && !(lm[12].y < lm[10].y)       // middle DOWN
      && !(lm[16].y < lm[14].y)       // ring DOWN
      && !(lm[20].y < lm[18].y)       // pinky DOWN
      && dist2D(lm[4], lm[2]) <= 0.09; // thumb DOWN
  }

  function getPinchDist(lm) { return dist2D(lm[4], lm[8]); }

  function isFist(lm) {
    return [[8,6],[12,10],[16,14],[20,18]]
      .every(([t, p]) => lm[t].y > lm[p].y);
  }

  function dist2D(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /* ══════════════════════════════════════════════════════════
     CURSEUR
  ══════════════════════════════════════════════════════════ */
  function moveCursor(nx, ny) {
    const tx = (1 - nx) * window.innerWidth;
    const ty = ny       * window.innerHeight;
    cursorX += (tx - cursorX) * (1 - CURSOR_SMOOTH);
    cursorY += (ty - cursorY) * (1 - CURSOR_SMOOTH);
    if (cursorEl) {
      cursorEl.style.display = 'block';
      cursorEl.style.left    = cursorX + 'px';
      cursorEl.style.top     = cursorY + 'px';
    }
    if (onCursorMove) onCursorMove(cursorX, cursorY, true);
  }

  function hideCursor() {
    if (cursorEl) cursorEl.style.display = 'none';
    if (onCursorMove) onCursorMove(0, 0, false);
  }

  function resetZoomGesture() {
    zoomRefDist = null;
    panRefCX    = null;
    panRefCY    = null;
    // zoom & pan courants sont conservés (figés)
  }

  /* ══════════════════════════════════════════════════════════
     RETOUR ARRIÈRE
  ══════════════════════════════════════════════════════════ */
  function triggerGoBack() {
    const now = Date.now();
    if (now - lastGestureTs < GESTURE_COOLDOWN_MS * 2) return;
    lastGestureTs = now;
    showToast('✊ Retour à la page précédente…');
    if (onGoBack) setTimeout(onGoBack, 600);
  }

  /* ══════════════════════════════════════════════════════════
     DEBUG CANVAS (squelette main)
  ══════════════════════════════════════════════════════════ */
  function drawDebug(result) {
    if (!canvasCtx || !canvasEl) return;
    canvasCtx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    if (!result.landmarks) return;
    const W = canvasEl.width, H = canvasEl.height;
    const BONES = [
      [0,1],[1,2],[2,3],[3,4],
      [0,5],[5,6],[6,7],[7,8],
      [5,9],[9,10],[10,11],[11,12],
      [9,13],[13,14],[14,15],[15,16],
      [13,17],[17,18],[18,19],[19,20],[0,17]
    ];
    for (const lm of result.landmarks) {
      canvasCtx.strokeStyle = 'rgba(26,111,196,0.65)';
      canvasCtx.lineWidth   = 1.2;
      for (const [a, b] of BONES) {
        canvasCtx.beginPath();
        canvasCtx.moveTo(lm[a].x * W, lm[a].y * H);
        canvasCtx.lineTo(lm[b].x * W, lm[b].y * H);
        canvasCtx.stroke();
      }
      for (const pt of lm) {
        canvasCtx.beginPath();
        canvasCtx.arc(pt.x * W, pt.y * H, 2.5, 0, Math.PI * 2);
        canvasCtx.fillStyle = 'rgba(232,160,32,0.9)';
        canvasCtx.fill();
      }
    }
  }

  /* ══════════════════════════════════════════════════════════
     TOAST & STATUS
  ══════════════════════════════════════════════════════════ */
  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  let _toastTimer = null;
  function showToast(msg) {
    const t = document.getElementById('gesture-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('visible');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => t.classList.remove('visible'), 2000);
  }

  /* ══════════════════════════════════════════════════════════
     API PUBLIQUE
  ══════════════════════════════════════════════════════════ */
  async function init(callbacks = {}) {
    onCursorMove    = callbacks.onCursorMove    || null;
    onDwellProgress = callbacks.onDwellProgress || null;
    onDwellFire     = callbacks.onDwellFire     || null;
    onZoomPan       = callbacks.onZoomPan       || null;
    onGoBack        = callbacks.onGoBack        || null;
    if (callbacks.clickableSelector) _clickableSel = callbacks.clickableSelector;

    const camOk = await initCamera();
    if (!camOk) return;
    try {
      await initMediaPipe();
      startLoop();
    } catch (e) {
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
