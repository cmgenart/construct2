/**
 * Preview view navigation — pan/zoom overlay, Ctrl modifier, fullscreen (F1.11), RMB peek (F1.11b).
 * @see docs/VIEW-NAVIGATION-CONTROLS.md
 */
(function () {
  "use strict";

  const STORAGE_KEY = "advBuilder.visView";
  const S_MIN = 0.25;
  const S_MAX = 8;
  const WHEEL_ZOOM_BASE = 1.0015;
  const PERSIST_IDLE_MS = 400;
  const PEEK_DEFAULT_SCALE = 2;
  const PEEK_ANIM_MS = 150;

  let navModeToggle = false;
  let ctrlHeld = false;
  let fullscreenActive = false;
  let scale = 1;
  let tx = 0;
  let ty = 0;

  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartTx = 0;
  let dragStartTy = 0;

  let peekActive = false;
  let rmbResetArmed = false;
  let peekAnchorPx = 0;
  let peekAnchorPy = 0;
  let peekAnchorCx = 0;
  let peekAnchorCy = 0;
  let peekScale = PEEK_DEFAULT_SCALE;
  let peekPointerId = null;
  let animRaf = null;
  let animFrom = { scale: 1, tx: 0, ty: 0 };
  let animTo = { scale: 1, tx: 0, ty: 0 };

  let els = {};
  let initialized = false;
  let persistTimer = null;
  let ctrlFromIframe = false;

  function ensureFocusSentinel() {
    if (els.focusSentinel) return;
    const el = document.createElement("div");
    el.id = "vis-nav-focus-sentinel";
    el.tabIndex = -1;
    el.setAttribute("aria-hidden", "true");
    el.style.cssText =
      "position:fixed;width:1px;height:1px;padding:0;margin:0;border:0;" +
      "overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;opacity:0;pointer-events:none;";
    document.body.appendChild(el);
    els.focusSentinel = el;
  }

  function focusNavSentinel() {
    if (isTextInputTarget(document.activeElement)) return;
    ensureFocusSentinel();
    try {
      els.focusSentinel.focus({ preventScroll: true });
    } catch (_) {
      try {
        els.focusSentinel.focus();
      } catch (_) {}
    }
  }

  function appliesToMode(mode) {
    return mode === "full" || mode === "min";
  }

  function getCurrentMode() {
    const el = document.querySelector('input[name="mode"]:checked');
    return el ? el.value : "full";
  }

  function isPeekEngaged() {
    return peekActive || animRaf != null;
  }

  function isNavActive(e) {
    if (!appliesToMode(getCurrentMode())) return false;
    if (isPeekEngaged()) return false;
    if (navModeToggle) return true;
    if (ctrlHeld || ctrlFromIframe) return true;
    if (e && e.ctrlKey) return true;
    return false;
  }

  function isDefaultView() {
    return scale === 1 && tx === 0 && ty === 0;
  }

  function clampScale(s) {
    return Math.min(S_MAX, Math.max(S_MIN, s));
  }

  function easeOut(t) {
    return 1 - (1 - t) * (1 - t);
  }

  function isTextInputTarget(el) {
    if (!el || el === document.body) return false;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (el.isContentEditable) return true;
    return isTextInputTarget(el.parentElement);
  }

  function applyTransform() {
    if (els.root) {
      els.root.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    }
    updateResetButton();
  }

  function applyDisplayTransform(s, x, y) {
    if (els.root) {
      els.root.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    }
  }

  function cancelAnim() {
    if (animRaf != null) {
      cancelAnimationFrame(animRaf);
      animRaf = null;
    }
  }

  function runAnim(onComplete) {
    cancelAnim();
    animStartLoop(onComplete);
  }

  function animStartLoop(onComplete) {
    const animStart = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - animStart) / PEEK_ANIM_MS);
      const e = easeOut(t);
      const s = animFrom.scale + (animTo.scale - animFrom.scale) * e;
      const x = animFrom.tx + (animTo.tx - animFrom.tx) * e;
      const y = animFrom.ty + (animTo.ty - animFrom.ty) * e;
      applyDisplayTransform(s, x, y);
      if (t < 1) {
        animRaf = requestAnimationFrame(frame);
      } else {
        animRaf = null;
        onComplete?.();
      }
    }
    animRaf = requestAnimationFrame(frame);
  }

  function peekTargetTransform(px, py, cx, cy, s) {
    return { scale: s, tx: px - cx * s, ty: py - cy * s };
  }

  function updateResetButton() {
    if (!els.resetBtn) return;
    const disabled = isDefaultView() && !isPeekEngaged();
    els.resetBtn.disabled = disabled;
    els.resetBtn.setAttribute("aria-disabled", disabled ? "true" : "false");
  }

  function updateModeButton() {
    if (!els.modeBtn) return;
    const toggleOn = navModeToggle;
    const ctrlOn = ctrlHeld || ctrlFromIframe;
    els.modeBtn.setAttribute("aria-pressed", toggleOn ? "true" : "false");
    els.modeBtn.classList.toggle("active", toggleOn || ctrlOn);
  }

  function updateOverlayState(e) {
    const navActive = isNavActive(e);
    const peek = isPeekEngaged();
    if (els.overlay) {
      els.overlay.classList.toggle("nav-capture", navActive);
      els.overlay.classList.toggle("peek-capture", peek && !navActive);
      els.overlay.classList.toggle("dragging", dragging && navActive);
    }
    if (els.vis) {
      els.vis.style.pointerEvents = navActive || peek ? "none" : "";
    }
    updateModeButton();
  }

  function updateControlsVisibility(mode) {
    const show = appliesToMode(mode ?? getCurrentMode());
    if (els.controls) els.controls.hidden = !show;
  }

  function loadPrefs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (typeof p.navMode === "boolean") navModeToggle = p.navMode;
      if (typeof p.scale === "number" && Number.isFinite(p.scale)) scale = clampScale(p.scale);
      if (typeof p.tx === "number" && Number.isFinite(p.tx)) tx = p.tx;
      if (typeof p.ty === "number" && Number.isFinite(p.ty)) ty = p.ty;
    } catch (_) {}
  }

  function savePrefsNow() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ navMode: navModeToggle, scale, tx, ty }),
      );
    } catch (_) {}
  }

  function savePrefsDebounced() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(savePrefsNow, PERSIST_IDLE_MS);
  }

  function applyZoomAt(px, py, factor) {
    const cx = (px - tx) / scale;
    const cy = (py - ty) / scale;
    const s2 = clampScale(scale * factor);
    if (s2 === scale) return;
    tx = px - cx * s2;
    ty = py - cy * s2;
    scale = s2;
    applyTransform();
  }

  function iframeCoordsToViewport(x, y) {
    const vpRect = els.viewport.getBoundingClientRect();
    const visRect = els.vis.getBoundingClientRect();
    const w = els.vis.clientWidth || 1;
    const h = els.vis.clientHeight || 1;
    return {
      px: visRect.left - vpRect.left + (x / w) * visRect.width,
      py: visRect.top - vpRect.top + (y / h) * visRect.height,
    };
  }

  function movePeek(px, py) {
    if (!peekActive) return;
    cancelAnim();
    peekAnchorPx = px;
    peekAnchorPy = py;
    peekAnchorCx = px;
    peekAnchorCy = py;
    const t = peekTargetTransform(px, py, peekAnchorCx, peekAnchorCy, peekScale);
    scale = t.scale;
    tx = t.tx;
    ty = t.ty;
    applyTransform();
  }

  function peekWheel(deltaY) {
    if (!peekActive) return;
    const factor = Math.pow(WHEEL_ZOOM_BASE, -deltaY);
    peekScale = clampScale(peekScale * factor);
    const t = peekTargetTransform(
      peekAnchorPx,
      peekAnchorPy,
      peekAnchorCx,
      peekAnchorCy,
      peekScale,
    );
    scale = t.scale;
    tx = t.tx;
    ty = t.ty;
    applyTransform();
  }

  function animateToDefault() {
    animFrom = { scale, tx, ty };
    animTo = { scale: 1, tx: 0, ty: 0 };
    runAnim(() => {
      scale = 1;
      tx = 0;
      ty = 0;
      applyTransform();
      savePrefsNow();
      updateOverlayState();
    });
  }

  function endPeek() {
    if (!peekActive) return;

    cancelAnim();
    peekActive = false;
    peekPointerId = null;
    animateToDefault();
  }

  function cancelPeek() {
    cancelAnim();
    peekActive = false;
    rmbResetArmed = false;
    peekPointerId = null;
    scale = 1;
    tx = 0;
    ty = 0;
    applyTransform();
    savePrefsNow();
    updateOverlayState();
  }

  function handleRmbDown(px, py) {
    if (!appliesToMode(getCurrentMode())) return;

    cancelAnim();
    endDrag(null);

    if (!isDefaultView()) {
      rmbResetArmed = true;
      updateOverlayState();
      return;
    }

    peekActive = true;
    peekAnchorPx = px;
    peekAnchorPy = py;
    peekAnchorCx = px;
    peekAnchorCy = py;
    peekScale = PEEK_DEFAULT_SCALE;

    const target = peekTargetTransform(px, py, peekAnchorCx, peekAnchorCy, peekScale);
    animFrom = { scale, tx, ty };
    animTo = target;

    runAnim(() => {
      scale = target.scale;
      tx = target.tx;
      ty = target.ty;
      applyTransform();
    });

    updateOverlayState();
  }

  function handleRmbUp() {
    if (rmbResetArmed) {
      rmbResetArmed = false;
      peekPointerId = null;
      if (!isDefaultView()) {
        cancelAnim();
        animateToDefault();
      } else {
        updateOverlayState();
      }
      return;
    }
    if (peekActive) endPeek();
  }

  function resetView() {
    cancelPeek();
    scale = 1;
    tx = 0;
    ty = 0;
    applyTransform();
    savePrefsDebounced();
  }

  function setNavMode(on, opts) {
    navModeToggle = !!on;
    updateModeButton();
    updateOverlayState();
    if (!opts?.skipSave) savePrefsDebounced();
  }

  function pointerViewportCoords(e) {
    const rect = els.viewport.getBoundingClientRect();
    return { px: e.clientX - rect.left, py: e.clientY - rect.top };
  }

  function onOverlayWheel(e) {
    if (peekActive) {
      e.preventDefault();
      e.stopPropagation();
      peekWheel(e.deltaY);
      return;
    }
    if (!isNavActive(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const { px, py } = pointerViewportCoords(e);
    const factor = Math.pow(WHEEL_ZOOM_BASE, -e.deltaY);
    applyZoomAt(px, py, factor);
    savePrefsDebounced();
    updateOverlayState(e);
  }

  function releasePeekCapture(e) {
    if (peekPointerId != null && els.overlay?.hasPointerCapture?.(peekPointerId)) {
      try {
        els.overlay.releasePointerCapture(peekPointerId);
      } catch (_) {}
    }
    peekPointerId = null;
  }

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    if (els.overlay) els.overlay.classList.remove("dragging");
    updateOverlayState(e);
    savePrefsDebounced();
    if (e?.pointerId != null && els.overlay?.hasPointerCapture?.(e.pointerId)) {
      try {
        els.overlay.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
  }

  function onOverlayPointerDown(e) {
    if (e.pointerType === "mouse" && e.button === 2) {
      if (!appliesToMode(getCurrentMode())) return;
      e.preventDefault();
      const { px, py } = pointerViewportCoords(e);
      handleRmbDown(px, py);
      peekPointerId = e.pointerId;
      try {
        els.overlay.setPointerCapture(e.pointerId);
      } catch (_) {}
      return;
    }
    if (!isNavActive(e)) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartTx = tx;
    dragStartTy = ty;
    els.overlay.classList.add("dragging");
    try {
      els.overlay.setPointerCapture(e.pointerId);
    } catch (_) {}
    updateOverlayState(e);
  }

  function onOverlayPointerMove(e) {
    if (peekActive && (e.buttons & 2)) {
      const { px, py } = pointerViewportCoords(e);
      movePeek(px, py);
      return;
    }
    if (!dragging) {
      updateOverlayState(e);
      return;
    }
    if (!isNavActive(e)) {
      endDrag(e);
      return;
    }
    tx = dragStartTx + (e.clientX - dragStartX);
    ty = dragStartTy + (e.clientY - dragStartY);
    applyTransform();
  }

  function onOverlayPointerUp(e) {
    if (e.button === 2 && (peekActive || rmbResetArmed)) {
      e.preventDefault();
      releasePeekCapture(e);
      handleRmbUp();
      return;
    }
    endDrag(e);
  }

  function onWindowPointerUp(e) {
    if (e.button === 2 && (peekActive || rmbResetArmed)) {
      releasePeekCapture(e);
      handleRmbUp();
    }
  }

  function onPeekMessage(ev) {
    if (ev.origin !== location.origin) return;
    if (ev.source !== els.vis?.contentWindow) return;
    const d = ev.data;
    if (!d || typeof d.type !== "string") return;
    if (!appliesToMode(getCurrentMode())) return;

    if (d.type === "advBuilder:visPeekDown") {
      const { px, py } = iframeCoordsToViewport(d.x, d.y);
      handleRmbDown(px, py);
    } else if (d.type === "advBuilder:visPeekMove") {
      if (!peekActive) return;
      const { px, py } = iframeCoordsToViewport(d.x, d.y);
      movePeek(px, py);
    } else if (d.type === "advBuilder:visPeekWheel") {
      if (!peekActive) return;
      peekWheel(d.deltaY);
    } else if (d.type === "advBuilder:visPeekUp") {
      handleRmbUp();
    } else if (d.type === "advBuilder:visNavCtrl") {
      setCtrlFromIframe(!!d.down);
    }
  }

  function setCtrlFromIframe(down) {
    if (isTextInputTarget(document.activeElement)) return;
    ctrlFromIframe = !!down;
    if (!down && dragging) endDrag(null);
    updateOverlayState();
  }

  function onKeyDown(e) {
    if (e.key !== "Control") return;
    if (isTextInputTarget(e.target)) return;
    ctrlHeld = true;
    updateOverlayState(e);
  }

  function onKeyUp(e) {
    if (e.key !== "Control") return;
    ctrlHeld = false;
    ctrlFromIframe = false;
    if (dragging) endDrag(e);
    updateOverlayState(e);
  }

  function updateFullscreenButton() {
    if (!els.fsBtn) return;
    els.fsBtn.setAttribute("aria-pressed", fullscreenActive ? "true" : "false");
    els.fsBtn.classList.toggle("active", fullscreenActive);
  }

  function syncFullscreenUi() {
    const fsEl = document.fullscreenElement;
    const right = els.right;
    const inNativeFs = fsEl === right;
    if (els.exitBtn) els.exitBtn.hidden = !fullscreenActive;
    updateFullscreenButton();
    if (fullscreenActive && !inNativeFs && right?.requestFullscreen) {
      right.requestFullscreen().catch(() => {});
    }
    if (!fullscreenActive && inNativeFs) {
      document.exitFullscreen().catch(() => {});
    }
  }

  function enterFullscreen() {
    if (!appliesToMode(getCurrentMode())) return;
    fullscreenActive = true;
    els.main?.classList.add("vis-fullscreen-active");
    syncFullscreenUi();
  }

  function exitFullscreen() {
    fullscreenActive = false;
    els.main?.classList.remove("vis-fullscreen-active");
    syncFullscreenUi();
  }

  function toggleFullscreen() {
    if (!appliesToMode(getCurrentMode())) return;
    if (fullscreenActive) exitFullscreen();
    else enterFullscreen();
  }

  function onFullscreenChange() {
    const right = els.right;
    if (!document.fullscreenElement && fullscreenActive) {
      fullscreenActive = false;
      els.main?.classList.remove("vis-fullscreen-active");
    } else if (document.fullscreenElement === right && !fullscreenActive) {
      fullscreenActive = true;
      els.main?.classList.add("vis-fullscreen-active");
    }
    if (els.exitBtn) els.exitBtn.hidden = !fullscreenActive;
    updateFullscreenButton();
  }

  function onModeChange(mode) {
    cancelPeek();
    updateControlsVisibility(mode);
    if (!appliesToMode(mode)) {
      setNavMode(false);
      resetView();
      exitFullscreen();
      updateOverlayState();
      return;
    }
    applyTransform();
    updateModeButton();
    updateOverlayState();
  }

  function init() {
    if (initialized) return;
    els = {
      main: document.getElementById("main"),
      right: document.getElementById("right"),
      viewport: document.getElementById("vis-viewport"),
      root: document.getElementById("vis-transform-root"),
      vis: document.getElementById("vis"),
      overlay: document.getElementById("vis-nav-overlay"),
      controls: document.getElementById("vis-view-controls"),
      modeBtn: document.getElementById("vis-nav-mode"),
      resetBtn: document.getElementById("vis-nav-reset"),
      fsBtn: document.getElementById("vis-nav-fullscreen"),
      exitBtn: document.getElementById("vis-nav-exit-fullscreen"),
    };
    if (!els.viewport || !els.root || !els.overlay) return;
    initialized = true;

    loadPrefs();
    applyTransform();
    updateModeButton();
    updateControlsVisibility(getCurrentMode());
    updateOverlayState();

    els.modeBtn?.addEventListener("click", () => {
      setNavMode(!navModeToggle);
    });
    els.resetBtn?.addEventListener("click", () => {
      if (isDefaultView() && !isPeekEngaged()) return;
      resetView();
    });
    els.fsBtn?.addEventListener("click", () => toggleFullscreen());
    els.exitBtn?.addEventListener("click", () => exitFullscreen());

    els.overlay.addEventListener("wheel", onOverlayWheel, { passive: false });
    els.overlay.addEventListener("pointerdown", onOverlayPointerDown);
    els.overlay.addEventListener("pointermove", onOverlayPointerMove);
    els.overlay.addEventListener("pointerup", onOverlayPointerUp);
    els.overlay.addEventListener("pointercancel", onOverlayPointerUp);

    window.addEventListener("message", onPeekMessage);
    window.addEventListener("pointerup", onWindowPointerUp, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", () => {
      ctrlHeld = false;
      ctrlFromIframe = false;
      if (dragging) dragging = false;
      if (peekActive || rmbResetArmed) handleRmbUp();
      updateOverlayState();
    });
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && fullscreenActive) exitFullscreen();
      if (
        e.key === "F11" &&
        e.ctrlKey &&
        !e.altKey &&
        !e.metaKey &&
        !isTextInputTarget(e.target) &&
        appliesToMode(getCurrentMode())
      ) {
        e.preventDefault();
        toggleFullscreen();
      }
    });

    window.addEventListener("beforeunload", savePrefsNow);
    focusNavSentinel();
  }

  window.advVisView = {
    init,
    setNavMode,
    resetView,
    getTransform: () => ({ scale, tx, ty }),
    appliesToMode,
    onModeChange,
    enterFullscreen,
    exitFullscreen,
    isPeekActive: () => peekActive,
    cancelPeek,
    focusNavSentinel,
  };
})();
