/**
 * Dev preview: forward RMB peek-zoom gestures to parent (Full/Min iframe only).
 * @see docs/VIEW-NAVIGATION-CONTROLS.md §4.5, §8.2
 */
(function () {
  "use strict";

  var rmbDown = false;
  var origin = window.location.origin;

  function post(type, payload) {
    if (window.parent === window) return;
    try {
      window.parent.postMessage(
        Object.assign({ type: type }, payload || {}),
        origin,
      );
    } catch (_) {}
  }

  function onContextMenu(e) {
    e.preventDefault();
  }

  function onPointerDown(e) {
    if (e.button !== 2) return;
    rmbDown = true;
    e.preventDefault();
    post("advBuilder:visPeekDown", { x: e.clientX, y: e.clientY });
    try {
      window.setPointerCapture(e.pointerId);
    } catch (_) {}
  }

  function onPointerUp(e) {
    if (!rmbDown) return;
    if (e.type !== "pointercancel" && e.button !== 2) return;
    rmbDown = false;
    post("advBuilder:visPeekUp", {});
    try {
      if (e.pointerId != null) window.releasePointerCapture(e.pointerId);
    } catch (_) {}
  }

  function onPointerMove(e) {
    if (!rmbDown) return;
    post("advBuilder:visPeekMove", { x: e.clientX, y: e.clientY });
  }

  function onWheel(e) {
    if (!rmbDown) return;
    e.preventDefault();
    post("advBuilder:visPeekWheel", {
      x: e.clientX,
      y: e.clientY,
      deltaY: e.deltaY,
    });
  }

  function isTextField(el) {
    if (!el || el === document.body) return false;
    var tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    return !!el.isContentEditable;
  }

  function onKeyDown(e) {
    if (e.key === "Control") {
      post("advBuilder:visNavCtrl", { down: true });
      return;
    }
    if ((e.key === "r" || e.key === "R") && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
      if (isTextField(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      post("advBuilder:captureToggle");
    }
  }

  function onKeyUp(e) {
    if (e.key !== "Control") return;
    post("advBuilder:visNavCtrl", { down: false });
  }

  window.__advViewNavPeek = true;
  window.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("wheel", onWheel, { passive: false });
})();
