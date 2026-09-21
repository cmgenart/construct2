/**
 * Scan art source for build-time value insert expressions.
 * Discovers PMaster value inserts (slash-star-bracket expressions) and values.key string placeholders.
 */

const VALUE_INSERT_RE = /[0-9]*?\/\*?\[(.*?)\]\*?\//g;
const STRING_VALUES_RE = /\/\[\s*values\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\]\//g;
const STRING_PIECE_RE = /\/\[\s*piece\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\]\//g;
const IF_VALUES_RE = /#IF\[\s*values\.([a-zA-Z_][a-zA-Z0-9_]*)/g;

const { COMPUTED_KEYS } = require("./build_value_derived.js");

/** Flat keys always offered when not found in source (build / metadata). */
const BASELINE_KEYS = [
  "artist",
  "name",
  "description",
  "website",
  "tag",
  "num",
  "seed",
  "collection_name",
  "collection_size",
  "collection_description",
  "policy",
];

/**
 * Map insert expression to a flat Values-panel key.
 * @param {string} expr
 * @returns {string|null}
 */
function exprToFlatKey(expr) {
  const e = (expr || "").trim();
  if (!e) return null;
  const valuesM = e.match(/^values\.([a-zA-Z_][a-zA-Z0-9_]*)$/);
  if (valuesM) return valuesM[1];
  const pieceM = e.match(/^piece\.([a-zA-Z_][a-zA-Z0-9_]*)$/);
  if (pieceM) {
    const sub = pieceM[1];
    if (sub === "seed") return "seed";
    if (sub === "num") return "num";
    if (sub === "tag") return "tag";
    if (sub === "hash") return "hash";
    return `piece_${sub}`;
  }
  const collectionM = e.match(/^collection\.([a-zA-Z_][a-zA-Z0-9_]*)$/);
  if (collectionM) {
    const sub = collectionM[1];
    if (sub === "name") return "collection_name";
    if (sub === "size") return "collection_size";
    if (sub === "description") return "collection_description";
    return `collection_${sub}`;
  }
  const artistM = e.match(/^artist\.([a-zA-Z_][a-zA-Z0-9_]*)$/);
  if (artistM && artistM[1] === "name") return "artist";
  return null;
}

/**
 * @param {string} content
 * @returns {Set<string>}
 */
function scanContentForKeys(content) {
  const keys = new Set();
  if (!content) return keys;

  let m;
  const vi = new RegExp(VALUE_INSERT_RE.source, VALUE_INSERT_RE.flags);
  while ((m = vi.exec(content)) !== null) {
    const key = exprToFlatKey(m[1]);
    if (key && !COMPUTED_KEYS.has(key)) keys.add(key);
  }

  const sv = new RegExp(STRING_VALUES_RE.source, STRING_VALUES_RE.flags);
  while ((m = sv.exec(content)) !== null) {
    if (!COMPUTED_KEYS.has(m[1])) keys.add(m[1]);
  }

  const sp = new RegExp(STRING_PIECE_RE.source, STRING_PIECE_RE.flags);
  while ((m = sp.exec(content)) !== null) {
    const key = exprToFlatKey(`piece.${m[1]}`);
    if (key && !COMPUTED_KEYS.has(key)) keys.add(key);
  }

  const iv = new RegExp(IF_VALUES_RE.source, IF_VALUES_RE.flags);
  while ((m = iv.exec(content)) !== null) {
    if (!COMPUTED_KEYS.has(m[1])) keys.add(m[1]);
  }

  return keys;
}

/**
 * Keys referenced in source only (no baseline list).
 * @param {{ file: string, content: string }[]} bundles
 * @returns {string[]}
 */
function scanBuildValueSourcesFromContent(bundles) {
  const keys = new Set();
  for (const { content } of bundles) {
    for (const k of scanContentForKeys(content)) keys.add(k);
  }
  return [...keys].sort();
}

/**
 * Full schema: baseline builder keys plus any key found in source.
 * @param {{ file: string, content: string }[]} bundles
 * @returns {string[]} sorted unique flat keys
 */
function scanBuildValueSources(bundles) {
  const keys = new Set(BASELINE_KEYS);
  for (const k of scanBuildValueSourcesFromContent(bundles)) keys.add(k);
  return [...keys].sort();
}

/** Keys required by builder defaults or found in art source — not user-removable. */
function lockedBuildValueKeys(bundles) {
  const keys = new Set(BASELINE_KEYS);
  for (const k of scanBuildValueSourcesFromContent(bundles)) keys.add(k);
  return [...keys].sort();
}

module.exports = {
  scanBuildValueSources,
  scanBuildValueSourcesFromContent,
  lockedBuildValueKeys,
  exprToFlatKey,
  COMPUTED_KEYS,
  BASELINE_KEYS,
};
