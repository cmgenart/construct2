/**
 * Coerce bare art → host param values using scanned schema (see PARAM-SPEC.md).
 * Types/constraints live in //PARAM-* markers, not in SendParams payloads.
 */

let _paramColorApi = null;

/** Node tests use require; dev-ui browser uses g.advParamColor (load param_color.js first). */
function paramColorApi() {
  if (_paramColorApi) return _paramColorApi;
  const g =
    typeof globalThis !== "undefined"
      ? globalThis
      : typeof window !== "undefined"
        ? window
        : {};
  if (g.advParamColor) {
    _paramColorApi = g.advParamColor;
    return _paramColorApi;
  }
  if (typeof require === "function") {
    try {
      _paramColorApi = require("./param_color.js");
    } catch (_) {
      /* browser */
    }
  }
  return _paramColorApi;
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function snapToStep(v, low, high, step) {
  let n = Number(v);
  if (!Number.isFinite(n)) return null;
  n = clamp(n, low, high);
  if (step > 0 && Number.isFinite(step)) {
    const steps = Math.round((n - low) / step);
    n = low + steps * step;
    n = clamp(n, low, high);
  }
  return n;
}

function parseVec2Raw(raw) {
  if (Array.isArray(raw) && raw.length >= 2) {
    const x = Number(raw[0]);
    const y = Number(raw[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const x = Number(raw.x);
    const y = Number(raw.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }
  return null;
}

/**
 * @param {object} entry schema row (PARAM-FLOAT, etc.)
 * @param {*} raw value from art SendParams
 * @returns {*} coerced wire value, or null if incompatible
 */
function coerceParamValue(entry, raw) {
  if (!entry || !entry.type) return null;
  switch (entry.type) {
    case "PARAM-FLOAT": {
      const n = snapToStep(raw, entry.low, entry.high, entry.step);
      return n == null ? null : n;
    }
    case "PARAM-INT": {
      const n = snapToStep(raw, entry.low, entry.high, entry.step);
      if (n == null) return null;
      return Math.round(n);
    }
    case "PARAM-NUMBER": {
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    case "PARAM-BOOLEAN": {
      if (raw === 0 || raw === 1) return raw;
      if (raw === true) return 1;
      if (raw === false) return 0;
      return null;
    }
    case "PARAM-STRING": {
      if (raw === null) return null;
      if (typeof raw === "string") return raw;
      if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
      return null;
    }
    case "PARAM-CHOICE":
    case "PARAM-DROPDOWN": {
      if (typeof raw !== "string") return null;
      const choices = entry.choices || [];
      return choices.includes(raw) ? raw : null;
    }
    case "PARAM-ARRAY": {
      if (Array.isArray(raw)) return raw;
      if (raw === null) return null;
      if (typeof raw === "string") {
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed : null;
        } catch (_) {
          return null;
        }
      }
      return null;
    }
    case "PARAM-RGB": {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
      const { r, g, b, a = 1 } = raw;
      if ([r, g, b, a].some((n) => typeof n !== "number" || Number.isNaN(n))) return null;
      return {
        r: Math.round(clamp(r, 0, 255)),
        g: Math.round(clamp(g, 0, 255)),
        b: Math.round(clamp(b, 0, 255)),
        a: clamp(a, 0, 1),
      };
    }
    case "PARAM-HSV":
    case "PARAM-HSL":
    case "PARAM-HEX": {
      const pc = paramColorApi();
      if (!pc || !pc.COLOUR_PARAM_TYPES.has(entry.type)) return null;
      const migrated = pc.migrateColorWireValue(entry.type, raw, entry.default);
      if (entry.type === "PARAM-HEX") {
        if (typeof migrated !== "string") return null;
        const rgb = pc.parseHexString(migrated);
        return rgb ? pc.rgbToHex(rgb.r, rgb.g, rgb.b) : null;
      }
      if (!migrated || typeof migrated !== "object") return null;
      return migrated;
    }
    case "PARAM-BUTTON":
      return null;
    case "PARAM-VEC2": {
      const parsed = parseVec2Raw(raw);
      if (!parsed) return null;
      const x = snapToStep(parsed.x, entry.min.x, entry.max.x, entry.step);
      const y = snapToStep(parsed.y, entry.min.y, entry.max.y, entry.step);
      if (x == null || y == null) return null;
      return [x, y];
    }
    default:
      return null;
  }
}

/**
 * @param {object[]} schema
 * @param {object} patch bare map from SendParams
 * @returns {{ values: object, remove: string[], relay: object }}
 */
function coerceParamPatch(schema, patch) {
  const values = {};
  const remove = [];
  const relay = {};
  const byName = new Map((schema || []).map((p) => [p.name, p]));

  for (const name of Object.keys(patch || {})) {
    const entry = byName.get(name);
    if (!entry) continue;
    const raw = patch[name];
    if (raw === null) {
      if (entry.type === "PARAM-STRING") {
        values[name] = null;
        relay[name] = null;
      }
      continue;
    }
    const coerced = coerceParamValue(entry, raw);
    if (coerced === null) continue;
    values[name] = coerced;
    relay[name] = coerced;
  }

  return { values, remove, relay };
}

module.exports = {
  coerceParamValue,
  coerceParamPatch,
  clamp,
  snapToStep,
  parseVec2Raw,
};
