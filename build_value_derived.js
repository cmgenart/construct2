/**
 * Build-time derived value keys (from `num`, properties, etc.).
 * @see builder.pmaster_process.js ArtBuilder
 */

/** Keys computed during build — not user-editable in Values panel. */
const DERIVED_NUM_PAD_KEYS = ["num_pad2", "num_pad3", "num_pad4"];

const COMPUTED_KEYS = new Set([
  "has_properties",
  "property_names",
  ...DERIVED_NUM_PAD_KEYS,
]);

function formatPaddedInt(num, length) {
  const n = Math.max(0, Math.floor(Number(num) || 0));
  return String(n).padStart(length, "0");
}

function parsePieceNum(flat) {
  const n = parseInt(flat?.num, 10);
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

/**
 * Add auto-generated padded piece numbers from flat `num`.
 * @param {Record<string, string>} flat
 * @returns {Record<string, string>}
 */
function applyDerivedBuildValues(flat) {
  const out = { ...(flat || {}) };
  const num = parsePieceNum(out);
  out.num_pad2 = formatPaddedInt(num, 2);
  out.num_pad3 = formatPaddedInt(num, 3);
  out.num_pad4 = formatPaddedInt(num, 4);
  return out;
}

module.exports = {
  DERIVED_NUM_PAD_KEYS,
  COMPUTED_KEYS,
  formatPaddedInt,
  parsePieceNum,
  applyDerivedBuildValues,
};
