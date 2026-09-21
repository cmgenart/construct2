/**
 * Colour wire-format conversion for advBuilder params (see docs/PARAM-SPEC.md).
 * Picker uses internal HSVA: H 0–360, S/V/A 0–1.
 */

const COLOUR_PARAM_TYPES = new Set([
  "PARAM-RGB",
  "PARAM-HSV",
  "PARAM-HSL",
  "PARAM-HEX",
]);

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function round(n, places) {
  const p = 10 ** places;
  return Math.round(n * p) / p;
}

/** @param {{ h?: number, s?: number, v?: number, a?: number }} a */
/** @param {{ h?: number, s?: number, v?: number, a?: number }} b */
function hsvaEqual(a, b, eps = 1e-6) {
  if (!a || !b) return false;
  return (
    Math.abs((a.h ?? 0) - (b.h ?? 0)) < eps &&
    Math.abs((a.s ?? 0) - (b.s ?? 0)) < eps &&
    Math.abs((a.v ?? 0) - (b.v ?? 0)) < eps &&
    Math.abs((a.a ?? 1) - (b.a ?? 1)) < eps
  );
}

function normalizeHsva(h, s, v, a) {
  let hh = Number(h);
  if (!Number.isFinite(hh)) hh = 0;
  hh = ((hh % 360) + 360) % 360;
  return {
    h: hh,
    s: clamp(Number(s), 0, 1),
    v: clamp(Number(v), 0, 1),
    a: clamp(Number(a), 0, 1),
  };
}

function rgbToHsv(r, g, b, a = 1) {
  const rn = clamp(Number(r), 0, 255) / 255;
  const gn = clamp(Number(g), 0, 255) / 255;
  const bn = clamp(Number(b), 0, 255) / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  const v = max;
  const s = max === 0 ? 0 : d / max;
  if (d !== 0) {
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }
  return normalizeHsva(h * 360, s, v, a);
}

function hsvToRgb(h, s, v, a = 1) {
  const { h: hh, s: ss, v: vv, a: aa } = normalizeHsva(h, s, v, a);
  const c = vv * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = vv - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
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
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
    a: aa,
  };
}

function rgbToHsl(r, g, b, a = 1) {
  const rn = clamp(Number(r), 0, 255) / 255;
  const gn = clamp(Number(g), 0, 255) / 255;
  const bn = clamp(Number(b), 0, 255) / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  const l = (max + min) / 2;
  let s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }
  return {
    h: h * 360,
    s: clamp(s, 0, 1),
    l: clamp(l, 0, 1),
    a: clamp(Number(a), 0, 1),
  };
}

function hslToRgb(h, s, l, a = 1) {
  const hh = ((Number(h) % 360) + 360) % 360 / 360;
  const ss = clamp(Number(s), 0, 1);
  const ll = clamp(Number(l), 0, 1);
  const aa = clamp(Number(a), 0, 1);
  if (ss === 0) {
    const v = Math.round(ll * 255);
    return { r: v, g: v, b: v, a: aa };
  }
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  const hue2rgb = (t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return {
    r: Math.round(hue2rgb(hh + 1 / 3) * 255),
    g: Math.round(hue2rgb(hh) * 255),
    b: Math.round(hue2rgb(hh - 1 / 3) * 255),
    a: aa,
  };
}

function parseHexString(hex) {
  if (typeof hex !== "string") return null;
  let s = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?$/.test(s)) return null;
  if (s.length === 3) {
    s = s
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  let a = 1;
  if (s.length === 8) {
    a = parseInt(s.slice(6, 8), 16) / 255;
  }
  return { r, g, b, a };
}

function rgbToHex(r, g, b, includeAlpha = false, a = 1) {
  const pad = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  let out = `#${pad(r)}${pad(g)}${pad(b)}`;
  if (includeAlpha) {
    out += pad(a * 255);
  }
  return out;
}

function isColourParamType(type) {
  return COLOUR_PARAM_TYPES.has(type);
}

/**
 * Normalized HSVA for picker / clipboard.
 * @param {string} type PARAM-RGB | PARAM-HSV | PARAM-HSL | PARAM-HEX
 * @param {*} value wire value from paramValues
 * @returns {{ h: number, s: number, v: number, a: number } | null}
 */
function fromNative(type, value) {
  if (value == null) return null;
  switch (type) {
    case "PARAM-RGB": {
      if (typeof value !== "object") return null;
      const { r, g, b, a = 1 } = value;
      if ([r, g, b].some((n) => typeof n !== "number" || Number.isNaN(n))) return null;
      return rgbToHsv(r, g, b, a);
    }
    case "PARAM-HSV": {
      if (typeof value !== "object") return null;
      const { h, s, v, a = 1 } = value;
      if ([h, s, v].some((n) => typeof n !== "number" || Number.isNaN(n))) return null;
      return normalizeHsva(h, s, v, a);
    }
    case "PARAM-HSL": {
      if (typeof value !== "object") return null;
      const { h, s, l, a = 1 } = value;
      if ([h, s, l].some((n) => typeof n !== "number" || Number.isNaN(n))) return null;
      const rgb = hslToRgb(h, s, l, a);
      return rgbToHsv(rgb.r, rgb.g, rgb.b, rgb.a);
    }
    case "PARAM-HEX": {
      const rgb = parseHexString(typeof value === "string" ? value : "");
      if (!rgb) return null;
      return rgbToHsv(rgb.r, rgb.g, rgb.b, rgb.a);
    }
    default:
      return null;
  }
}

/**
 * @param {string} type
 * @param {{ h: number, s: number, v: number, a: number }} hsva
 * @returns {object|string|null}
 */
function toNative(type, hsva) {
  if (!hsva) return null;
  const { h, s, v, a } = normalizeHsva(hsva.h, hsva.s, hsva.v, hsva.a);
  switch (type) {
    case "PARAM-RGB":
      return hsvToRgb(h, s, v, a);
    case "PARAM-HSV":
      return { h, s, v, a };
    case "PARAM-HSL": {
      const rgb = hsvToRgb(h, s, v, a);
      const { h: hh, s: ss, l, a: aa } = rgbToHsl(rgb.r, rgb.g, rgb.b, rgb.a);
      return { h: hh, s: ss, l, a: aa };
    }
    case "PARAM-HEX": {
      const rgb = hsvToRgb(h, s, v, a);
      return rgbToHex(rgb.r, rgb.g, rgb.b);
    }
    default:
      return null;
  }
}

/**
 * @param {string} type
 * @param {*} value
 * @returns {string}
 */
function formatReadout(type, value) {
  const fmt01 = (n) => {
    const x = Number(n);
    if (!Number.isFinite(x)) return "0";
    const r = round(x, 3);
    return String(r);
  };
  switch (type) {
    case "PARAM-RGB": {
      if (!value || typeof value !== "object") return "";
      const { r, g, b, a = 1 } = value;
      return `${r}, ${g}, ${b}, ${fmt01(a)}`;
    }
    case "PARAM-HSV": {
      if (!value || typeof value !== "object") return "";
      const { h, s, v, a = 1 } = value;
      return `${round(h, 1)}, ${fmt01(s)}, ${fmt01(v)}, ${fmt01(a)}`;
    }
    case "PARAM-HSL": {
      if (!value || typeof value !== "object") return "";
      const { h, s, l, a = 1 } = value;
      return `${round(h, 1)}, ${fmt01(s)}, ${fmt01(l)}, ${fmt01(a)}`;
    }
    case "PARAM-HEX":
      return typeof value === "string" ? value : "";
    default:
      return "";
  }
}

/**
 * CSS color for swatch background.
 * @param {string} type
 * @param {*} value
 * @returns {string|null}
 */
function toCssColor(type, value) {
  const hsva = fromNative(type, value);
  if (!hsva) return null;
  const { r, g, b, a } = hsvToRgb(hsva.h, hsva.s, hsva.v, hsva.a);
  if (a >= 1) return `rgb(${r},${g},${b})`;
  return `rgba(${r},${g},${b},${round(a, 3)})`;
}

/**
 * Parse clipboard HSVA JSON (picker copy/paste).
 * @param {string} text
 * @returns {{ h: number, s: number, v: number, a: number } | null}
 */
function parseClipboardHsva(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  let obj;
  try {
    obj = JSON.parse(text.trim());
  } catch (_) {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const { h, s, v, a = 1 } = obj;
  if ([h, s, v].some((n) => typeof n !== "number" || Number.isNaN(n))) return null;
  return normalizeHsva(h, s, v, a);
}

function formatClipboardHsva(hsva) {
  const { h, s, v, a } = normalizeHsva(hsva.h, hsva.s, hsva.v, hsva.a);
  return JSON.stringify({ h: round(h, 2), s: round(s, 4), v: round(v, 4), a: round(a, 4) });
}

function deepCloneColorValue(type, value) {
  const native = toNative(type, fromNative(type, value) || { h: 0, s: 0, v: 0, a: 1 });
  if (native == null) return value;
  if (typeof native === "object") return { ...native };
  return native;
}

/** Legacy HSV/HSL blobs stored as `{ r, g, b, a }` before scanner fix. */
function looksLikeRgbWire(obj) {
  return (
    obj &&
    typeof obj === "object" &&
    typeof obj.r === "number" &&
    typeof obj.g === "number" &&
    typeof obj.b === "number" &&
    !("h" in obj)
  );
}

/**
 * Normalize a persisted colour value to the param type's wire shape.
 * @returns {*} migrated value, or original if already valid / unmappable
 */
function migrateColorWireValue(type, value, defaultValue) {
  if (value == null) return value;
  if (type === "PARAM-HSV" || type === "PARAM-HSL") {
    if (looksLikeRgbWire(value)) {
      const hsva = rgbToHsv(value.r, value.g, value.b, value.a ?? 1);
      const native = toNative(type, hsva);
      if (native != null) return native;
    }
    const hsva = fromNative(type, value);
    if (hsva) {
      const native = toNative(type, hsva);
      if (native != null) return native;
    }
    if (defaultValue !== undefined) return cloneParamDefault(defaultValue);
    return value;
  }
  if (type === "PARAM-RGB" && typeof value === "object" && "h" in value) {
    const hsva = fromNative("PARAM-HSV", value);
    if (hsva) return hsvToRgb(hsva.h, hsva.s, hsva.v, hsva.a);
  }
  if (type === "PARAM-HEX" && typeof value === "string") {
    const hex = parseHexString(value);
    if (hex) return rgbToHex(hex.r, hex.g, hex.b);
  }
  return value;
}

function cloneParamDefault(v) {
  if (v === null || v === undefined) return v;
  if (typeof v !== "object") return v;
  try {
    return typeof structuredClone === "function"
      ? structuredClone(v)
      : JSON.parse(JSON.stringify(v));
  } catch (_) {
    return v;
  }
}

/**
 * Fix legacy colour keys in `paramValues` using `paramSchema` types.
 * @returns {{ values: object, changed: boolean }}
 */
function migrateParamValues(paramValues, schema) {
  const out =
    paramValues && typeof paramValues === "object" && !Array.isArray(paramValues)
      ? { ...paramValues }
      : {};
  let changed = false;
  for (const p of schema || []) {
    if (!COLOUR_PARAM_TYPES.has(p.type)) continue;
    const name = p.name;
    if (!(name in out)) continue;
    const next = migrateColorWireValue(p.type, out[name], p.default);
    if (JSON.stringify(next) !== JSON.stringify(out[name])) {
      out[name] = next;
      changed = true;
    }
  }
  return { values: out, changed };
}

module.exports = {
  COLOUR_PARAM_TYPES,
  clamp,
  normalizeHsva,
  hsvaEqual,
  rgbToHsv,
  hsvToRgb,
  rgbToHsl,
  hslToRgb,
  parseHexString,
  rgbToHex,
  isColourParamType,
  fromNative,
  toNative,
  formatReadout,
  toCssColor,
  parseClipboardHsva,
  formatClipboardHsva,
  deepCloneColorValue,
  migrateColorWireValue,
  migrateParamValues,
};
