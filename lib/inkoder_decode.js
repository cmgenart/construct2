/**
 * Inkoder decoder. Frozen grammar from the line editor:
 *   shape  = type + aDigits + "_" + vecs + ("_" + channel + digits)*
 *   shapes joined with "$"
 * Positions are two base62 digits per axis (0–3843). Extra channels are one digit (0–61).
 * `a` is a run of single digits; the editor always writes a single 0.
 */
const INK_DEC_KEY = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

function inkIndex(ch) {
  const i = INK_DEC_KEY.indexOf(ch);
  if (i < 0) throw new Error("Inkoder digit");
  return i;
}

function inkDec2(a, b) {
  return inkIndex(a) * 62 + inkIndex(b);
}

function inkDecodeShape(src) {
  let i = 0;
  const t = src[i++];
  if (t !== "l" && t !== "f") throw new Error("Inkoder type");
  const a = [];
  while (i < src.length && INK_DEC_KEY.indexOf(src[i]) >= 0) a.push(inkIndex(src[i++]));
  if (src[i++] !== "_") throw new Error("Inkoder separator");
  let vecs = "";
  while (i < src.length && src[i] !== "_") vecs += src[i++];
  if (vecs.length % 4 !== 0) throw new Error("Inkoder points");
  const pts = [];
  for (let k = 0; k < vecs.length; k += 4) {
    pts.push({
      x: inkDec2(vecs[k], vecs[k + 1]),
      y: inkDec2(vecs[k + 2], vecs[k + 3]),
    });
  }
  while (src[i] === "_") {
    i++;
    const code = src[i++];
    if (!code) throw new Error("Inkoder channel");
    for (let n = 0; n < pts.length; n++) {
      pts[n][code] = inkIndex(src[i++]);
    }
  }
  if (i !== src.length) throw new Error("Inkoder tail");
  pts.t = t;
  pts.a = a;
  return pts;
}

function inkDecode(data) {
  const text = String(data || "").trim();
  if (!text) return [];
  return text.split("$").filter(Boolean).map(inkDecodeShape);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { INK_DEC_KEY, inkDecode, inkDecodeShape };
}
