/**
 * Dev preview: record the art canvas. Serve-time only. Not part of built HTML.
 * Parent posts advBuilder:captureStart / captureStop / captureFlush.
 *
 * The art canvas is copied onto an opaque stage and that stage is recorded.
 * Baseline H.264 level 3 (avc1.42E01E) accepts a 1000px frame and then writes
 * black; the probe starts at level 5.1, which can hold the bitmap.
 */
(function () {
  "use strict";

  var origin = window.location.origin;
  var recorder = null;
  var chunks = [];
  var mime = "";
  var ext = "";
  var stopping = false;
  var stream = null;
  var track = null;
  var stage = null;
  var stageCtx = null;
  var blitTimer = 0;

  function post(type, payload) {
    if (window.parent === window) return;
    try {
      window.parent.postMessage(Object.assign({ type: type }, payload || {}), origin);
    } catch (_) {}
  }

  function pickCanvas() {
    var list = document.body ? document.body.children : [];
    var i;
    for (i = 0; i < list.length; i++) {
      var c = list[i];
      if (!c || c.tagName !== "CANVAS") continue;
      if (!c.width || !c.height) continue;
      var st = window.getComputedStyle(c);
      if (st.display === "none" || st.visibility === "hidden") continue;
      return c;
    }
    return null;
  }

  function fitSize(w, h) {
    var maxMB = 36000;
    var side = 3840;
    var tw = w;
    var th = h;
    var guard = 0;
    while (
      (tw > side || th > side || Math.ceil(tw / 16) * Math.ceil(th / 16) > maxMB) &&
      tw > 2 &&
      th > 2 &&
      guard < 24
    ) {
      tw = Math.max(2, Math.round(tw * 0.9));
      th = Math.max(2, Math.round(th * 0.9));
      guard++;
    }
    return { w: tw, h: th };
  }

  function teardownStage() {
    if (blitTimer) {
      clearInterval(blitTimer);
      blitTimer = 0;
    }
    if (stream) {
      try {
        stream.getTracks().forEach(function (t) { t.stop(); });
      } catch (_) {}
      stream = null;
    }
    track = null;
    stageCtx = null;
    if (stage && stage.parentNode) stage.parentNode.removeChild(stage);
    stage = null;
  }

  function ensureStage(canvas) {
    var size = fitSize(canvas.width, canvas.height);
    if (!stage) {
      stage = document.createElement("canvas");
      stage.setAttribute("aria-hidden", "true");
      stage.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
      document.body.appendChild(stage);
    }
    if (stage.width !== size.w || stage.height !== size.h) {
      stage.width = size.w;
      stage.height = size.h;
      stageCtx = null;
    }
    if (!stageCtx) stageCtx = stage.getContext("2d", { alpha: false });
    return size;
  }

  function paintOverlay(canvas) {
    var sib = canvas.nextElementSibling;
    var pre = sib && sib.querySelector ? sib.querySelector("pre") : null;
    if (!pre) return;
    var text = pre.textContent || "";
    if (!text) return;
    var lines = text.split("\n");
    var rows = lines.length || 1;
    var cs = window.getComputedStyle(pre);
    var fs = stage.height / rows;
    var widest = lines[0] || " ";
    var i;
    stageCtx.save();
    stageCtx.font = fs + "px " + (cs.fontFamily || "monospace");
    stageCtx.fillStyle = cs.color || "#b8ffb8";
    stageCtx.textBaseline = "top";
    for (i = 1; i < lines.length; i++) {
      if (lines[i].length > widest.length) widest = lines[i];
    }
    var measured = stageCtx.measureText(widest).width || stage.width;
    if (measured > 0) stageCtx.scale(stage.width / measured, 1);
    for (i = 0; i < lines.length; i++) stageCtx.fillText(lines[i], 0, i * fs);
    stageCtx.restore();
  }

  function blit(canvas) {
    if (!canvas) return;
    ensureStage(canvas);
    if (!stageCtx) return;
    stageCtx.drawImage(canvas, 0, 0, stage.width, stage.height);
    try { paintOverlay(canvas); } catch (_) {}
    if (track && track.requestFrame) {
      try { track.requestFrame(); } catch (_) {}
    }
  }

  function pickMime() {
    if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return null;
    var prefs = [
      { mime: "video/mp4;codecs=avc1.640033", ext: "mp4" },
      { mime: "video/mp4;codecs=avc1.4D4033", ext: "mp4" },
      { mime: "video/mp4;codecs=avc1.42E033", ext: "mp4" },
      { mime: "video/mp4", ext: "mp4" },
      { mime: "video/webm;codecs=vp9", ext: "webm" },
      { mime: "video/webm", ext: "webm" },
    ];
    var i;
    for (i = 0; i < prefs.length; i++) {
      if (MediaRecorder.isTypeSupported(prefs[i].mime)) return prefs[i];
    }
    return null;
  }

  function fail(message) {
    stopping = false;
    teardownStage();
    recorder = null;
    chunks = [];
    post("advBuilder:captureStatus", { state: "idle", error: message || "Could not record" });
  }

  function upload(blob, blobExt, blobMime, keepRecording) {
    if (!blob || !blob.size) {
      post("advBuilder:captureStatus", {
        state: keepRecording ? "recording" : "idle",
        error: "Empty capture",
      });
      return Promise.resolve();
    }
    var url = "/captures?ext=" + encodeURIComponent(blobExt || ext);
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": blobMime || mime || "application/octet-stream" },
      body: blob,
    })
      .then(function (res) { return res.json().then(function (body) { return { res: res, body: body }; }); })
      .then(function (out) {
        if (!out.res.ok || !out.body || !out.body.ok) {
          post("advBuilder:captureStatus", {
            state: keepRecording ? "recording" : "idle",
            error: (out.body && out.body.error) || "Could not save capture",
          });
          return;
        }
        post("advBuilder:captureStatus", {
          state: "saved",
          rel: out.body.rel,
          name: out.body.name,
          keepRecording: !!keepRecording,
        });
      })
      .catch(function () {
        post("advBuilder:captureStatus", {
          state: keepRecording ? "recording" : "idle",
          error: "Could not save capture",
        });
      });
  }

  function uploadRecording() {
    var blob = new Blob(chunks, { type: mime || "application/octet-stream" });
    chunks = [];
    return upload(blob, ext, mime, false);
  }

  function stopRecorder() {
    if (blitTimer) {
      clearInterval(blitTimer);
      blitTimer = 0;
    }
    if (!recorder || recorder.state === "inactive") {
      teardownStage();
      recorder = null;
      return uploadRecording();
    }
    stopping = true;
    return new Promise(function (resolve) {
      recorder.onstop = function () {
        stopping = false;
        recorder = null;
        teardownStage();
        uploadRecording().then(resolve, resolve);
      };
      try {
        if (typeof recorder.requestData === "function") recorder.requestData();
        recorder.stop();
      } catch (_) {
        stopping = false;
        recorder = null;
        teardownStage();
        resolve();
      }
    });
  }

  function start() {
    if (recorder && recorder.state === "recording") return;
    var canvas = pickCanvas();
    if (!canvas) {
      fail("No canvas to record");
      return;
    }
    var chosen = pickMime();
    if (!chosen || typeof HTMLCanvasElement === "undefined" || !HTMLCanvasElement.prototype.captureStream) {
      fail("This preview cannot record video");
      return;
    }
    mime = chosen.mime;
    ext = chosen.ext;
    chunks = [];
    try {
      blit(canvas);
      stream = stage.captureStream(30);
      track = stream.getVideoTracks()[0] || null;
      recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8000000 });
    } catch (_) {
      fail("Could not start the recorder");
      return;
    }
    recorder.ondataavailable = function (ev) {
      if (ev.data && ev.data.size) chunks.push(ev.data);
    };
    recorder.onerror = function () {
      fail("Recorder error");
    };
    try {
      recorder.start(200);
    } catch (_) {
      fail("Could not start the recorder");
      return;
    }
    blitTimer = setInterval(function () { blit(pickCanvas()); }, 1000 / 30);
    post("advBuilder:captureStatus", { state: "recording", ext: ext });
  }

  function shot() {
    var canvas = pickCanvas();
    if (!canvas || typeof HTMLCanvasElement === "undefined") {
      post("advBuilder:captureStatus", {
        state: recorder && recorder.state === "recording" ? "recording" : "idle",
        error: "No canvas to capture",
      });
      return;
    }
    blit(canvas);
    if (!stage || !stage.toBlob) {
      post("advBuilder:captureStatus", { state: "idle", error: "Could not capture the canvas" });
      return;
    }
    var keep = !!(recorder && recorder.state === "recording");
    stage.toBlob(function (blob) {
      if (!keep) teardownStage();
      upload(blob, "png", "image/png", keep);
    }, "image/png");
  }

  window.addEventListener("message", function (ev) {
    if (ev.origin !== origin) return;
    var data = ev.data || {};
    if (data.type === "advBuilder:captureStart") start();
    if (data.type === "advBuilder:captureShot") shot();
    if (data.type === "advBuilder:captureStop" || data.type === "advBuilder:captureFlush") {
      if (stopping) return;
      stopRecorder().then(function () {
        if (data.type === "advBuilder:captureFlush") post("advBuilder:captureFlushed", {});
      });
    }
  });

  window.__advCaptureClient = true;
})();
