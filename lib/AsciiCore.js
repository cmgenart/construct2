/**
 * AsciiCore — Construct² shared library (Shape A)
 * Dev override: art/AsciiCore/ (project copy wins over this lib)
 * See construct2/docs/runtimes/ASCII-CORE-SPEC.md
 */

//#<<Ascii>engine:density>
//import<AsciiEngine_density.js>
//# 
//#<<Ascii>engine:edge>
//import<AsciiEngine_edge.js>
//# 
//#<<Ascii>engine:bias>
//import<AsciiEngine_bias.js>
//# 

const AsciiCore = (layer, x, y, w, h) => {
  const cnv = CONTEXT[0] && CONTEXT[0][0];
  const host = DCE("div");
  const pre = DCE("pre");
  host.appendChild(pre);
  cnv
    ? cnv.insertAdjacentElement("afterend", host)
    : DOCUMENT.body.appendChild(host);

  OAS(host.style, {
    position: "absolute",
    pointerEvents: "none",
    zIndex: "20",
    overflow: "hidden",
    margin: "0",
    padding: "0",
    background: "transparent",
    backgroundColor: "transparent",
  });
  OAS(pre.style, {
    margin: "0",
    padding: "0",
    fontFamily: "ui-monospace, Courier New, monospace",
    whiteSpace: "pre",
    color: "#b8ffb8",
    background: "transparent",
    backgroundColor: "transparent",
    fontKerning: "none",
    fontVariantLigatures: "none",
    tabSize: 1,
  });

  const ac = {
    layer,
    x: x == null ? 0 : x,
    y: y == null ? 0 : y,
    w: w == null ? PX : w,
    h: h == null ? PY : h,
    cols: 0,
    rows: 0,
    //#<<Ascii>engine:density>
    engine: "density",
    //# 
    //#<<Ascii>engine:edge>
    engine: "edge",
    //# 
    //#<<Ascii>engine:bias>
    engine: "bias",
    //# 
    jitter: 0,
    contrast: 0,
    brightness: 1,
    levelOffset: 0,
    cutoff: 0.08,
    textBlend: 0,
    ratio: 0.6,
    dx: 0,
    dy: 0,
    _txt: null,
    _sl: null,
    _ch: null,
    _buf: [],
    _host: host,
    _pre: pre,
    sl(fn) {
      ac._sl = fn;
      return ac;
    },
    ch(fn) {
      ac._ch = fn;
      return ac;
    },
    txt(s) {
      ac._txt = s;
      return ac;
    },
    vis(on) {
      host.style.display = on ? "block" : "none";
      return ac;
    },
    _mapLum(b) {
      ac.contrast > 0 &&
        (b = Clamp((b - 0.5) * (1 + ac.contrast * 2) + 0.5, 0, 1));
      ac.brightness !== 1 && (b = Clamp(b * ac.brightness, 0, 1));
      b = Clamp(b + ac.levelOffset, 0, 1);
      return b;
    },
    _isDark(b) {
      return b < (ac.cutoff != null ? ac.cutoff : 0.08);
    },
    _layout() {
      const el = cnv || (CONTEXT[0] && CONTEXT[0][0]);
      if (!el || !el.getBoundingClientRect) return;
      const r = el.getBoundingClientRect();
      const bw = (ac.w / PX) * r.width;
      const bh = (ac.h / PY) * r.height;
      OAS(host.style, {
        position: "fixed",
        left: r.left + (ac.x / PX) * r.width + ac.dx + "px",
        top: r.top + (ac.y / PY) * r.height + ac.dy + "px",
        width: bw + "px",
        height: bh + "px",
        boxSizing: "border-box",
      });
      if (ac.cols > 0 && ac.rows > 0) {
        const fs = bh / ac.rows;
        const gw = ac.cols * fs * ac.ratio;
        const sx = bw / gw;
        const tx = abs(sx - 1) < 0.001 ? "" : "scaleX(" + sx + ")";
        OAS(pre.style, {
          fontSize: fs + "px",
          lineHeight: fs + "px",
          letterSpacing: "0",
          width: gw + "px",
          height: bh + "px",
          transform: tx,
          transformOrigin: "top left",
        });
      }
    },
    _blendTxt(cols, rows) {
      const tb = Clamp(ac.textBlend, 0, 1);
      if (tb <= 0 || !ac._txt) return;
      const src = IsFunc(ac._txt) ? ac._txt(ac) : ac._txt;
      if (!src) return;
      const lines = src.split("\n");
      For(0, rows, (y) => {
        const tl = lines[y] || "";
        For(0, cols, (x) => {
          const tc = tl[x] || " ";
          tc !== " " && (tb >= 1 || RN.r() < tb) && (ac._buf[y][x] = tc);
        });
      });
    },
    _post(cols, rows) {
      For(0, rows, (y) => {
        ac._sl && ac._sl(ac, y, ac._buf[y]);
        ac._ch &&
          For(0, cols, (x) => {
            const ch = ac._buf[y][x];
            const next = ac._ch(x, y, ch, 0, 0, 0, 0, 0);
            next != null && (ac._buf[y][x] = next);
          });
      });
    },
    upd() {
      const lv = layer.cnv;
      const cols = max(1, lv.width);
      const rows = max(1, lv.height);
      ac.cols = cols;
      ac.rows = rows;
      ac._layout();
      const ctx = CGX(lv, "2d");
      const img = ctx.getImageData(0, 0, cols, rows).data;
      AsciiConvert(ac, cols, rows, img);
      ac._blendTxt(cols, rows);
      ac._post(cols, rows);
      const lines = [];
      For(0, rows, (y) => lines.push(ac._buf[y].join("")));
      pre.textContent = lines.join("\n");
      return ac;
    },
  };

  OnResize(() => ac.upd());
  ac._layout();
  return ac;
};
