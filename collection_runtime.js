/**
 * Collection v2 merge + build helpers.
 * @see docs/COLLECTION-DESIGN-V2.md §5.0
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const CollectionFs = require("./collection_fs.js");
const { discoverImportGraph } = require("./import_resolve.js");
const { CANONICAL_SOURCE_NAMES } = require("./source_inventory.js");

const SOURCE_FILE_NAMES = CANONICAL_SOURCE_NAMES;

const BUILD_VALUE_LEVELS = ["default", "collection", "piece", "override"];
const PROPERTY_LEVELS = ["viewer", "collection", "piece", "override"];

function flatUseTrue(bag) {
  const out = {};
  if (!bag || typeof bag !== "object") return out;
  for (const [key, entry] of Object.entries(bag)) {
    if (entry && entry.use) {
      out[key] = entry.value != null ? String(entry.value) : "";
    }
  }
  return out;
}

/** Flat merged build values → piece-level Values bag (all keys used, use: true). */
function flatToValueBag(flat) {
  const out = {};
  if (!flat || typeof flat !== "object") return out;
  for (const [key, entry] of Object.entries(flat)) {
    if (entry == null) continue;
    if (typeof entry === "object" && ("value" in entry || "use" in entry)) {
      if (entry.use) {
        out[key] = {
          value: entry.value != null ? String(entry.value) : "",
          use: true,
        };
      }
      continue;
    }
    const s = String(entry);
    if (s !== "") out[key] = { value: s, use: true };
  }
  return out;
}

function cloneUseTrueBag(bag) {
  const out = {};
  for (const [key, entry] of Object.entries(bag || {})) {
    if (!entry || !entry.use) continue;
    out[key] = {
      value: entry.value != null ? String(entry.value) : "",
      use: true,
    };
  }
  return out;
}

/** Committed build output (supports legacy lastBuiltProperties). */
function getPieceProperties(pieceRecord) {
  if (!pieceRecord) return {};
  if (
    pieceRecord.properties &&
    typeof pieceRecord.properties === "object" &&
    Object.keys(pieceRecord.properties).length
  ) {
    return { ...pieceRecord.properties };
  }
  if (
    pieceRecord.lastBuiltProperties &&
    typeof pieceRecord.lastBuiltProperties === "object"
  ) {
    return { ...pieceRecord.lastBuiltProperties };
  }
  return {};
}

function hasPieceProperties(pieceRecord) {
  return Object.keys(getPieceProperties(pieceRecord)).length > 0;
}

function propertiesToPieceLevelBag(properties) {
  const out = {};
  for (const [key, val] of Object.entries(properties || {})) {
    if (val != null && val !== "") {
      out[key] = { value: String(val), use: true };
    }
  }
  return out;
}

function snapshotOverrideProperties(overrideLevelBag) {
  return cloneUseTrueBag(overrideLevelBag);
}

function fixedPropertyKeySet(collection, pieceRecord) {
  return new Set([
    ...Object.keys((collection && collection.fixedProperties) || {}),
    ...Object.keys((pieceRecord && pieceRecord.fixedProperties) || {}),
  ]);
}

/** Locked parameters for first build / random (SetRandomProperties fixed map). */
function buildCollectionLocks(collection, pieceRecord) {
  return {
    ...(collection.fixedProperties || {}),
    ...flatUseTrue(collection.propertyOverrides),
    ...(pieceRecord.fixedProperties || {}),
    ...flatUseTrue(pieceRecord.overrideProperties),
  };
}

/** Full deterministic recipe for rebuild (every key fixed — no re-roll). */
function buildCollectionFullRecipe(collection, pieceRecord) {
  return {
    ...getPieceProperties(pieceRecord),
    ...flatUseTrue(collection.propertyOverrides),
    ...(collection.fixedProperties || {}),
    ...flatUseTrue(pieceRecord.overrideProperties),
    ...(pieceRecord.fixedProperties || {}),
  };
}

/** @deprecated use buildCollectionLocks or buildCollectionFullRecipe */
function buildCollectionFixedMap(collection, pieceRecord, devPropertyLevels) {
  const locks = buildCollectionLocks(collection, pieceRecord);
  Object.assign(locks, flatUseTrue((devPropertyLevels && devPropertyLevels.override) || {}));
  return locks;
}

function isPropertyLocked(collection, pieceRecord, devPropertyLevels, propName) {
  const key = String(propName || "");
  if (!key) return false;
  if ((collection.fixedProperties || {})[key] !== undefined) return true;
  const collBag = collection.propertyOverrides || {};
  if (collBag[key] && collBag[key].use) return true;
  if ((pieceRecord.fixedProperties || {})[key] !== undefined) return true;
  const snap = pieceRecord.overrideProperties || {};
  if (snap[key] && snap[key].use) return true;
  const live = (devPropertyLevels && devPropertyLevels.override) || {};
  if (live[key] && live[key].use) return true;
  return false;
}

function lockedPropertyKeys(collection, pieceRecord, devPropertyLevels) {
  const keys = new Set();
  for (const k of Object.keys(collection.fixedProperties || {})) keys.add(k);
  for (const [k, e] of Object.entries(collection.propertyOverrides || {})) {
    if (e && e.use) keys.add(k);
  }
  for (const k of Object.keys(pieceRecord.fixedProperties || {})) keys.add(k);
  for (const [k, e] of Object.entries(pieceRecord.overrideProperties || {})) {
    if (e && e.use) keys.add(k);
  }
  for (const [k, e] of Object.entries((devPropertyLevels && devPropertyLevels.override) || {})) {
    if (e && e.use) keys.add(k);
  }
  return keys;
}

/** Migrate legacy piece fields → properties / overrideProperties. */
function migratePieceRecordFields(pieceRecord) {
  if (!pieceRecord) return false;
  let changed = false;

  const props = getPieceProperties(pieceRecord);
  if (
    !pieceRecord.properties ||
    typeof pieceRecord.properties !== "object" ||
    (!Object.keys(pieceRecord.properties).length && Object.keys(props).length)
  ) {
    pieceRecord.properties = { ...props };
    changed = true;
  }

  if (!pieceRecord.overrideProperties || typeof pieceRecord.overrideProperties !== "object") {
    pieceRecord.overrideProperties = {};
    changed = true;
  }

  const legacy = pieceRecord.propertyOverrides || {};
  const legacyUse = Object.keys(legacy).filter((k) => legacy[k] && legacy[k].use);
  const propCount = Object.keys(pieceRecord.properties || {}).length;
  const fixedCount = Object.keys(pieceRecord.fixedProperties || {}).length;

  if (legacyUse.length > 0 && legacyUse.length <= fixedCount + 8 && legacyUse.length < propCount * 0.6) {
    for (const k of legacyUse) {
      if (!pieceRecord.overrideProperties[k]) {
        pieceRecord.overrideProperties[k] = {
          value: legacy[k].value != null ? String(legacy[k].value) : "",
          use: true,
        };
        changed = true;
      }
    }
  }

  if (pieceRecord.propertyOverrides) {
    delete pieceRecord.propertyOverrides;
    changed = true;
  }

  if (pieceRecord.lastBuiltProperties && Object.keys(pieceRecord.properties || {}).length) {
    delete pieceRecord.lastBuiltProperties;
    changed = true;
  }

  return changed;
}

function mergeBuildValueBags(bags, seed) {
  const out = {};
  for (const level of BUILD_VALUE_LEVELS) {
    const bag = bags[level] || {};
    for (const [key, entry] of Object.entries(bag)) {
      if (entry && entry.use) {
        out[key] = entry.value != null ? String(entry.value) : "";
      }
    }
  }
  if (seed != null && !Number.isNaN(Number(seed))) {
    out.seed = String(seed);
  }
  out.num = out.num || "1";
  return out;
}

function buildCollectionValueBags(devBuildValueLevels, collection, pieceRecord) {
  return {
    default: (devBuildValueLevels && devBuildValueLevels.default) || {},
    collection: collection.values || {},
    piece: pieceRecord.values || {},
    override: (devBuildValueLevels && devBuildValueLevels.override) || {},
  };
}

function mergePropertiesForPreview(devPropertyLevels, collection, pieceRecord) {
  return buildCollectionFullRecipe(collection, pieceRecord);
}

function computeSourceFingerprint(files, projectPath) {
  const hash = crypto.createHash("sha256");
  for (const name of SOURCE_FILE_NAMES) {
    hash.update(name);
    hash.update("\0");
    hash.update(files[name] || "");
    hash.update("\0");
  }
  if (projectPath) {
    const { hashImportFiles } = require("./import_resolve.js");
    hash.update("\0imports\0");
    hash.update(hashImportFiles(projectPath, files));
  }
  return "sha256:" + hash.digest("hex");
}

function copySourceSnapshot(projectPath, pad2str, files) {
  const dest = path.join(CollectionFs.buildTreePath(projectPath, pad2str), "_source");
  fs.mkdirSync(dest, { recursive: true });
  const written = new Set();

  const writeRel = (rel, content) => {
    const normalized = String(rel || "").replace(/\\/g, "/").trim();
    if (!normalized || normalized.includes("..")) return;
    if (written.has(normalized)) return;
    written.add(normalized);
    const outPath = path.join(dest, normalized);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, content == null ? "" : String(content), "utf8");
  };

  for (const name of SOURCE_FILE_NAMES) {
    if (files[name] != null) {
      writeRel(name, files[name]);
    }
  }

  const graph = discoverImportGraph(projectPath, files);
  for (const entry of [...graph.values()].sort((a, b) =>
    a.rel.localeCompare(b.rel),
  )) {
    if (entry.error || entry.content == null) continue;
    writeRel(entry.rel, entry.content);
  }

  pruneSourceSnapshotDir(dest, written);
}

function pruneSourceSnapshotDir(dest, written) {
  if (!fs.existsSync(dest)) return;
  for (const name of fs.readdirSync(dest)) {
    const full = path.join(dest, name);
    let st;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      pruneSourceSnapshotDir(full, written);
      try {
        if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
      } catch (_) {
        /* ignore */
      }
      continue;
    }
    const rel = path.relative(dest, full).replace(/\\/g, "/");
    if (!written.has(rel)) {
      try {
        fs.unlinkSync(full);
      } catch (_) {
        /* ignore */
      }
    }
  }
}

const PIECE_OUTPUT_FILES = {
  full: "full.html",
  min: "min.html",
  utf8: "utf8.txt",
  metadata: "metadata.json",
  metadata_min: "metadata.json",
};

function mapArtBuilderOutputToPieceDir(output, pieceDir, pieceRecord) {
  fs.mkdirSync(pieceDir, { recursive: true });
  const write = (name, data, ext) => {
    if (data === undefined || data === null) return;
    const body =
      ext === "json" && typeof data !== "string"
        ? JSON.stringify(data, null, 2)
        : String(data);
    fs.writeFileSync(path.join(pieceDir, `${name}.${ext}`), body, "utf8");
  };
  write("full", output.output, "html");
  write("min", output.output_min, "html");
  write("utf8", output.utf8link, "txt");
  if (output.metadata_outputs && typeof output.metadata_outputs === "object") {
    for (const [filename, entry] of Object.entries(output.metadata_outputs)) {
      if (!filename.endsWith(".json") || !entry || entry.min == null) continue;
      fs.writeFileSync(path.join(pieceDir, filename), entry.min, "utf8");
    }
  } else {
    write("metadata", output.metadata_min || output.metadata, "json");
  }
  write("values", output._collectionValuesFlat || {}, "json");
  write("properties", output.activeprops || {}, "json");
  fs.writeFileSync(
    path.join(pieceDir, "pieceRecord.json"),
    JSON.stringify(pieceRecord, null, 2),
    "utf8",
  );
  const errPath = path.join(pieceDir, "errors.json");
  if (output.errors && output.errors.length) {
    write("errors", output.errors, "json");
  } else if (fs.existsSync(errPath)) {
    fs.unlinkSync(errPath);
  }
}

function writePieceBuildFailure(pieceDir, errors) {
  fs.mkdirSync(pieceDir, { recursive: true });
  const errList = Array.isArray(errors) ? errors : [];
  fs.writeFileSync(
    path.join(pieceDir, "errors.json"),
    JSON.stringify(errList, null, 2),
    "utf8",
  );
}

function migratePropertyLevelsViewer(propertyLevels) {
  if (!propertyLevels || typeof propertyLevels !== "object") {
    return { viewer: {}, collection: {}, piece: {}, override: {} };
  }
  if (!propertyLevels.viewer && propertyLevels.default) {
    propertyLevels.viewer = propertyLevels.default;
  }
  for (const level of PROPERTY_LEVELS) {
    if (!propertyLevels[level] || typeof propertyLevels[level] !== "object") {
      propertyLevels[level] = {};
    }
  }
  return propertyLevels;
}

function getRootFixedProperties(propertyLevels, shuffle, helpers) {
  migratePropertyLevelsViewer(propertyLevels);
  if (!shuffle) {
    return { ...flatUseTrue(propertyLevels.viewer) };
  }
  return helpers.getFixedPropertiesShuffle(propertyLevels);
}

/** Capture current viewer property recipe for a new collection piece. */
function captureViewerRecipeForPiece(state) {
  if (!state || typeof state !== "object") {
    return { fixedProperties: {}, seed: undefined };
  }
  migratePropertyLevelsViewer(state.propertyLevels);
  const activeprops = state.lastBuild?.activeprops;
  const fromBag = flatUseTrue(state.propertyLevels?.viewer);
  const fromCurrent = state.props?.current || {};
  const recipe =
    activeprops && Object.keys(activeprops).length
      ? { ...activeprops }
      : { ...fromBag, ...fromCurrent };
  return {
    fixedProperties: recipe,
    seed: state.seed != null ? Number(state.seed) : undefined,
  };
}

/** Capture a collection piece recipe for the viewer workspace. */
function capturePieceRecipeForViewer(collection, pieceRecord, devPropertyLevels) {
  if (!pieceRecord) {
    return { recipe: {}, locks: {}, seed: undefined };
  }
  let recipe;
  if (hasPieceProperties(pieceRecord)) {
    recipe = buildCollectionFullRecipe(collection, pieceRecord);
  } else {
    recipe = {
      ...buildCollectionLocks(collection, pieceRecord),
      ...flatUseTrue(devPropertyLevels?.override || {}),
    };
  }
  const locks = {};
  for (const k of lockedPropertyKeys(collection, pieceRecord, devPropertyLevels)) {
    locks[k] = true;
  }
  if (hasPieceProperties(pieceRecord)) {
    for (const k of Object.keys(recipe)) locks[k] = true;
  }
  let seed = pieceRecord.seed;
  if (seed == null && pieceRecord.values?.seed?.value != null) {
    seed = Number(pieceRecord.values.seed.value);
  }
  return { recipe, locks, seed };
}

module.exports = {
  BUILD_VALUE_LEVELS,
  PROPERTY_LEVELS,
  flatUseTrue,
  flatToValueBag,
  cloneUseTrueBag,
  getPieceProperties,
  hasPieceProperties,
  propertiesToPieceLevelBag,
  snapshotOverrideProperties,
  fixedPropertyKeySet,
  migratePieceRecordFields,
  mergeBuildValueBags,
  buildCollectionLocks,
  buildCollectionFullRecipe,
  buildCollectionFixedMap,
  isPropertyLocked,
  lockedPropertyKeys,
  buildCollectionValueBags,
  mergePropertiesForPreview,
  computeSourceFingerprint,
  copySourceSnapshot,
  mapArtBuilderOutputToPieceDir,
  writePieceBuildFailure,
  migratePropertyLevelsViewer,
  getRootFixedProperties,
  captureViewerRecipeForPiece,
  capturePieceRecipeForViewer,
  PIECE_OUTPUT_FILES,
};

