/**
 * Art runtime console capture — patches console.* when enabled (F1.3).
 * Loaded inline in preview HTML; toggled via advBuilder:artConsoleCapture postMessage.
 * Requires art_console_hook_lib.js injected before this script.
 */
(function () {
  "use strict";

  var lib = window.__advArtConsoleLib;
  if (!lib) return;

  var enabled = false;
  var patched = false;
  var orig = {};
  var levels = ["log", "info", "warn", "error", "debug"];
  var pending = lib.createPendingBuffer(lib.BUFFER_MAX);
  var globalHandlersInstalled = false;

  function postToParent(data) {
    try {
      var target = window.parent !== window ? window.parent : window;
      target.postMessage(data, "*");
    } catch (_) {}
  }

  function emitEntry(level, text) {
    var entry = { level: level, text: text, ts: Date.now() };
    if (!enabled) {
      pending.push(entry);
      return;
    }
    postToParent(Object.assign({ type: "advBuilder:artConsole" }, entry));
  }

  function postParent(level, args) {
    emitEntry(level, lib.formatArgs(args));
  }

  function patchLevel(level) {
    if (orig[level]) return;
    if (typeof console[level] !== "function") return;
    orig[level] = console[level];
    console[level] = function () {
      orig[level].apply(console, arguments);
      postParent(level, arguments);
    };
  }

  function patch() {
    if (patched) return;
    levels.forEach(patchLevel);
    patched = true;
  }

  function unpatch() {
    levels.forEach(function (level) {
      if (orig[level]) {
        console[level] = orig[level];
        delete orig[level];
      }
    });
    patched = false;
  }

  function flushPending() {
    if (!enabled) return;
    pending.flush().forEach(function (entry) {
      postToParent(Object.assign({ type: "advBuilder:artConsole" }, entry));
    });
  }

  function onWindowError(ev) {
    emitEntry("error", lib.formatErrorEvent(ev));
  }

  function onUnhandledRejection(ev) {
    emitEntry("error", "Unhandled promise rejection: " + lib.formatRejectionEvent(ev));
  }

  function installGlobalHandlers() {
    if (globalHandlersInstalled) return;
    window.addEventListener("error", onWindowError, true);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    globalHandlersInstalled = true;
  }

  function removeGlobalHandlers() {
    if (!globalHandlersInstalled) return;
    window.removeEventListener("error", onWindowError, true);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
    globalHandlersInstalled = false;
  }

  function forwardCaptureToIframes(msg) {
    document.querySelectorAll("iframe").forEach(function (fr) {
      try {
        if (fr.contentWindow) fr.contentWindow.postMessage(msg, "*");
      } catch (_) {}
    });
  }

  function notifyHookReady() {
    postToParent({ type: "advBuilder:artConsoleHookReady" });
  }

  function setCapture(on) {
    enabled = !!on;
    if (enabled) {
      patch();
      installGlobalHandlers();
      flushPending();
    } else {
      pending.discard();
      unpatch();
      removeGlobalHandlers();
    }
  }

  patch();
  installGlobalHandlers();
  notifyHookReady();

  window.addEventListener("message", function (ev) {
    var d = ev.data;
    if (!d || typeof d !== "object" || d.type !== "advBuilder:artConsoleCapture") {
      return;
    }
    setCapture(!!d.enabled);
    forwardCaptureToIframes(d);
  });

  window.__advArtConsoleHook = { setCapture: setCapture };
})();
