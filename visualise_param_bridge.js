/**
 * Param bridge for UTF8 Run / Metadata Preview nested iframes.
 * - host → art: dev-ui postMessage → this shell → #utf8-run-frame / #meta-viz-frame
 * - art → host: nested frame SendParams → bubble to dev-ui via parent.postMessage
 * Full/Min modes load artwork directly in #vis (no bridge).
 */
(function () {
  var lastParams = null;
  var pageOrigin = window.location.origin;

  function isAdvControlMessage(d) {
    return d && typeof d === "object" && d.type && String(d.type).indexOf("advBuilder:") === 0;
  }

  function isParamPayload(d) {
    return d != null && typeof d === "object" && !Array.isArray(d) && !isAdvControlMessage(d);
  }

  function artFrames() {
    var out = [];
    var u = document.getElementById("utf8-run-frame");
    var m = document.getElementById("meta-viz-frame");
    if (u) out.push(u);
    if (m) out.push(m);
    return out;
  }

  function postToArt(frame, data) {
    if (!frame || !frame.contentWindow) return;
    try {
      frame.contentWindow.postMessage(data, "*");
    } catch (_) {}
  }

  function applyParams(data) {
    if (!isParamPayload(data)) return;
    lastParams = data;
    artFrames().forEach(function (f) {
      postToArt(f, data);
    });
  }

  function wireFrame(frame) {
    if (!frame || frame.dataset.advParamBridge === "1") return;
    frame.dataset.advParamBridge = "1";
    frame.addEventListener("load", function () {
      if (lastParams) postToArt(frame, lastParams);
    });
  }

  function wireAll() {
    artFrames().forEach(wireFrame);
  }

  function isFromNestedArtFrame(source) {
    return artFrames().some(function (f) {
      return f && f.contentWindow && source === f.contentWindow;
    });
  }

  window.addEventListener("message", function (ev) {
    if (ev.data && ev.data.type === "advBuilder:artConsole") {
      if (isFromNestedArtFrame(ev.source)) {
        try {
          window.parent.postMessage(ev.data, pageOrigin);
        } catch (_) {}
      }
      return;
    }

    if (
      ev.data &&
      (ev.data.type === "advBuilder:requestParams" || ev.data.type === "advBuilder:paramInit")
    ) {
      if (isFromNestedArtFrame(ev.source)) {
        try {
          window.parent.postMessage(ev.data, pageOrigin);
        } catch (_) {}
      }
      return;
    }

    if (ev.origin !== pageOrigin) return;
    if (!isParamPayload(ev.data)) return;

    if (isFromNestedArtFrame(ev.source)) {
      applyParams(ev.data);
      try {
        window.parent.postMessage(ev.data, pageOrigin);
      } catch (_) {}
      return;
    }

    if (ev.source !== window.parent) return;
    applyParams(ev.data);
  });

  wireAll();
  if (document.body) {
    new MutationObserver(wireAll).observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  window.__advVisApplyParams = applyParams;
  window.__advVisLastParams = function () {
    return lastParams;
  };
})();
