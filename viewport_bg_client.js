/**
 * Dev preview: viewport host (checker/solid) → CanvasWall layer → canvas.
 * Intercepts body.bgColor so CanvasWall fills #adv-viewport-wall without core.html changes.
 */
(function () {
  var hostBackdrop = null;
  var wallLayer = null;
  var lastHostStyle = null;
  var wallStored = "";
  var stackReady = false;

  var layerBase =
    "position:fixed;inset:0;pointer-events:none;margin:0;padding:0;border:0;box-sizing:border-box;";

  function clamp(n) {
    return Math.min(255, Math.max(0, Math.round(n)));
  }

  function normalizeHsva(h, s, v, a) {
    let hh = Number(h);
    if (!Number.isFinite(hh)) hh = 0;
    hh = ((hh % 360) + 360) % 360;
    return {
      h: hh,
      s: Math.min(1, Math.max(0, Number(s))),
      v: Math.min(1, Math.max(0, Number(v))),
      a: Math.min(1, Math.max(0, Number(a ?? 1))),
    };
  }

  function hsvToRgb(h, s, v, a) {
    const { h: hh, s: ss, v: vv, a: aa } = normalizeHsva(h, s, v, a);
    const c = vv * ss;
    const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
    const m = vv - c;
    let rp = 0;
    let gp = 0;
    var bp = 0;
    if (hh < 60) {
      rp = c;
      gp = x;
    } else if (hh < 120) {
      rp = x;
      gp = c;
    } else if (hh < 180) {
      gp = c;
      bp = x;
    } else if (hh < 240) {
      gp = x;
      bp = c;
    } else if (hh < 300) {
      rp = x;
      bp = c;
    } else {
      rp = c;
      bp = x;
    }
    return {
      r: clamp((rp + m) * 255),
      g: clamp((gp + m) * 255),
      b: clamp((bp + m) * 255),
      a: aa,
    };
  }

  function rgbCss(r, g, b, a) {
    if (a >= 1) return "rgb(" + r + "," + g + "," + b + ")";
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }

  function hsvaToCss(hsva) {
    if (!hsva) return "";
    var rgb = hsvToRgb(hsva.h, hsva.s, hsva.v, hsva.a);
    return rgbCss(rgb.r, rgb.g, rgb.b, rgb.a);
  }

  function styleFromMessage(msg) {
    if (!msg || msg.type !== "advBuilder:viewportBg") return null;
    var solid = msg.solid !== false;
    if (solid) {
      var solidHsva = normalizeHsva(
        (msg.solidColor || msg.color || {}).h,
        (msg.solidColor || msg.color || {}).s,
        (msg.solidColor || msg.color || {}).v,
        (msg.solidColor || msg.color || {}).a,
      );
      return {
        backgroundColor: hsvaToCss(solidHsva),
        backgroundImage: "",
        backgroundSize: "",
        backgroundPosition: "",
      };
    }
    var fillHsva = msg.solidColor || msg.checkerFillColor;
    var altHsva = msg.checkerAltColor;
    if (!fillHsva || !altHsva) {
      var legacy = msg.checkerColor || msg.color || {};
      var base = normalizeHsva(legacy.h, legacy.s, legacy.v, legacy.a);
      if (!fillHsva) {
        fillHsva = {
          h: base.h,
          s: base.s,
          v: Math.min(1, Math.max(0, base.v * 0.8)),
          a: base.a,
        };
      }
      if (!altHsva) {
        altHsva = {
          h: base.h,
          s: base.s,
          v: Math.min(1, Math.max(0, base.v * 1.2)),
          a: base.a,
        };
      }
    }
    var fill = hsvaToCss(normalizeHsva(fillHsva && fillHsva.h, fillHsva && fillHsva.s, fillHsva && fillHsva.v, fillHsva && fillHsva.a));
    var alt = hsvaToCss(normalizeHsva(altHsva && altHsva.h, altHsva && altHsva.s, altHsva && altHsva.v, altHsva && altHsva.a));
    return {
      backgroundColor: fill,
      backgroundImage:
        "conic-gradient(" +
        alt +
        " 25%, " +
        fill +
        " 0 50%, " +
        alt +
        " 0 75%, " +
        fill +
        " 0)",
      backgroundSize: "20px 20px",
      backgroundPosition: "0 0",
    };
  }

  function applyToEl(el, style) {
    if (!el || !style) return;
    el.style.backgroundColor = style.backgroundColor || "";
    el.style.backgroundImage = style.backgroundImage || "";
    el.style.backgroundSize = style.backgroundSize || "";
    el.style.backgroundPosition = style.backgroundPosition || "";
  }

  function normalizeWallInput(v) {
    if (v == null || v === "") return "";
    if (typeof v === "object" && typeof v.C === "function") return v.C();
    return String(v);
  }

  function paintWallLayer() {
    if (!wallLayer) return;
    wallLayer.style.backgroundColor = wallStored || "transparent";
    wallLayer.style.backgroundImage = "";
  }

  function raiseCanvases() {
    var list = document.querySelectorAll("canvas");
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      var pos = window.getComputedStyle(el).position;
      if (!pos || pos === "static") {
        el.style.position = "relative";
      }
      if (!el.style.zIndex || el.style.zIndex === "auto") {
        el.style.zIndex = "2";
      }
    }
  }

  function ensureStack() {
    if (stackReady) return;
    var body = document.body;
    if (!body) return;
    hostBackdrop = document.createElement("div");
    hostBackdrop.id = "adv-viewport-host-bg";
    hostBackdrop.setAttribute("aria-hidden", "true");
    hostBackdrop.style.cssText = layerBase + "z-index:0;";
    wallLayer = document.createElement("div");
    wallLayer.id = "adv-viewport-wall";
    wallLayer.setAttribute("aria-hidden", "true");
    wallLayer.style.cssText = layerBase + "z-index:1;";
    body.insertBefore(hostBackdrop, body.firstChild);
    body.insertBefore(wallLayer, hostBackdrop.nextSibling);
    body.style.backgroundColor = "transparent";
    raiseCanvases();
    stackReady = true;
  }

  function hookCanvasWall() {
    if (document.body.__advWallHook) return;
    document.body.__advWallHook = true;
    wallStored =
      normalizeWallInput(document.body.bgColor) ||
      document.body.style.backgroundColor ||
      "";
    try {
      Object.defineProperty(document.body, "bgColor", {
        configurable: true,
        enumerable: true,
        get: function () {
          return wallStored;
        },
        set: function (v) {
          wallStored = normalizeWallInput(v);
          paintWallLayer();
        },
      });
    } catch (_) {}
    paintWallLayer();
    if (typeof MutationObserver !== "undefined") {
      var mo = new MutationObserver(function () {
        var css = document.body.style.backgroundColor;
        if (css && css !== wallStored) {
          wallStored = css;
          paintWallLayer();
        }
      });
      mo.observe(document.body, {
        attributes: true,
        attributeFilter: ["style", "bgcolor"],
      });
    }
  }

  function applyViewportBg(msg) {
    var style = styleFromMessage(msg);
    if (!style) return;
    ensureStack();
    hookCanvasWall();
    lastHostStyle = style;
    if (hostBackdrop) applyToEl(hostBackdrop, style);
    paintWallLayer();
    raiseCanvases();
  }

  function boot() {
    ensureStack();
    hookCanvasWall();
    if (lastHostStyle && hostBackdrop) applyToEl(hostBackdrop, lastHostStyle);
  }

  window.addEventListener("message", function (ev) {
    if (!ev.data || ev.data.type !== "advBuilder:viewportBg") return;
    applyViewportBg(ev.data);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.__advApplyViewportBg = applyViewportBg;
})();
