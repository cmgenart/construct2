/**
 * Collection v2 filesystem — collections/<pad2>.json + disposable build trees.
 * @see docs/COLLECTION-DESIGN-V2.md
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { performance } = require("perf_hooks");

const MAX_COLLECTIONS = 99;
const MAX_PIECES = 9999;

function pad2(n) {
  return String(Math.max(0, Math.min(99, Number(n) || 0))).padStart(2, "0");
}

function pad4(n) {
  return String(Math.max(0, Math.min(9999, Number(n) || 0))).padStart(4, "0");
}

function collectionsRoot(projectPath) {
  return path.join(projectPath, "collections");
}

function jsonFilePath(projectPath, pad2str) {
  return path.join(collectionsRoot(projectPath), `${pad2str}.json`);
}

function buildTreePath(projectPath, pad2str) {
  return path.join(collectionsRoot(projectPath), pad2str);
}

function pieceDirPath(projectPath, pad2str, pieceNum) {
  return path.join(buildTreePath(projectPath, pad2str), pad4(pieceNum));
}

function ensureCollectionsDir(projectPath) {
  const root = collectionsRoot(projectPath);
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  return root;
}

function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return crypto.randomBytes(16).toString("hex");
}

const {
  DEFAULT_PEER_EXAMPLE_TEMPLATE,
  DEFAULT_PEER_EXAMPLE_INTRO,
  DEFAULT_PEER_EXAMPLE_OUTRO,
  DEFAULT_PEER_EXAMPLE_SEPARATOR,
} = require("./auto_resolve.js");

function defaultAutoSettings() {
  return {
    includePeerExamples: true,
    peerExampleMax: 5,
    peerExampleKeys: ["name", "description"],
    peerExampleTemplate: DEFAULT_PEER_EXAMPLE_TEMPLATE,
    peerExampleIntro: DEFAULT_PEER_EXAMPLE_INTRO,
    peerExampleOutro: DEFAULT_PEER_EXAMPLE_OUTRO,
    peerExampleSeparator: DEFAULT_PEER_EXAMPLE_SEPARATOR,
    bulkChunkSize: 10,
    bulkMultiField: true,
    bulkFillAfterBuild: true,
  };
}

function normalizeAutoSettings(input) {
  const d = defaultAutoSettings();
  if (!input || typeof input !== "object") return { ...d };
  const out = { ...d };
  if (input.includePeerExamples != null) {
    out.includePeerExamples = !!input.includePeerExamples;
  }
  if (input.peerExampleMax != null) {
    const n = parseInt(input.peerExampleMax, 10);
    if (Number.isFinite(n) && n >= 0) out.peerExampleMax = Math.min(n, 20);
  }
  if (Array.isArray(input.peerExampleKeys)) {
    out.peerExampleKeys = input.peerExampleKeys
      .filter((k) => typeof k === "string" && k.trim())
      .map((k) => k.trim());
    if (!out.peerExampleKeys.length) out.peerExampleKeys = [...d.peerExampleKeys];
  }
  if (input.peerExampleTemplate != null) {
    out.peerExampleTemplate = String(input.peerExampleTemplate);
  }
  if (input.peerExampleIntro != null) {
    out.peerExampleIntro = String(input.peerExampleIntro);
  }
  if (input.peerExampleOutro != null) {
    out.peerExampleOutro = String(input.peerExampleOutro);
  }
  if (input.peerExampleSeparator != null) {
    out.peerExampleSeparator = String(input.peerExampleSeparator);
  }
  if (input.bulkChunkSize != null) {
    const n = parseInt(input.bulkChunkSize, 10);
    if (Number.isFinite(n) && n >= 1) out.bulkChunkSize = Math.min(n, 50);
  }
  if (input.bulkMultiField != null) out.bulkMultiField = !!input.bulkMultiField;
  if (input.bulkFillAfterBuild != null) {
    out.bulkFillAfterBuild = !!input.bulkFillAfterBuild;
  }
  if (input.bulkMaxCalls != null) {
    const n = parseInt(input.bulkMaxCalls, 10);
    if (Number.isFinite(n) && n >= 1) out.bulkMaxCalls = n;
  } else if (input.bulkMaxCalls === null) {
    delete out.bulkMaxCalls;
  }
  return out;
}

function defaultCollection(num, name) {
  const now = new Date().toISOString();
  return {
    version: 1,
    num,
    name: name || `Collection ${pad2(num)}`,
    createdAt: now,
    updatedAt: now,
    mint: {
      size: 186,
      policy:
        "00000000000000000000000000000000000000000000000000000000",
      description: "",
    },
    values: {},
    propertyOverrides: {},
    fixedProperties: {},
    autoBrief: "",
    autoSettings: defaultAutoSettings(),
    frozen: false,
    sourceFingerprint: null,
    pieceRecords: [],
  };
}

/** Five-digit piece seed (00000–99999) for batch create; uses performance.now() + salt. */
function randomPieceSeed(salt = 0) {
  const t = performance.now();
  const n = Math.floor(
    (t * 1000 + salt * 9973 + Math.random() * 100000) % 100000,
  );
  return Math.max(0, Math.min(99999, n));
}

function defaultPieceValues(num, opts = {}) {
  const p4 = pad4(num);
  const base = {
    num: { value: p4, use: true },
    name: {
      value: opts.displayName || opts.name || `Piece ${p4}`,
      use: true,
    },
  };
  const extra = opts.values || {};
  return { ...base, ...extra };
}

function pieceListLabel(pr) {
  if (!pr) return "";
  const bag = pr.values || {};
  let num = pr.num;
  const numEntry = bag.num;
  if (numEntry && typeof numEntry === "object" && numEntry.value != null) {
    const n = parseInt(String(numEntry.value), 10);
    if (!Number.isNaN(n)) num = n;
  } else if (numEntry != null && typeof numEntry !== "object") {
    const n = parseInt(String(numEntry), 10);
    if (!Number.isNaN(n)) num = n;
  }
  const p4 = pad4(num);
  let name = "";
  const nameEntry = bag.name;
  if (nameEntry && typeof nameEntry === "object" && nameEntry.value != null) {
    name = String(nameEntry.value);
  } else if (nameEntry != null && typeof nameEntry !== "object") {
    name = String(nameEntry);
  } else if (pr.displayName) {
    name = String(pr.displayName).replace(/^\d{4}:?\s*/, "");
  }
  if (!name) name = `Piece ${p4}`;
  return `${p4} ${name}`;
}

function newPieceRecord(num, opts = {}) {
  const seed =
    opts.seed != null ? Number(opts.seed) : num * 1000;
  const seedClamped = Math.max(0, Math.min(99999, Math.floor(seed)));
  const extraValues = { ...(opts.values || {}) };
  if (opts.seed != null) {
    extraValues.seed = {
      value: String(seedClamped).padStart(5, "0"),
      use: true,
    };
  }
  const values = defaultPieceValues(num, { ...opts, values: extraValues });
  const p4 = pad4(num);
  return {
    id: opts.id || newId(),
    num,
    displayName: opts.displayName || values.name.value || `Piece ${p4}`,
    values,
    properties: opts.properties || {},
    overrideProperties: opts.overrideProperties || {},
    fixedProperties: opts.fixedProperties || {},
    lastBuiltAllprops: opts.lastBuiltAllprops || null,

    seed: seedClamped,
    buildStatus: opts.buildStatus || "unbuilt",
    lastBuiltAt: opts.lastBuiltAt || null,
  };
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    return null;
  }
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

/** Collection label for UI — prefers collection-level `values.collection_name`. */
function collectionDisplayName(data, pad2Fallback = "") {
  if (!data || typeof data !== "object") return pad2Fallback || "";
  const entry = data.values?.collection_name;
  if (entry && typeof entry === "object" && entry.value != null) {
    const v = String(entry.value).trim();
    if (v) return v;
  }
  if (typeof entry === "string" && entry.trim()) return entry.trim();
  const legacy = data.name != null ? String(data.name).trim() : "";
  if (legacy) return legacy;
  return pad2Fallback || "";
}

function listCollectionPad2s(projectPath) {
  ensureCollectionsDir(projectPath);
  const root = collectionsRoot(projectPath);
  const out = [];
  for (const name of fs.readdirSync(root)) {
    const m = /^(\d{2})\.json$/.exec(name);
    if (!m) continue;
    const data = readJsonFile(path.join(root, name));
    out.push({
      pad2: m[1],
      num: data?.num ?? parseInt(m[1], 10),
      name: collectionDisplayName(data, m[1]),
      frozen: !!data?.frozen,
      pieceCount: Array.isArray(data?.pieceRecords)
        ? data.pieceRecords.length
        : 0,
    });
  }
  out.sort((a, b) => a.pad2.localeCompare(b.pad2));
  return out;
}

function readCollection(projectPath, pad2str) {
  const p = jsonFilePath(projectPath, pad2str);
  if (!fs.existsSync(p)) return null;
  const data = readJsonFile(p);
  if (!data) return null;
  if (!Array.isArray(data.pieceRecords)) data.pieceRecords = [];
  return data;
}

function writeCollection(projectPath, data) {
  ensureCollectionsDir(projectPath);
  for (const pr of data.pieceRecords || []) {
    delete pr.hasOutput;
  }
  data.updatedAt = new Date().toISOString();
  const p2 = pad2(data.num);
  writeJsonFile(jsonFilePath(projectPath, p2), data);
  return data;
}

function nextCollectionNum(projectPath) {
  const list = listCollectionPad2s(projectPath);
  if (list.length >= MAX_COLLECTIONS) return null;
  const used = new Set(list.map((c) => c.pad2));
  for (let n = 1; n <= MAX_COLLECTIONS; n++) {
    const p2 = pad2(n);
    if (!used.has(p2)) return n;
  }
  return null;
}

function createCollection(projectPath, name) {
  const num = nextCollectionNum(projectPath);
  if (num == null) return { ok: false, error: "Maximum collections (99) reached" };
  const data = defaultCollection(num, name);
  writeCollection(projectPath, data);
  return { ok: true, collection: data, pad2: pad2(num) };
}

function deleteCollection(projectPath, pad2str) {
  const data = readCollection(projectPath, pad2str);
  if (!data) return { ok: false, error: "Collection not found" };
  deleteBuildTree(projectPath, pad2str);
  try {
    fs.unlinkSync(jsonFilePath(projectPath, pad2str));
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
  return { ok: true };
}

function sleepMs(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* sync wait — rare path when Dropbox/browser holds file locks */
  }
}

function rmPathSync(target, opts) {
  fs.rmSync(target, {
    recursive: true,
    force: true,
    maxRetries: 12,
    retryDelay: 250,
    ...opts,
  });
}

/** Best-effort delete of disposable build tree; never throws (Dropbox / preview locks). */
function deleteBuildTree(projectPath, pad2str) {
  const tree = buildTreePath(projectPath, pad2str);
  if (!fs.existsSync(tree)) return true;

  const retryable = (err) =>
    err &&
    (err.code === "EBUSY" ||
      err.code === "EPERM" ||
      err.code === "ENOTEMPTY" ||
      err.code === "EACCES" ||
      err.code === "EMFILE" ||
      err.code === "ENFILE");

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      rmPathSync(tree);
      return true;
    } catch (err) {
      if (!retryable(err) || attempt === 3) {
        try {
          deleteBuildTreeShallow(tree);
          return true;
        } catch (err2) {
          console.warn(
            `[collection_fs] Could not delete build tree ${tree}: ${err2.message}. Pieces will be marked unbuilt; stale outputs may remain until the next successful build.`,
          );
          return false;
        }
      }
      sleepMs(400 * (attempt + 1));
    }
  }
  return false;
}

/** Delete files first, then dirs — sometimes succeeds when rmSync fails on Windows. */
function deleteBuildTreeShallow(root) {
  if (!fs.existsSync(root)) return;
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full);
      else {
        fs.unlinkSync(full, { maxRetries: 8, retryDelay: 200 });
      }
    }
  };
  walk(root);
  rmPathSync(root);
}

function renumberPieces(pieceRecords) {
  return pieceRecords.map((pr, i) => {
    const num = i + 1;
    const p4 = pad4(num);
    const values = { ...(pr.values || {}) };
    const prevNum = values.num;
    values.num =
      prevNum && typeof prevNum === "object"
        ? { ...prevNum, value: p4, use: prevNum.use !== false }
        : { value: p4, use: true };
    return { ...pr, num, values };
  });
}

function invalidateAllPieces(data, deleteTree) {
  for (const pr of data.pieceRecords) {
    pr.buildStatus = "unbuilt";
    pr.lastBuiltAt = null;
  }
  return data;
}

function addPiece(projectPath, pad2str, opts = {}) {
  const data = readCollection(projectPath, pad2str);
  if (!data) return { ok: false, error: "Collection not found" };
  if (data.frozen) return { ok: false, error: "Collection is frozen" };
  if (data.pieceRecords.length >= MAX_PIECES) {
    return { ok: false, error: "Maximum pieces (9999) reached" };
  }
  const num = data.pieceRecords.length + 1;
  const pr = newPieceRecord(num, opts);
  data.pieceRecords.push(pr);
  writeCollection(projectPath, data);
  return { ok: true, piece: pr, collection: data };
}

function deletePieces(projectPath, pad2str, pieceIds) {
  const data = readCollection(projectPath, pad2str);
  if (!data) return { ok: false, error: "Collection not found" };
  if (data.frozen) return { ok: false, error: "Collection is frozen" };
  const idSet = new Set(pieceIds);
  data.pieceRecords = data.pieceRecords.filter((pr) => !idSet.has(pr.id));
  data.pieceRecords = renumberPieces(data.pieceRecords);
  deleteBuildTree(projectPath, pad2str);
  invalidateAllPieces(data, false);
  writeCollection(projectPath, data);
  return { ok: true, collection: data };
}

function patchCollection(projectPath, pad2str, patch) {
  const data = readCollection(projectPath, pad2str);
  if (!data) return { ok: false, error: "Collection not found" };
  if (data.frozen && !patch.forceUnfreeze) {
    return { ok: false, error: "Collection is frozen" };
  }
  if (patch.name != null) data.name = String(patch.name);
  if (patch.mint && typeof patch.mint === "object") {
    data.mint = { ...data.mint, ...patch.mint };
  }
  if (patch.values) data.values = patch.values;
  if (patch.valueAutoLevels) data.valueAutoLevels = patch.valueAutoLevels;
  if (patch.autoBrief != null) data.autoBrief = String(patch.autoBrief);
  if (patch.autoSettings && typeof patch.autoSettings === "object") {
    data.autoSettings = normalizeAutoSettings({
      ...(data.autoSettings || {}),
      ...patch.autoSettings,
    });
  }
  if (patch.propertyOverrides) data.propertyOverrides = patch.propertyOverrides;
  if (patch.fixedProperties) data.fixedProperties = patch.fixedProperties;
  if (patch.frozen != null) data.frozen = !!patch.frozen;
  if (patch.pieceRecords) data.pieceRecords = patch.pieceRecords;
  if (patch.deleteBuildTree) {
    deleteBuildTree(projectPath, pad2str);
  }
  if (patch.invalidateAll) {
    invalidateAllPieces(data, false);
  }
  writeCollection(projectPath, data);
  return { ok: true, collection: data };
}

function patchPiece(projectPath, pad2str, pieceId, patch) {
  const data = readCollection(projectPath, pad2str);
  if (!data) return { ok: false, error: "Collection not found" };
  if (data.frozen) return { ok: false, error: "Collection is frozen" };
  const pr = data.pieceRecords.find((p) => p.id === pieceId);
  if (!pr) return { ok: false, error: "Piece not found" };
  if (patch.displayName != null) pr.displayName = String(patch.displayName);
  if (patch.values) pr.values = patch.values;
  if (patch.propertyOverrides) pr.propertyOverrides = patch.propertyOverrides;
  if (patch.properties) pr.properties = patch.properties;
  if (patch.overrideProperties) pr.overrideProperties = patch.overrideProperties;
  if (patch.fixedProperties) pr.fixedProperties = patch.fixedProperties;
  if (patch.seed != null) pr.seed = Number(patch.seed);
  if (patch.buildStatus) pr.buildStatus = patch.buildStatus;
  if (patch.lastBuiltProperties) {
    pr.lastBuiltProperties = patch.lastBuiltProperties;
    if (!pr.properties || !Object.keys(pr.properties).length) {
      pr.properties = { ...patch.lastBuiltProperties };
    }
  }
  if (patch.lastBuiltAllprops) pr.lastBuiltAllprops = patch.lastBuiltAllprops;
  if (patch.lastBuiltPropertyGroups) {
    pr.lastBuiltPropertyGroups = patch.lastBuiltPropertyGroups;
  }
  if (patch.lastBuiltPropertyGroupOrder) {
    pr.lastBuiltPropertyGroupOrder = patch.lastBuiltPropertyGroupOrder;
  }
  if (patch.lastBuiltPropertyGroupFlags) {
    pr.lastBuiltPropertyGroupFlags = patch.lastBuiltPropertyGroupFlags;
  }
  if (patch.lastBuiltAt != null) pr.lastBuiltAt = patch.lastBuiltAt;
  if (patch.invalidateBuild) {
    pr.buildStatus = "unbuilt";
    pr.lastBuiltAt = null;
  }
  writeCollection(projectPath, data);
  return { ok: true, piece: pr, collection: data };
}

function appendPieceRecords(projectPath, pad2str, records) {
  const data = readCollection(projectPath, pad2str);
  if (!data) return { ok: false, error: "Collection not found" };
  if (data.frozen) return { ok: false, error: "Collection is frozen" };
  const added = [];
  for (const rec of records) {
    if (data.pieceRecords.length >= MAX_PIECES) break;
    const num = data.pieceRecords.length + 1;
    added.push(
      newPieceRecord(num, {
        displayName: rec.displayName,
        values: rec.values || {},
        properties: rec.properties || {},
        overrideProperties: rec.overrideProperties || {},
        fixedProperties: rec.fixedProperties || {},

        seed: rec.seed,
      }),
    );
    data.pieceRecords.push(added[added.length - 1]);
  }
  writeCollection(projectPath, data);
  return { ok: true, added, collection: data };
}

function pieceOutputExists(projectPath, pad2str, pieceNum) {
  const dir = pieceDirPath(projectPath, pad2str, pieceNum);
  return fs.existsSync(path.join(dir, "min.html"));
}

const PIECE_ARTIFACT_FILES = ["min.html", "metadata.json", "utf8.txt"];

function pieceArtifactsComplete(projectPath, pad2str, pieceNum) {
  const dir = pieceDirPath(projectPath, pad2str, pieceNum);
  if (!fs.existsSync(dir)) return false;
  return PIECE_ARTIFACT_FILES.every((f) => fs.existsSync(path.join(dir, f)));
}

function pieceHasErrorArtifact(projectPath, pad2str, pieceNum) {
  const fp = path.join(pieceDirPath(projectPath, pad2str, pieceNum), "errors.json");
  if (!fs.existsSync(fp)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(fp, "utf8"));
    if (Array.isArray(data)) return data.length > 0;
    return !!data;
  } catch {
    return true;
  }
}

function reconcilePieceStatus(projectPath, pad2str, data) {
  let changed = false;
  for (const pr of data.pieceRecords || []) {
    const hasErr = pieceHasErrorArtifact(projectPath, pad2str, pr.num);
    const complete = pieceArtifactsComplete(projectPath, pad2str, pr.num);
    let next = pr.buildStatus;
    if (hasErr) {
      next = "error";
    } else if (complete) {
      next = "built";
    } else if (pr.buildStatus === "built") {
      next = "unbuilt";
    }
    if (next !== pr.buildStatus) {
      pr.buildStatus = next;
      changed = true;
    }
  }
  if (changed) writeCollection(projectPath, data);
  return data;
}

const CARDANO_METADATA_LIMIT = 15400;

function pieceMetadataByteSize(projectPath, pad2str, pieceNum) {
  const fp = path.join(pieceDirPath(projectPath, pad2str, pieceNum), "metadata.json");
  if (!fs.existsSync(fp)) return 0;
  try {
    return Buffer.byteLength(fs.readFileSync(fp, "utf8"), "utf8");
  } catch {
    return 0;
  }
}

/** Attach ephemeral hasOutput per piece for API/UI (not persisted). */
function enrichCollectionForClient(projectPath, pad2str, data) {
  if (!data) return data;
  reconcilePieceStatus(projectPath, pad2str, data);
  for (const pr of data.pieceRecords || []) {
    pr.hasOutput = pieceOutputExists(projectPath, pad2str, pr.num);
    const metaSize = pr.hasOutput ? pieceMetadataByteSize(projectPath, pad2str, pr.num) : 0;
    pr.metadataSize = metaSize;
    pr.metadataOverBudget = metaSize > CARDANO_METADATA_LIMIT;
  }
  data.displayName = collectionDisplayName(data, pad2str);
  return data;
}

module.exports = {
  MAX_COLLECTIONS,
  MAX_PIECES,
  pad2,
  pad4,
  collectionsRoot,
  jsonFilePath,
  buildTreePath,
  pieceDirPath,
  ensureCollectionsDir,
  listCollectionPad2s,
  collectionDisplayName,
  readCollection,
  writeCollection,
  createCollection,
  deleteCollection,
  deleteBuildTree,
  newPieceRecord,
  addPiece,
  deletePieces,
  patchCollection,
  patchPiece,
  appendPieceRecords,
  renumberPieces,
  defaultPieceValues,
  randomPieceSeed,
  pieceListLabel,
  invalidateAllPieces,
  pieceOutputExists,
  pieceArtifactsComplete,
  pieceHasErrorArtifact,
  reconcilePieceStatus,
  enrichCollectionForClient,
  defaultAutoSettings,
  normalizeAutoSettings,
};
