/**
 * Preview toolbar: record and screenshot. Full and Min only.
 * The iframe client records the canvas. This host saves nothing itself.
 */
(function () {
  "use strict";

  var recording = false;
  var starting = false;
  var pending = false;
  var shotPending = false;
  var startedAt = 0;
  var timerId = 0;

  function els() {
    return {
      record: document.getElementById("vis-capture-record"),
      shot: document.getElementById("vis-capture-shot"),
      file: document.getElementById("vis-capture-file"),
      fileName: document.getElementById("vis-capture-file-name"),
      timer: document.getElementById("vis-capture-timer"),
      vis: document.getElementById("vis"),
    };
  }

  function artMode() {
    var mode = document.querySelector('input[name="mode"]:checked');
    var value = mode ? mode.value : "full";
    return value === "full" || value === "min";
  }

  function building() {
    var overlay = document.getElementById("overlay");
    return !!(overlay && overlay.style.display === "flex");
  }

  function seed() {
    if (window.state && window.state.seed != null) return window.state.seed;
    var input = document.getElementById("seedInput");
    return input ? input.value : "0";
  }

  function formatElapsed(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var m = Math.floor(s / 60);
    var h = Math.floor(m / 60);
    s = s % 60;
    m = m % 60;
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    if (h) return h + ":" + p(m) + ":" + p(s);
    return m + ":" + p(s);
  }

  function showTimer(text, pop) {
    var timer = els().timer;
    if (!timer) return;
    timer.hidden = false;
    timer.textContent = text;
    if (pop) {
      timer.classList.remove("is-pop");
      void timer.offsetWidth;
      timer.classList.add("is-pop");
    }
  }

  function hideTimer() {
    clearInterval(timerId);
    timerId = 0;
    startedAt = 0;
    var timer = els().timer;
    if (timer) {
      timer.hidden = true;
      timer.classList.remove("is-pop");
    }
  }

  function startClock() {
    startedAt = Date.now();
    clearInterval(timerId);
    showTimer(formatElapsed(0), true);
    timerId = setInterval(function () {
      if (!startedAt) return;
      showTimer(formatElapsed(Date.now() - startedAt), false);
    }, 200);
  }

  function showFile(name, rel, isError) {
    var e = els();
    if (!e.file || !e.fileName) return;
    if (!name) {
      e.file.hidden = true;
      e.file.classList.remove("is-error");
      delete e.file.dataset.name;
      return;
    }
    e.file.hidden = false;
    e.fileName.textContent = name;
    e.file.classList.toggle("is-error", !!isError);
    e.file.disabled = !!isError;
    if (isError) {
      delete e.file.dataset.name;
      e.file.title = name;
    } else {
      e.file.dataset.name = name;
      e.file.title = "Show " + name + " in Explorer";
    }
  }

  function paint() {
    var rec = els().record;
    if (!rec) return;
    rec.classList.toggle("is-recording", recording);
    rec.setAttribute("aria-pressed", recording ? "true" : "false");
    var label = recording ? "Stop recording" : "Record";
    rec.title = label;
    rec.setAttribute("aria-label", label);
  }

  function post(type, extra) {
    var vis = els().vis;
    if (!vis || !vis.contentWindow) return;
    try {
      vis.contentWindow.postMessage(Object.assign({ type: type }, extra || {}), location.origin);
    } catch (_) {}
  }

  function start() {
    if (!artMode() || recording || starting) return;
    if (building()) {
      pending = true;
      showTimer("…", true);
      return;
    }
    pending = false;
    starting = true;
    post("advBuilder:captureStart", { seed: seed() });
  }

  function stop() {
    pending = false;
    starting = false;
    post("advBuilder:captureStop");
  }

  function shot() {
    if (!artMode()) return;
    if (building()) {
      shotPending = true;
      return;
    }
    shotPending = false;
    post("advBuilder:captureShot");
  }

  function toggleRecord() {
    if (recording) stop();
    else start();
  }

  function revealSaved() {
    var file = els().file;
    if (!file || file.disabled || !file.dataset.name) return;
    fetch("/captures/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.dataset.name }),
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok || !j.path) return;
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(
            { type: "advBuilder:revealPath", path: j.path, mode: "select" },
            "*",
          );
          return;
        }
        if (window.advBuilder && typeof window.advBuilder.revealInExplorer === "function") {
          window.advBuilder.revealInExplorer({ path: j.path, mode: "select" });
        }
      })
      .catch(function () {});
  }

  function flush() {
    if (!recording) return Promise.resolve();
    return new Promise(function (resolve) {
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        window.removeEventListener("message", onMsg);
        clearTimeout(timer);
        recording = false;
        starting = false;
        hideTimer();
        paint();
        resolve();
      }
      function onMsg(ev) {
        if (ev.origin !== location.origin) return;
        if (ev.data && ev.data.type === "advBuilder:captureFlushed") finish();
      }
      var timer = setTimeout(finish, 4000);
      window.addEventListener("message", onMsg);
      post("advBuilder:captureFlush");
    });
  }

  function onStatus(data) {
    if (data.state === "recording") {
      recording = true;
      starting = false;
      pending = false;
      if (!startedAt) startClock();
    } else if (data.state === "saved") {
      if (!data.keepRecording) {
        recording = false;
        starting = false;
        hideTimer();
      }
      showFile(data.name || data.rel || "Saved", data.rel, false);
    } else if (data.error) {
      if (data.state !== "recording") {
        recording = false;
        starting = false;
        hideTimer();
      }
      showFile(data.error, "", true);
    } else {
      recording = false;
      starting = false;
      hideTimer();
    }
    paint();
  }

  function onPreviewLoad() {
    if (pending && !recording && !building()) start();
    else if (shotPending && !building()) shot();
  }

  function init() {
    var e = els();
    if (!e.record || e.record.dataset.bound) return;
    e.record.dataset.bound = "1";
    e.record.addEventListener("click", toggleRecord);
    if (e.shot) e.shot.addEventListener("click", shot);
    if (e.file) e.file.addEventListener("click", revealSaved);
    window.addEventListener("message", function (ev) {
      if (ev.origin !== location.origin) return;
      var data = ev.data || {};
      if (data.type === "advBuilder:captureStatus") onStatus(data);
    });
    paint();
  }

  window.advCapture = {
    init: init,
    flush: flush,
    onPreviewLoad: onPreviewLoad,
    paint: paint,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
