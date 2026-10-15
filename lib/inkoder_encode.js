/**
 * Inkoder encoder. Pairs with inkoder_decode.js.
 * Each shape is type `l` (channels w, s) or `f` (channels c, d, s).
 * The editor writes `a` as [0], matching the original save path.
 */
const INK_ENC_KEY = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

function inkClamp(n, hi) {
  n = Math.round(Number(n) || 0);
  if (n < 0) return 0;
  if (n > hi) return hi;
  return n;
}

function inkEncInt(n) {
  return INK_ENC_KEY[inkClamp(n, 61)];
}

function inkEncInt2(n) {
  n = inkClamp(n, 3843);
  return INK_ENC_KEY[Math.floor(n / 62)] + INK_ENC_KEY[n % 62];
}

function inkEncodeShape(def) {
  const t = def && def.t === "f" ? "f" : "l";
  const chars = t === "f" ? "cds" : "ws";
  const vecs = (def && def.v) || [];
  const a = def && def.a && def.a.length ? def.a : [0];
  let out = t;
  for (let i = 0; i < a.length; i++) out += inkEncInt(a[i]);
  out += "_";
  for (let i = 0; i < vecs.length; i++) {
    out += inkEncInt2(vecs[i].x) + inkEncInt2(vecs[i].y);
  }
  for (let c = 0; c < chars.length; c++) {
    const ch = chars[c];
    out += "_" + ch;
    for (let i = 0; i < vecs.length; i++) {
      const v = vecs[i][ch];
      out += inkEncInt(v == null ? 10 : v);
    }
  }
  return out;
}

function inkEncode(lines) {
  const parts = [];
  const list = lines || [];
  for (let i = 0; i < list.length; i++) {
    const ln = list[i];
    if (!ln || !ln.length) continue;
    parts.push(inkEncodeShape({ t: ln.t || "l", a: ln.a && ln.a.length ? ln.a : [0], v: ln }));
  }
  return parts.join("$");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { inkEncode, inkEncodeShape };
}
