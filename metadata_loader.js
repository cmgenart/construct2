/**
 * Load project metadata.js (CreateMetadata export).
 */
const fs = require("fs");
const path = require("path");

const DEFAULT_METADATA_TEMPLATE_PATH = path.join(
  __dirname,
  "templates",
  "metadata.js.default",
);

function readDefaultMetadataTemplateFile() {
  try {
    return fs.readFileSync(DEFAULT_METADATA_TEMPLATE_PATH, "utf8");
  } catch (_) {
    return null;
  }
}

/**
 * @param {string} projectPath — e.g. ../art/MyCollection
 */
function metadataJsPath(projectPath) {
  return path.resolve(__dirname, projectPath, "metadata.js");
}

/**
 * @param {string} projectPath
 */
function metadataJsExists(projectPath) {
  return fs.existsSync(metadataJsPath(projectPath));
}

/**
 * @param {string} projectPath
 * @returns {typeof DEFAULT_METADATA_TEMPLATE}
 */
function defaultMetadataTemplate() {
  return readDefaultMetadataTemplateFile() || "";
}

/**
 * @param {string} projectPath
 * @returns {((values: object, artSrc: string[]) => object)|null}
 */
/**
 * Normalize advBuilder → CreateMetadata calls (supports legacy 2-arg mistake).
 * @param {Function} fn
 */
function wrapCreateMetadata(fn) {
  return function createMetadataWrapped(values, properties, artSrc) {
    let props = properties;
    let chunks = artSrc;
    if (Array.isArray(properties) && artSrc === undefined) {
      chunks = properties;
      props = {};
    }
    if (!props || typeof props !== "object" || Array.isArray(props)) props = {};
    if (typeof chunks === "string") {
      /* full utf8link — assign to files[].src in CreateMetadata */
    } else if (!Array.isArray(chunks)) {
      chunks = [];
    }
    return fn(values, props, chunks);
  };
}

function loadCreateMetadata(projectPath) {
  const p = metadataJsPath(projectPath);
  if (!fs.existsSync(p)) return null;
  try {
    const resolved = require.resolve(p);
    delete require.cache[resolved];
    const mod = require(resolved);
    let fn = null;
    if (typeof mod.CreateMetadata === "function") fn = mod.CreateMetadata;
    else if (typeof mod.default === "function") fn = mod.default;
    if (!fn) return null;
    return wrapCreateMetadata(fn);
  } catch (e) {
    console.error("[advBuilder] metadata.js load error:", e.message || e);
    return null;
  }
}

/**
 * @param {string} projectPath
 */
function hasMetadataBuilder(projectPath) {
  return loadCreateMetadata(projectPath) != null;
}

/**
 * Write default metadata.js to project root.
 * @param {string} projectPath
 * @returns {{ ok: boolean, path?: string, error?: string }}
 */
function writeDefaultMetadataJs(projectPath) {
  const p = metadataJsPath(projectPath);
  if (fs.existsSync(p)) {
    return { ok: false, error: "metadata.js already exists" };
  }
  try {
    fs.writeFileSync(p, defaultMetadataTemplate(), "utf8");
    return { ok: true, path: p };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

const PRIMARY_METADATA_FILE = "metadata.json";

const PIECE_NON_METADATA_JSON = new Set([
  "values.json",
  "properties.json",
  "pieceRecord.json",
  "errors.json",
]);

/**
 * True when CreateMetadata returned a legacy single CIP-25 root (has "721").
 * @param {object} obj
 */
function isLegacyMetadataRoot(obj) {
  return obj && typeof obj === "object" && !Array.isArray(obj) && "721" in obj;
}

/**
 * Normalize CreateMetadata return to { "<filename>.json": metadataRoot }.
 * Legacy: `{ 721: … }` → `{ "metadata.json": … }`.
 * Multi: keys are target filenames, e.g. `{ "metadata.json": …, "metadata.readable.json": … }`.
 * @param {object} result
 * @returns {{ ok: true, files: Record<string, object> } | { ok: false, error: string }}
 */
function normalizeCreateMetadataResult(result) {
  if (result == null || typeof result !== "object" || Array.isArray(result)) {
    return { ok: false, error: "CreateMetadata must return an object" };
  }
  if (isLegacyMetadataRoot(result)) {
    return { ok: true, files: { [PRIMARY_METADATA_FILE]: result } };
  }
  const keys = Object.keys(result);
  if (!keys.length) {
    return { ok: false, error: "CreateMetadata returned an empty object" };
  }
  const files = {};
  for (const key of keys) {
    if (!key.endsWith(".json")) {
      return {
        ok: false,
        error: `CreateMetadata multi-file keys must end with .json (got "${key}")`,
      };
    }
    const val = result[key];
    if (val == null || typeof val !== "object" || Array.isArray(val)) {
      return {
        ok: false,
        error: `CreateMetadata file "${key}" must be an object`,
      };
    }
    files[key] = val;
  }
  return { ok: true, files };
}

/**
 * Post-process each metadata root (Cardano split, utf8link injection).
 * @param {Record<string, object>} files
 * @param {string|string[]} utf8link
 * @param {boolean} cardanoSplit
 * @returns {Record<string, { pretty: string, min: string, size: number, object: object }>}
 */
function processMetadataOutputs(files, utf8link, cardanoSplit = true) {
  const { finalizeMetadataForBuild, byteLength } = require("./cardano_metadata_split.js");
  const outputs = {};
  for (const [filename, root] of Object.entries(files)) {
    const object = finalizeMetadataForBuild(root, utf8link, cardanoSplit);
    const min = JSON.stringify(object);
    outputs[filename] = {
      pretty: JSON.stringify(object, null, 2),
      min,
      size: byteLength(min),
      object,
    };
  }
  return outputs;
}

/**
 * Piece-dir JSON files that are metadata outputs (not values/properties/etc.).
 * @param {string} filename
 */
function isMetadataOutputFilename(filename) {
  return (
    typeof filename === "string" &&
    filename.endsWith(".json") &&
    !PIECE_NON_METADATA_JSON.has(filename)
  );
}

/** Extract first asset inner object from CIP-25 metadata for lastBuild.metadata_inner compat. */
function extractMetadataInner(metadata) {
  if (!metadata || typeof metadata !== "object") return null;
  const c721 = metadata["721"];
  if (!c721 || typeof c721 !== "object") return null;
  const policies = Object.keys(c721);
  if (!policies.length) return null;
  const assets = c721[policies[0]];
  if (!assets || typeof assets !== "object") return null;
  const names = Object.keys(assets);
  if (!names.length) return null;
  return assets[names[0]];
}

module.exports = {
  metadataJsPath,
  metadataJsExists,
  loadCreateMetadata,
  wrapCreateMetadata,
  hasMetadataBuilder,
  writeDefaultMetadataJs,
  defaultMetadataTemplate,
  extractMetadataInner,
  PRIMARY_METADATA_FILE,
  PIECE_NON_METADATA_JSON,
  isLegacyMetadataRoot,
  normalizeCreateMetadataResult,
  processMetadataOutputs,
  isMetadataOutputFilename,
};
