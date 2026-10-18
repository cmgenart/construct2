/* advBuilder fork — run from this directory (`node builder.js <project>`). Do not edit `.builder/`; align later. */
const fs = require('fs');
const http = require('http');
const path = require('path');
const chokidar = require('chokidar');
const PMasterV1 = require("./builder.pmaster.v1");
const PMasterV2 = require("./builder.pmaster.v2");
const PMaster = PMasterV1.PMaster;
const PMasterProcess = require("./builder.pmaster_process.js");
const Terser = require('./builder.terser.min');
const Glslx = require('./builder.glslx.min');
const { WebSocketServer } = require("ws");
const { scanParamSources, renderParamsMarkdown } = require("./param_scan.js");
const { coerceParamValue } = require("./param_coerce.js");
const { stripPersistedParamValues } = require("./param_persist.js");
const { migrateParamValues } = require("./param_color.js");
const {
  renderUtf8Viewer,
  renderMetadataViewer,
  renderMetadataSetupViewer,
  renderAnalysisViewer,
  injectArtConsoleHook,
} = require("./visualise_views.js");
const {
  loadCreateMetadata,
  hasMetadataBuilder,
  writeDefaultMetadataJs,
  metadataJsPath,
  isMetadataOutputFilename,
} = require("./metadata_loader.js");
const { createDebouncedLogAppender, readLogTail, buildLogFilePath, artLogFilePath } = require("./console_log_persist.js");
const {
  listCollectionScriptNames,
  hasCollectionScripts,
  writeDefaultCollectionJs,
  collectionJsPath,
} = require("./collection_loader.js");
const { runCollectionScript } = require("./collection_scripts.js");
const { patchSendParamsTarget } = require("./param_sendparams_patch.js");
const { patchViewportBgClient } = require("./viewport_bg_patch.js");
const { patchViewNavClient } = require("./view_nav_patch.js");
const { patchCaptureClient } = require("./capture_patch.js");
const { writeCapture, captureExtForMime, ensureCapturesDir, resolveCaptureFile, CAPTURE_MAX_BYTES } = require("./capture_store.js");
const {
  getDefaultViewportBgSettings,
  normalizeViewportColor,
} = require("./viewport_bg.js");
const {
  scanParamDrivers,
  seedDriversReadme,
  isValidDriverId,
  driverHtmlPath,
  readmePath,
  isValidDriverStoreBasename,
  readDriverStoreJson,
  writeDriverStoreJson,
  runStartupDriverStoreMigrations,
} = require("./param_drivers.js");
const {
  scanBuildValueSources,
  lockedBuildValueKeys,
} = require("./build_value_scan.js");
const { applyDerivedBuildValues } = require("./build_value_derived.js");
const {
  orderBuildValueKeys,
  removeKeyFromOrder,
  appendKeyToOrder,
  isValidBuildValueKeyReorder,
} = require("./build_value_order.js");
const CollectionFs = require("./collection_fs.js");
const CollectionRuntime = require("./collection_runtime.js");
const {
  discoverImportGraph,
  collectSourceBundles,
} = require("./import_resolve.js");
const { buildResolvedAutoPrompt, mergeValueAutoLevels } = require("./auto_context.js");
const { generateOneValueField } = require("./auto_generate.js");

const { resolveProjectContext } = require("./project_resolve.js");
const { resolveRuntimeFile } = require("./project_scaffold.js");
const { readHelpFile } = require("./help_paths.js");
const {
  getRuntimesState,
  setProjectRuntime,
  getStoredRuntimeId,
  resolveEffectiveCoreContent,
  PROJECT_CORE_ID,
  hashUtf8,
} = require("./project_runtime.js");

const DEFAULT_RUNTIME_REL = path.join("runtimes", "cc-v3.23.html");

const projectCtx = resolveProjectContext(process.argv.slice(2), process.env, __dirname);
const projectName = projectCtx.name;
const projectPath = projectCtx.path;
const devJsonPath = path.join(projectPath, "dev.json");
const PORT =
  Number.parseInt(process.env.ADVBUILDER_PORT || "3100", 10) || 3100;
const VERBOSE_FS = process.env.ADVBUILDER_VERBOSE === "1";

const { BUILDER_SOURCE_NAMES } = require("./source_inventory.js");

/** Source files that participate in the build (project root). */
const SOURCE_FILE_NAMES = BUILDER_SOURCE_NAMES;

function resolvedProjectPath() {
  return path.resolve(projectPath);
}

function getImportWatchedAbs() {
  const raw = state.importWatchedAbs;
  if (raw instanceof Set) return raw;
  const next = new Set();
  if (Array.isArray(raw)) {
    for (const p of raw) if (typeof p === "string") next.add(p);
  } else if (raw && typeof raw === "object") {
    for (const p of Object.values(raw)) if (typeof p === "string") next.add(p);
  }
  state.importWatchedAbs = next;
  return next;
}

function refreshImportWatchPaths() {
  if (!state || !state.files) {
    state.importWatchPaths = [];
    state.importFileCache = {};
    if (watcher) {
      const watched = getImportWatchedAbs();
      for (const abs of [...watched]) {
        try {
          watcher.unwatch(abs);
        } catch (_) {
          /* ignore */
        }
        watched.delete(abs);
      }
    }
    return;
  }
  const graph = discoverImportGraph(resolvedProjectPath(), state.files);
  state.importWatchPaths = [...graph.keys()];
  const nextCache = {};
  for (const abs of state.importWatchPaths) {
    const entry = graph.get(abs);
    nextCache[abs] = entry ? entry.content : "";
  }
  state.importFileCache = nextCache;
  if (watcher) {
    const watched = getImportWatchedAbs();
    const nextPaths = new Set(
      state.importWatchPaths.map((p) => path.resolve(p)),
    );
    for (const abs of [...watched]) {
      if (nextPaths.has(abs)) continue;
      try {
        watcher.unwatch(abs);
      } catch (_) {
        /* ignore */
      }
      watched.delete(abs);
    }
    for (const abs of nextPaths) {
      if (watched.has(abs)) continue;
      try {
        watcher.add(abs);
        watched.add(abs);
      } catch (_) {
        /* path may already be watched or invalid */
      }
    }
  }
}

function importFilesHaveChanged() {
  if (!state || !state.files) return false;
  const graph = discoverImportGraph(resolvedProjectPath(), state.files);
  const paths = [...graph.keys()];
  const cache = state.importFileCache || {};
  for (const abs of paths) {
    const entry = graph.get(abs);
    const disk = entry ? entry.content : "";
    if (!(abs in cache)) {
      if (Object.keys(cache).length > 0) return true;
    } else if (disk !== cache[abs]) {
      return true;
    }
  }
  for (const abs of Object.keys(cache)) {
    if (!paths.includes(abs)) return true;
  }
  return false;
}

let state = null;
let watcher = null;
let wss = null;
let analysisInProgress = false;
let driverScanDebounce = null;
let collectionBuildJob = null;
const DRIVERS_README_TEMPLATE = path.join(__dirname, "templates", "DRIVERS_README.txt");

const ANALYSIS_SAMPLES_MIN = 100;
const ANALYSIS_SAMPLES_MAX = 50000;
const ANALYSIS_SAMPLES_DEFAULT = 1000;

const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';

const VALUE_AUTO_LEVELS = ["default", "collection"];

function loadAdvBuilderXaiKey() {
  const fp = process.env.ADVBUILDER_XAI_KEY_PATH;
  if (!fp || typeof fp !== "string") return null;
  try {
    if (!fs.existsSync(fp)) return null;
    const key = fs.readFileSync(fp, "utf8").trim();
    return key || null;
  } catch (_) {
    return null;
  }
}

function defaultValueAutoLevels() {
  return { default: {}, collection: {} };
}

function ensureAutoEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return { enabled: false, prompt: "" };
  }
  return {
    enabled: !!entry.enabled,
    prompt: entry.prompt != null ? String(entry.prompt) : "",
  };
}

function ensureValueAutoState() {
  if (!state.valueAutoLevels || typeof state.valueAutoLevels !== "object") {
    state.valueAutoLevels = defaultValueAutoLevels();
  }
  for (const level of VALUE_AUTO_LEVELS) {
    if (
      !state.valueAutoLevels[level] ||
      typeof state.valueAutoLevels[level] !== "object"
    ) {
      state.valueAutoLevels[level] = {};
    }
  }
  if (!state.valueAutoEditLevel) {
    state.valueAutoEditLevel = state.collectionOpen ? "collection" : "default";
  }
  state.valueAutoLevels.default = normalizeValueAutoBag(
    state.valueAutoLevels.default,
  );
  state.valueAutoLevels.collection = normalizeValueAutoBag(
    state.valueAutoLevels.collection,
  );
}

function applyValueAutoPatch(bag, patch) {
  for (const [key, entry] of Object.entries(patch || {})) {
    if (!entry || typeof entry !== "object") continue;
    const prev = ensureAutoEntry(bag[key]);
    bag[key] = {
      enabled: entry.enabled != null ? !!entry.enabled : prev.enabled,
      prompt: entry.prompt != null ? String(entry.prompt) : prev.prompt,
    };
  }
  return bag;
}

function persistCollectionValueAuto(level, patch, removeKey) {
  if (level !== "collection") return { ok: true };
  if (!isCollectionMode()) return { ok: false, error: "No collection open" };
  const pad2 = state.collectionContext.pad2;
  const coll = CollectionFs.readCollection(projectPath, pad2);
  if (!coll) return { ok: false, error: "Collection not found" };
  if (!coll.valueAutoLevels || typeof coll.valueAutoLevels !== "object") {
    coll.valueAutoLevels = {};
  }
  if (!coll.valueAutoLevels.collection || typeof coll.valueAutoLevels.collection !== "object") {
    coll.valueAutoLevels.collection = {};
  }
  if (removeKey) {
    delete coll.valueAutoLevels.collection[removeKey];
  } else {
    applyValueAutoPatch(coll.valueAutoLevels.collection, patch);
  }
  const result = CollectionFs.patchCollection(projectPath, pad2, {
    valueAutoLevels: coll.valueAutoLevels,
  });
  ensureValueAutoState();
  state.valueAutoLevels.collection = normalizeValueAutoBag(
    result.collection.valueAutoLevels?.collection || {},
  );
  return { ok: true, collection: result.collection };
}

function normalizeValueAutoBag(bag) {
  const out = {};
  for (const [key, entry] of Object.entries(bag || {})) {
    out[key] = ensureAutoEntry(entry);
  }
  return out;
}

const BUILD_VALUE_LEVELS = ["default", "collection", "piece", "override"];
const PROPERTY_LEVELS = ["viewer", "collection", "piece", "override"];
const PROPERTY_LEVELS_LEGACY = "default";
const HX_DNA_GROUP_LABEL = "Hex DNA";

function loadFile(p) {
  try {
    if (VERBOSE_FS) console.log("Load: " + p);
    return fs.readFileSync(p, "utf8");
  } catch (e) {
    return null;
  }
}
function saveFile(p, c) {
  if (VERBOSE_FS) console.log("Save: " + p);
  fs.writeFileSync(p, c);
}

function loadDevJson() {
  if (fs.existsSync(devJsonPath)) {
    try {
      const raw = loadFile(devJsonPath);
      state = JSON.parse(raw);
    } catch (e) {
      console.error("Invalid or unreadable dev.json:", e.message || e);
      process.exit(1);
    }
    if (state.seed === undefined || state.seed === null) {
      state.seed = Math.floor(Math.random() * 10000);
      saveDevJson();
    }
    if (!state.settings || typeof state.settings !== "object") {
      state.settings = {};
    }
    if (state.settings.analysisSamples == null) {
      state.settings.analysisSamples = ANALYSIS_SAMPLES_DEFAULT;
    }
    if (state.settings.debugStatSamples == null) {
      state.settings.debugStatSamples = 0;
    }
    if (state.settings.analysisHideDebug == null) {
      state.settings.analysisHideDebug = true;
    }
    if (state.settings.analysisHideHxDna == null) {
      state.settings.analysisHideHxDna = true;
    }
    if (state.settings.cardanoMetadataSplit == null) {
      state.settings.cardanoMetadataSplit = true;
    }
    if (state.settings.autoRebuildOnFileChange == null) {
      state.settings.autoRebuildOnFileChange = true;
    }
    const vpDef = getDefaultViewportBgSettings();
    const { resolveViewportBgSettings } = require("./viewport_bg.js");
    if (state.settings.viewportBgSolid == null) {
      state.settings.viewportBgSolid = vpDef.viewportBgSolid;
    }
    const vpResolved = resolveViewportBgSettings(state.settings);
    state.settings.viewportBgSolidColor = vpResolved.viewportBgSolidColor;
    state.settings.viewportBgCheckerAltColor = vpResolved.viewportBgCheckerAltColor;
    delete state.settings.viewportBgCheckerFillColor;
    delete state.settings.viewportBgCheckerColor;
    delete state.settings.viewportBgColor;
    if (!state.paramValues || typeof state.paramValues !== "object") {
      state.paramValues = {};
    }
    syncSourceFilesFromDisk();
    refreshImportWatchPaths();
    console.log(`${GREEN}Loaded dev.json${RESET}`);
    refreshParamScan();
    ensureBuildValueState();
    ensurePropertyState();
    ensureValueAutoState();
    refreshBuildValueScan();
    ensureParamDriverState();
    state.paramValues = stripPersistedParamValues(
      state.paramValues,
      state.paramSchema,
      state.paramScanErrors,
    );
    if (normalizeCollectionSessionOnStartup()) {
      saveDevJson();
    }
  } else {
    state = {
      project: {name: projectName, path: projectPath},
      files: {},
      lastBuild: null,
      props: {current: {}, locks: {}},
      propertyLevels: null,
      propertiesActiveLevel: "default",
      settings: {
        autoRebuildOnFileChange: true,
        debugStatSamples: 0,
        analysisSamples: ANALYSIS_SAMPLES_DEFAULT,
        analysisHideDebug: true,
        analysisHideHxDna: true,
        cardanoMetadataSplit: true,
      },
      seed: Math.floor(Math.random() * 10000),
      paramSchema: [],
      paramScanErrors: [],
      paramValues: {},
      paramDrivers: [],
      paramDriverMode: "param",
      buildValueLevels: null,
      buildValuesActiveLevel: "default",
      buildValueSchema: [],
      buildValueKeyOrder: [],
      buildValueCustomKeys: [],
      buildValueLockedKeys: [],
      valueAutoLevels: null,
      valueAutoEditLevel: "default",
      collectionOpen: false,
      pieceOpen: false,
      collectionContext: { pad2: null, selectedPieceIds: [] },
      collectionPreview: null,
      collectionScriptNames: [],
      hasCollectionScripts: false,
    };
    initFiles();
    ensureBuildValueState();
    ensurePropertyState();
    ensureValueAutoState();
    refreshBuildValueScan();
    performBuild();
    saveDevJson();
  }
}

function initFiles() {
  state.files = {};
  syncSourceFilesFromDisk();
  syncEffectiveCoreHash();
  refreshImportWatchPaths();
}

/** Refresh in-memory copies of project source files from disk (canonical list). */
function refreshCollectionScriptNames() {
  if (!state) return;
  state.collectionScriptNames = listCollectionScriptNames(projectPath);
  state.hasCollectionScripts = hasCollectionScripts(projectPath);
}

function syncSourceFilesFromDisk() {
  if (!state.files) state.files = {};
  for (const n of SOURCE_FILE_NAMES) {
    const c = loadFile(`${projectPath}/${n}`);
    state.files[n] = c !== null ? c : "";
  }
  refreshCollectionScriptNames();
}

/** Art sources used for build, fingerprint, and collection _source snapshot. */
function getEffectiveSourceFiles() {
  if (!state || !state.files) return {};
  const files = { ...state.files };
  files["core.html"] = resolveEffectiveCoreContent(
    projectPath,
    getStoredRuntimeId(projectPath),
  );
  return files;
}

function syncEffectiveCoreHash() {
  if (!state) return;
  const effective = getEffectiveSourceFiles();
  state._effectiveCoreHash = hashUtf8(effective["core.html"] || "");
}

function saveDevJson() {
  const {
    importWatchedAbs: _importWatchedAbs,
    importWatchPaths: _importWatchPaths,
    importFileCache: _importFileCache,
    ...persistedState
  } = state;
  const snapshot = {
    ...persistedState,
    paramValues: stripPersistedParamValues(
      state.paramValues,
      state.paramSchema,
      state.paramScanErrors,
    ),
  };
  saveFile(devJsonPath, JSON.stringify(snapshot, null, 2));
}

function filesHaveChanged() {
  const runtimeId = getStoredRuntimeId(projectPath);
  for (const n of SOURCE_FILE_NAMES) {
    if (n === "core.html" && runtimeId !== PROJECT_CORE_ID) continue;
    const c = loadFile(`${projectPath}/${n}`);
    const disk = c !== null ? c : "";
    const mem = state.files[n] !== undefined && state.files[n] !== null ? state.files[n] : "";
    if (disk !== mem) return true;
  }
  const effective = getEffectiveSourceFiles();
  if ((state._effectiveCoreHash || "") !== hashUtf8(effective["core.html"] || "")) {
    return true;
  }
  return importFilesHaveChanged();
}

function updateFilesFromDisk() {
  syncSourceFilesFromDisk();
  syncEffectiveCoreHash();
  refreshImportWatchPaths();
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

/** Fill `state.paramValues` from schema defaults for keys not yet set. */
function syncParamValuesFromSchema() {
  if (!state.paramValues || typeof state.paramValues !== "object") {
    state.paramValues = {};
  }
  for (const p of state.paramSchema || []) {
    if (!(p.name in state.paramValues) && "default" in p) {
      state.paramValues[p.name] = cloneParamDefault(p.default);
    }
  }
}

/** Client sends the param map it is showing so a rebuild cannot snapshot an older sketch. */
function applyIncomingParamValues(values) {
  if (!values || typeof values !== "object" || Array.isArray(values)) return;
  if (!state.paramValues || typeof state.paramValues !== "object") state.paramValues = {};
  Object.assign(state.paramValues, values);
}

/** Scan //PARAM-* from art source files; writes `state.paramSchema` + `state.paramScanErrors`. */
function refreshParamScan() {
  const bundles = collectSourceBundles(resolvedProjectPath(), getEffectiveSourceFiles());
  const { schema, errors } = scanParamSources(bundles);
  state.paramSchema = schema;
  state.paramScanErrors = errors;
  syncParamValuesFromSchema();
  let migVec2 = false;
  for (const p of state.paramSchema || []) {
    if (p.type !== "PARAM-VEC2") continue;
    const v = state.paramValues[p.name];
    if (v == null || Array.isArray(v)) continue;
    const coerced = coerceParamValue(p, v);
    if (coerced) {
      state.paramValues[p.name] = coerced;
      migVec2 = true;
    }
  }
  const mig = migrateParamValues(state.paramValues, state.paramSchema);
  if (mig.changed) state.paramValues = mig.values;
  state.paramValues = stripPersistedParamValues(
    state.paramValues,
    state.paramSchema,
    state.paramScanErrors,
  );
  if (mig.changed || migVec2) saveDevJson();
  refreshParamDrivers();
  return renderParamsMarkdown(projectName, schema, errors);
}

function ensureParamDriverState() {
  if (!Array.isArray(state.paramDrivers)) state.paramDrivers = [];
  if (!state.paramDriverMode) state.paramDriverMode = "param";
  if (state.paramReadoutCollapsed == null) state.paramReadoutCollapsed = false;
  if (state.paramReadoutHeight == null) state.paramReadoutHeight = 72;
  if (state.paramDriverHeight == null) state.paramDriverHeight = 280;
  const drivers = state.paramDrivers;
  if (
    state.paramDriverMode !== "off" &&
    state.paramDriverMode !== "param" &&
    !drivers.includes(state.paramDriverMode)
  ) {
    console.warn(
      `[advBuilder] param driver "${state.paramDriverMode}" missing; using param`,
    );
    state.paramDriverMode = "param";
  }
}

/** Discover `<project>/parameters/*.html`; seed DRIVERS_README.txt if missing. */
function refreshParamDrivers() {
  seedDriversReadme(projectPath, DRIVERS_README_TEMPLATE);
  state.paramDrivers = scanParamDrivers(projectPath);
  ensureParamDriverState();
  return state.paramDrivers;
}

function wrapDriverHtml(html) {
  const tag = '<script src="/param_messenger.js"></script>';
  if (!html || html.includes("param_messenger.js")) return html || "";
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch) return html.replace(headMatch[0], headMatch[0] + tag);
  if (/<html[\s>]/i.test(html)) {
    return html.replace(/<body/i, tag + "<body");
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${tag}</head><body>${html}</body></html>`;
}

function scheduleParamDriverScan() {
  clearTimeout(driverScanDebounce);
  driverScanDebounce = setTimeout(() => {
    driverScanDebounce = null;
    refreshParamDrivers();
    saveDevJson();
    broadcastUpdate();
  }, 200);
}

/** Persist Analysis UI prefs to dev.json — see docs/PROPERTY-ANALYSIS.md. */
function saveAnalysisUiSettings(patch) {
  if (!state.settings) state.settings = {};
  if (patch.samples != null) {
    state.settings.analysisSamples = clampAnalysisSamples(patch.samples);
  }
  if (patch.hideDebug != null) {
    state.settings.analysisHideDebug = !!patch.hideDebug;
  }
  if (patch.hideHxDna != null) {
    state.settings.analysisHideHxDna = !!patch.hideHxDna;
  }
  if (patch.expertOpen != null) {
    state.settings.analysisExpertOpen = !!patch.expertOpen;
  }
  saveDevJson();
}

function clampAnalysisSamples(n) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v < ANALYSIS_SAMPLES_MIN) return ANALYSIS_SAMPLES_MIN;
  if (v > ANALYSIS_SAMPLES_MAX) return ANALYSIS_SAMPLES_MAX;
  return v;
}

function getCodeblocksFromState() {
  const codeblocks = [];
  if (state.files["setup.js"])
    codeblocks.push({ name: "setup", content: state.files["setup.js"], enabled: true });
  if (state.files["defs.js"])
    codeblocks.push({ name: "defs", content: state.files["defs.js"], enabled: true });
  if (state.files["functions.js"])
    codeblocks.push({
      name: "functions",
      content: state.files["functions.js"],
      enabled: true,
    });
  if (state.files["draw.js"])
    codeblocks.push({ name: "draw", content: state.files["draw.js"], enabled: true });
  if (state.files["cert.js"])
    codeblocks.push({ name: "cert", content: state.files["cert.js"] || "", enabled: true });
  return codeblocks;
}

function getProjectFromState() {
  const flat = state.buildValueLevels
    ? mergeBuildValues(state.buildValueLevels, { seed: state.seed })
    : {};
  return {
    name: projectName,
    path: projectPath,
    codeblocks: getCodeblocksFromState(),
    canvas:
      getEffectiveSourceFiles()["core.html"] ||
      loadFile(path.join(__dirname, DEFAULT_RUNTIME_REL)) ||
      "",
    applyrandomseed: true,
    createMetadata: loadCreateMetadata(projectPath),
    metadataFlat: flat,
    cardanoMetadataSplit: state.settings?.cardanoMetadataSplit !== false,
  };
}

/** Persist Metadata visualiser prefs — see docs/METADATA-BUILDER.md. */
function saveMetadataUiSettings(patch) {
  if (!state.settings) state.settings = {};
  if (patch.cardanoMetadataSplit != null) {
    state.settings.cardanoMetadataSplit = !!patch.cardanoMetadataSplit;
  }
  saveDevJson();
}

/** Persist dev preview viewport background (not art build). */
function saveViewportUiSettings(patch) {
  if (!state.settings) state.settings = {};
  const vpDef = getDefaultViewportBgSettings();
  if (patch.solid != null) {
    state.settings.viewportBgSolid = !!patch.solid;
  }
  if (patch.solidColor != null && typeof patch.solidColor === "object") {
    state.settings.viewportBgSolidColor = normalizeViewportColor(patch.solidColor);
  }
  if (patch.checkerFillColor != null && typeof patch.checkerFillColor === "object") {
    state.settings.viewportBgSolidColor = normalizeViewportColor(patch.checkerFillColor);
  }
  if (patch.checkerAltColor != null && typeof patch.checkerAltColor === "object") {
    state.settings.viewportBgCheckerAltColor = normalizeViewportColor(
      patch.checkerAltColor,
    );
  }
  if (patch.checkerColor != null && typeof patch.checkerColor === "object") {
    const migrated = require("./viewport_bg.js").resolveViewportBgSettings({
      viewportBgCheckerColor: patch.checkerColor,
    });
    state.settings.viewportBgSolidColor = migrated.viewportBgSolidColor;
    state.settings.viewportBgCheckerAltColor = migrated.viewportBgCheckerAltColor;
  }
  if (patch.color != null && typeof patch.color === "object") {
    const c = normalizeViewportColor(patch.color);
    state.settings.viewportBgSolidColor = c;
    const migrated = require("./viewport_bg.js").resolveViewportBgSettings({
      viewportBgCheckerColor: c,
    });
    state.settings.viewportBgCheckerAltColor = migrated.viewportBgCheckerAltColor;
  }
  const { resolveViewportBgSettings } = require("./viewport_bg.js");
  const vpResolved = resolveViewportBgSettings(state.settings);
  state.settings.viewportBgSolid =
    state.settings.viewportBgSolid ?? vpDef.viewportBgSolid;
  state.settings.viewportBgSolidColor = vpResolved.viewportBgSolidColor;
  state.settings.viewportBgCheckerAltColor = vpResolved.viewportBgCheckerAltColor;
  delete state.settings.viewportBgCheckerFillColor;
  delete state.settings.viewportBgCheckerColor;
  delete state.settings.viewportBgColor;
  saveDevJson();
}

function patchVisualiseHtml(html) {
  if (!html || typeof html !== "string") return html;
  return injectArtConsoleHook(
    patchCaptureClient(
      patchViewNavClient(
        patchViewportBgClient(patchSendParamsTarget(html)),
      ),
    ),
  );
}

function ensurePropertyState() {
  if (!state.props || typeof state.props !== "object") {
    state.props = { current: {}, locks: {} };
  }
  if (!state.props.locks || typeof state.props.locks !== "object") {
    state.props.locks = {};
  }
  if (!state.props.current || typeof state.props.current !== "object") {
    state.props.current = {};
  }
  CollectionRuntime.migratePropertyLevelsViewer(state.propertyLevels);
  if (!state.propertyLevels || typeof state.propertyLevels !== "object") {
    state.propertyLevels = { viewer: {}, collection: {}, piece: {}, override: {} };
    for (const [k, v] of Object.entries(state.props.current)) {
      if (v != null && v !== "") {
        state.propertyLevels.viewer[k] = { value: String(v), use: true };
      }
    }
  }
  for (const level of PROPERTY_LEVELS) {
    if (!state.propertyLevels[level] || typeof state.propertyLevels[level] !== "object") {
      state.propertyLevels[level] = {};
    }
  }
  if (!state.propertiesActiveLevel) state.propertiesActiveLevel = "viewer";
  if (state.propertiesActiveLevel === PROPERTY_LEVELS_LEGACY) {
    state.propertiesActiveLevel = "viewer";
  }
  normalizePropertiesActiveLevel();
}

function propertyLevelsForMerge() {
  if (isCollectionMode()) {
    return ["collection", "piece", "override"];
  }
  return ["viewer"];
}

/**
 * @param {object} levels
 * @param {string[]} [levelsToInclude]
 */
function mergePropertyLevels(levels, levelsToInclude) {
  const include = levelsToInclude || propertyLevelsForMerge();
  const out = {};
  for (const level of include) {
    const bag = levels[level] || {};
    for (const [key, entry] of Object.entries(bag)) {
      if (!entry) continue;
      const use =
        level === "viewer" ? entry.use !== false : !!entry.use;
      if (use) {
        out[key] = entry.value != null ? String(entry.value) : "";
      }
    }
  }
  return out;
}

function propertiesLevelEnabled(level) {
  if (level === "result") return true;
  if (isMultiPieceSelection()) return level === "viewer" || level === "override";
  if (level === "collection") return isCollectionMode();
  if (level === "piece") return isCollectionMode() && state.pieceOpen;
  if (level === "override") return isCollectionMode();
  return true;
}

function normalizePropertiesActiveLevel() {
  const active = state.propertiesActiveLevel || "viewer";
  if (active === "result" || propertiesLevelEnabled(active)) return;
  state.propertiesActiveLevel = "viewer";
}

function getMergedPropertiesWithResult() {
  const merged = mergePropertyLevels(state.propertyLevels || {});
  const active = state.lastBuild?.activeprops || state.props?.current || {};
  return { ...active, ...merged };
}

function concatHxDnaString(activeprops, propertyGroups) {
  const groups = propertyGroups || {};
  let keys = Object.keys(activeprops || {}).filter(
    (k) => groups[k] === HX_DNA_GROUP_LABEL,
  );
  if (keys.length === 0) {
    keys = Object.keys(activeprops || {}).filter((k) => k.includes("HxDNA_"));
  }
  keys.sort();
  return keys.map((k) => activeprops[k]).join("");
}

function syncPropertyLevelsFromBuild(activeprops, allprops) {
  ensurePropertyState();
  const names = new Set([
    ...Object.keys(allprops || {}),
    ...Object.keys(activeprops || {}),
  ]);
  for (const name of names) {
    const val =
      activeprops && activeprops[name] != null ? String(activeprops[name]) : "";
    for (const level of PROPERTY_LEVELS) {
      if (!state.propertyLevels[level][name]) {
        state.propertyLevels[level][name] = {
          value: val,
          use: level === "viewer",
        };
      }
    }
  }
}

function ensureCollectionSession() {
  if (!state.collectionContext || typeof state.collectionContext !== "object") {
    state.collectionContext = { pad2: null, selectedPieceIds: [] };
  }
  if (state.collectionOpen == null) state.collectionOpen = false;
  if (state.pieceOpen == null) state.pieceOpen = false;
  state.collectionOpen = !!state.collectionContext.pad2;
  const sel = state.collectionContext.selectedPieceIds || [];
  state.pieceOpen = sel.length === 1;
}

function getActiveCollection() {
  ensureCollectionSession();
  const pad2 = state.collectionContext.pad2;
  if (!pad2) return null;
  return CollectionFs.readCollection(projectPath, pad2);
}

function isCollectionMode() {
  ensureCollectionSession();
  return !!state.collectionContext.pad2;
}

function isMultiPieceSelection() {
  ensureCollectionSession();
  const sel = state.collectionContext.selectedPieceIds || [];
  return sel.length > 1;
}

function ensureEntryBag(obj) {
  const out = {};
  if (!obj || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object" && ("value" in v || "use" in v)) {
      out[k] = {
        value: v.value != null ? String(v.value) : "",
        use: !!v.use,
      };
    } else if (v != null) {
      out[k] = { value: String(v), use: true };
    }
  }
  return out;
}

function enrichPieceFromBuildArtifacts(pr, pad2str) {
  if (!pr) return { piece: pr, changed: false };
  let changed = false;
  if (!pr.values || typeof pr.values !== "object") pr.values = {};
  const numEntry = pr.values.num;
  const needsNum =
    !numEntry ||
    (typeof numEntry === "object" && !numEntry.use) ||
    (typeof numEntry === "object" &&
      String(numEntry.value) !== CollectionFs.pad4(pr.num));
  if (needsNum) {
    pr.values.num = { value: CollectionFs.pad4(pr.num), use: true };
    changed = true;
  }
  if (pr.buildStatus !== "built") return { piece: pr, changed };

  const pieceDir = CollectionFs.pieceDirPath(projectPath, pad2str, pr.num);

  const valuesEmpty =
    !pr.values || !Object.keys(ensureEntryBag(pr.values)).length;
  if (valuesEmpty) {
    let flat = null;
    const vPath = path.join(pieceDir, "values.json");
    if (fs.existsSync(vPath)) {
      try {
        flat = JSON.parse(fs.readFileSync(vPath, "utf8"));
      } catch (_) {
        flat = null;
      }
    }
    if (flat && typeof flat === "object") {
      pr.values = CollectionRuntime.flatToValueBag(flat);
      changed = true;
    }
  }

  const propsEmpty =
    !pr.properties || !Object.keys(pr.properties || {}).length;
  if (propsEmpty) {
    let props = null;
    const pPath = path.join(pieceDir, "properties.json");
    if (fs.existsSync(pPath)) {
      try {
        props = JSON.parse(fs.readFileSync(pPath, "utf8"));
      } catch (_) {
        props = null;
      }
    }
    if (props && typeof props === "object" && Object.keys(props).length) {
      pr.properties = props;
      changed = true;
    } else if (pr.lastBuiltProperties) {
      pr.properties = { ...pr.lastBuiltProperties };
      changed = true;
    }
  }

  if (CollectionRuntime.migratePieceRecordFields(pr)) {
    changed = true;
  }

  return { piece: pr, changed };
}

function setCollectionPieceBuildMeta(pr) {
  if (!pr) {
    state.collectionPieceBuildMeta = null;
    return;
  }
  state.collectionPieceBuildMeta = {
    pieceId: pr.id,
    properties: { ...CollectionRuntime.getPieceProperties(pr) },
    lastBuiltAllprops: pr.lastBuiltAllprops || null,
    lastBuiltPropertyGroups: pr.lastBuiltPropertyGroups || null,
    lastBuiltPropertyGroupOrder: pr.lastBuiltPropertyGroupOrder || null,
    lastBuiltPropertyGroupFlags: pr.lastBuiltPropertyGroupFlags || null,
  };
}

/** autoBrief / autoSettings only — no build-value or piece hydration side effects. */
function isAutoMetaOnlyPatch(patch) {
  if (!patch || typeof patch !== "object") return false;
  const keys = Object.keys(patch).filter((k) => k !== "forceUnfreeze");
  if (!keys.length) return false;
  return keys.every((k) => k === "autoBrief" || k === "autoSettings");
}

/** Whether a /buildValues POST should trigger a full UI broadcast. */
function buildValuesPatchAffectsEditor(payload) {
  if (!payload || typeof payload !== "object") return false;
  if (payload.rebuild === true) return true;
  if (payload.removeKey) return true;
  if (payload.addKey) return true;
  if (payload.reorderKeys) return true;
  const level = payload.level;
  if (
    level &&
    BUILD_VALUE_LEVELS.includes(level) &&
    payload.patch &&
    typeof payload.patch === "object" &&
    Object.keys(payload.patch).length
  ) {
    return true;
  }
  return false;
}

function hydrateCollectionEditor(pad2str) {
  let coll = CollectionFs.readCollection(projectPath, pad2str);
  if (!coll) return null;
  coll = CollectionFs.reconcilePieceStatus(projectPath, pad2str, coll);
  ensureBuildValueState();
  ensurePropertyState();
  state.buildValueLevels.collection = ensureEntryBag(coll.values);
  state.propertyLevels.collection = ensureEntryBag(coll.propertyOverrides);
  ensureValueAutoState();
  state.valueAutoLevels.collection = normalizeValueAutoBag(
    coll.valueAutoLevels?.collection || {},
  );
  const sel = state.collectionContext.selectedPieceIds || [];
  if (sel.length === 1) {
    let pr = coll.pieceRecords.find((p) => p.id === sel[0]);
    if (pr) {
      const enriched = enrichPieceFromBuildArtifacts(pr, pad2str);
      if (enriched.changed) {
        CollectionFs.patchPiece(projectPath, pad2str, pr.id, {
          values: enriched.piece.values,
          properties: enriched.piece.properties,
          overrideProperties: enriched.piece.overrideProperties,
        });
        pr = enriched.piece;
        const idx = coll.pieceRecords.findIndex((p) => p.id === pr.id);
        if (idx >= 0) coll.pieceRecords[idx] = pr;
      }
      state.buildValueLevels.piece = ensureEntryBag(pr.values);
      CollectionRuntime.migratePieceRecordFields(pr);
      state.propertyLevels.piece = CollectionRuntime.propertiesToPieceLevelBag(
        CollectionRuntime.getPieceProperties(pr),
      );
      state.pieceFixedProperties = { ...(pr.fixedProperties || {}) };
      if (pr.seed != null && !Number.isNaN(Number(pr.seed))) {
        state.seed = Number(pr.seed);
      }
      setCollectionPieceBuildMeta(pr);
    }
  } else {
    state.buildValueLevels.piece = {};
    state.propertyLevels.piece = {};
    state.pieceFixedProperties = {};
    setCollectionPieceBuildMeta(null);
  }
  state.collectionFixedProperties = { ...(coll.fixedProperties || {}) };
  CollectionFs.writeCollection(projectPath, coll);
  return coll;
}

function applyCollectionPatchToBag(bag, patch) {
  for (const [key, entry] of Object.entries(patch || {})) {
    if (!entry || typeof entry !== "object") continue;
    const prev = bag[key] || { value: "", use: false };
    bag[key] = {
      value: entry.value != null ? String(entry.value) : prev.value ?? "",
      use: entry.use != null ? !!entry.use : prev.use,
    };
  }
  return bag;
}

function resolveAutoPieceTarget(payload) {
  if (!isCollectionMode()) {
    return { ok: false, error: "Open a collection first" };
  }
  const pad2 = state.collectionContext.pad2;
  const coll = CollectionFs.readCollection(projectPath, pad2);
  if (!coll) {
    return { ok: false, error: "Collection not found" };
  }
  if (coll.frozen) {
    return { ok: false, error: "Collection is frozen" };
  }
  const pieceId = payload.pieceId;
  let pieceRecord = null;
  if (pieceId) {
    pieceRecord = coll.pieceRecords.find((p) => p.id === pieceId) || null;
  } else {
    const sel = state.collectionContext.selectedPieceIds || [];
    if (sel.length === 1) {
      pieceRecord = coll.pieceRecords.find((p) => p.id === sel[0]) || null;
    }
  }
  if (!pieceRecord) {
    return {
      ok: false,
      error: "Select exactly one piece (or pass pieceId)",
    };
  }
  return { ok: true, pad2, coll, pieceRecord };
}

function writeGeneratedValueToPiece(pad2, pieceRecord, key, value) {
  const coll = CollectionFs.readCollection(projectPath, pad2);
  if (!coll) return { ok: false, error: "Collection not found" };
  if (coll.frozen) return { ok: false, error: "Collection is frozen" };
  const pr = coll.pieceRecords.find((p) => p.id === pieceRecord.id);
  if (!pr) return { ok: false, error: "Piece not found" };
  const patch = { [key]: { value: String(value), use: true } };
  pr.values = applyCollectionPatchToBag(ensureEntryBag(pr.values || {}), patch);
  const piecePatch = {
    values: pr.values,
    invalidateBuild: true,
  };
  if (key === "name" && pr.values.name?.value != null) {
    piecePatch.displayName = String(pr.values.name.value);
  }
  const result = CollectionFs.patchPiece(projectPath, pad2, pr.id, piecePatch);
  if (
    state.collectionContext.selectedPieceIds?.length === 1 &&
    state.collectionContext.selectedPieceIds[0] === pr.id
  ) {
    state.buildValueLevels.piece = ensureEntryBag(result.piece.values);
    if (key === "name" || key === "num") {
      setCollectionPieceBuildMeta(result.piece);
    }
  }
  return { ok: true, piece: result.piece, collection: result.collection };
}

function buildAutoResolveForRequest(payload, coll, pieceRecord) {
  ensureBuildValueState();
  ensurePropertyState();
  ensureValueAutoState();
  const valueAutoLevels = mergeValueAutoLevels(
    state.valueAutoLevels,
    coll.valueAutoLevels,
  );
  return buildResolvedAutoPrompt({
    key: String(payload.key).trim(),
    valueAutoLevels,
    devBuildValueLevels: state.buildValueLevels,
    devPropertyLevels: state.propertyLevels,
    devSeed: state.seed,
    collection: coll,
    pieceRecord,
    autoSettings: coll.autoSettings,
    includePeerBlock: payload.includePeerBlock !== false,
    peerMode: payload.peerMode === "fill" ? "fill" : "single",
  });
}

function persistCollectionBuildValues(level, patch) {
  if (!isCollectionMode()) return { ok: false, error: "No collection open" };
  const pad2 = state.collectionContext.pad2;
  if (level === "collection") {
    const coll = CollectionFs.readCollection(projectPath, pad2);
    if (!coll) return { ok: false, error: "Collection not found" };
    coll.values = applyCollectionPatchToBag(
      ensureEntryBag(coll.values),
      patch,
    );
    const result = CollectionFs.patchCollection(projectPath, pad2, {
      values: coll.values,
      invalidateAll: true,
    });
    state.buildValueLevels.collection = ensureEntryBag(result.collection.values);
    updateCollectionPreviewFromSession();
    return { ok: true, collection: result.collection };
  }
  if (level === "piece") {
    const sel = state.collectionContext.selectedPieceIds || [];
    if (sel.length !== 1) {
      return { ok: false, error: "Select exactly one piece" };
    }
    const coll = CollectionFs.readCollection(projectPath, pad2);
    const pr = coll?.pieceRecords?.find((p) => p.id === sel[0]);
    if (!pr) return { ok: false, error: "Piece not found" };
    pr.values = applyCollectionPatchToBag(ensureEntryBag(pr.values), patch);
    const piecePatch = {
      values: pr.values,
      invalidateBuild: true,
    };
    if (patch.name && pr.values.name) {
      piecePatch.displayName = String(
        pr.values.name.value != null ? pr.values.name.value : pr.displayName,
      );
    }
    const result = CollectionFs.patchPiece(projectPath, pad2, pr.id, piecePatch);
    state.buildValueLevels.piece = ensureEntryBag(result.piece.values);
    updateCollectionPreviewFromSession();
    return { ok: true, piece: result.piece, collection: result.collection };
  }
  return { ok: true };
}

function persistCollectionPropertyLevels(level, patch) {
  if (!isCollectionMode()) return { ok: false, error: "No collection open" };
  const pad2 = state.collectionContext.pad2;
  if (level === "collection") {
    const coll = CollectionFs.readCollection(projectPath, pad2);
    if (!coll) return { ok: false, error: "Collection not found" };
    coll.propertyOverrides = applyCollectionPatchToBag(
      ensureEntryBag(coll.propertyOverrides),
      patch,
    );
    const result = CollectionFs.patchCollection(projectPath, pad2, {
      propertyOverrides: coll.propertyOverrides,
      invalidateAll: true,
    });
    state.propertyLevels.collection = ensureEntryBag(
      result.collection.propertyOverrides,
    );
    updateCollectionPreviewFromSession();
    return { ok: true, collection: result.collection };
  }
  if (level === "piece") {
    const sel = state.collectionContext.selectedPieceIds || [];
    if (sel.length !== 1) {
      return { ok: false, error: "Select exactly one piece" };
    }
    const coll = CollectionFs.readCollection(projectPath, pad2);
    const pr = coll?.pieceRecords?.find((p) => p.id === sel[0]);
    if (!pr) return { ok: false, error: "Piece not found" };
    CollectionRuntime.migratePieceRecordFields(pr);
    pr.properties = { ...(pr.properties || {}) };
    for (const [key, entry] of Object.entries(patch || {})) {
      if (!entry || typeof entry !== "object") continue;
      if (entry.use && entry.value != null) {
        pr.properties[key] = String(entry.value);
      } else {
        delete pr.properties[key];
      }
    }
    if (pr.fixedProperties) {
      for (const [key, entry] of Object.entries(patch || {})) {
        if (
          entry &&
          entry.value != null &&
          pr.fixedProperties[key] !== undefined
        ) {
          pr.fixedProperties[key] = String(entry.value);
        }
      }
    }
    const piecePatch = {
      properties: pr.properties,
      invalidateBuild: true,
    };
    if (pr.fixedProperties) piecePatch.fixedProperties = pr.fixedProperties;
    const result = CollectionFs.patchPiece(projectPath, pad2, pr.id, piecePatch);
    state.propertyLevels.piece = CollectionRuntime.propertiesToPieceLevelBag(
      CollectionRuntime.getPieceProperties(result.piece),
    );
    state.pieceFixedProperties = { ...(result.piece.fixedProperties || {}) };
    updateCollectionPreviewFromSession();
    return { ok: true, piece: result.piece, collection: result.collection };
  }
  return { ok: true };
}

function persistCollectionFixedProperty(level, prop, value, locked) {
  if (!isCollectionMode()) return { ok: false, error: "No collection open" };
  const pad2 = state.collectionContext.pad2;
  const propName = String(prop || "");
  if (!propName) return { ok: false, error: "Missing property name" };

  if (level === "collection") {
    const coll = CollectionFs.readCollection(projectPath, pad2);
    if (!coll) return { ok: false, error: "Collection not found" };
    const fixed = { ...(coll.fixedProperties || {}) };
    if (locked) fixed[propName] = String(value != null ? value : "");
    else delete fixed[propName];
    coll.propertyOverrides = applyCollectionPatchToBag(
      ensureEntryBag(coll.propertyOverrides),
      locked
        ? { [propName]: { value: String(value != null ? value : ""), use: true } }
        : { [propName]: { value: String(value != null ? value : ""), use: false } },
    );
    const result = CollectionFs.patchCollection(projectPath, pad2, {
      fixedProperties: fixed,
      propertyOverrides: coll.propertyOverrides,
      invalidateAll: true,
    });
    state.collectionFixedProperties = { ...(result.collection.fixedProperties || {}) };
    state.propertyLevels.collection = ensureEntryBag(
      result.collection.propertyOverrides,
    );
    updateCollectionPreviewFromSession();
    return { ok: true, collection: result.collection };
  }

  if (level === "piece") {
    const sel = state.collectionContext.selectedPieceIds || [];
    if (sel.length !== 1) {
      return { ok: false, error: "Select exactly one piece" };
    }
    const coll = CollectionFs.readCollection(projectPath, pad2);
    const pr = coll?.pieceRecords?.find((p) => p.id === sel[0]);
    if (!pr) return { ok: false, error: "Piece not found" };
    if ((coll.fixedProperties || {})[propName] !== undefined && !locked) {
      return {
        ok: false,
        error: "Collection-level fixed property — edit at collection level",
      };
    }
    const fixed = { ...(pr.fixedProperties || {}) };
    const valStr = String(value != null ? value : "");
    if (locked) fixed[propName] = valStr;
    else delete fixed[propName];
    const result = CollectionFs.patchPiece(projectPath, pad2, pr.id, {
      fixedProperties: fixed,
    });
    state.pieceFixedProperties = { ...(result.piece.fixedProperties || {}) };
    state.propertyLevels.piece = CollectionRuntime.propertiesToPieceLevelBag(
      CollectionRuntime.getPieceProperties(result.piece),
    );
    return {
      ok: true,
      piece: result.piece,
      collection: result.collection,
    };
  }

  return { ok: true };
}

function invalidateCollectionsOnSourceChange() {
  if (collectionBuildJob) {
    collectionBuildJob.cancelled = true;
  }
  const list = CollectionFs.listCollectionPad2s(projectPath);
  for (const item of list) {
    CollectionFs.patchCollection(projectPath, item.pad2, { invalidateAll: true });
  }
  if (list.length) {
    updateCollectionPreviewFromSession({ sourceStale: true });
    broadcastCollectionBuild({ type: "collectionBuildSourceInvalidated" });
    broadcastUpdate();
  }
}

/** Invalidate only collections whose stored sourceFingerprint differs from current art files (§6.8). */
function maybeInvalidateCollectionsOnSourceChange() {
  if (collectionBuildJob) {
    collectionBuildJob.cancelled = true;
  }
  const currentFp = CollectionRuntime.computeSourceFingerprint(
    getEffectiveSourceFiles(),
    resolvedProjectPath(),
  );
  const list = CollectionFs.listCollectionPad2s(projectPath);
  let any = false;
  for (const item of list) {
    const coll = CollectionFs.readCollection(projectPath, item.pad2);
    if (!coll || coll.frozen) continue;
    if (coll.sourceFingerprint === currentFp) continue;
    CollectionFs.patchCollection(projectPath, item.pad2, { invalidateAll: true });
    any = true;
  }
  if (any) {
    updateCollectionPreviewFromSession({ sourceStale: true });
    broadcastCollectionBuild({ type: "collectionBuildSourceInvalidated" });
    broadcastUpdate();
  }
}

function resetEditorLevelsForRootWorkspace() {
  ensureBuildValueState();
  ensurePropertyState();
  state.buildValuesActiveLevel = "default";
  state.propertiesActiveLevel = "viewer";
  state.buildValueLevels.collection = {};
  state.buildValueLevels.piece = {};
  state.propertyLevels.collection = {};
  state.propertyLevels.piece = {};
  ensureValueAutoState();
  state.valueAutoEditLevel = "default";
  state.valueAutoLevels.collection = {};
  state.collectionFixedProperties = {};
  state.pieceFixedProperties = {};
}

function normalizeCollectionSessionOnStartup() {
  ensureCollectionSession();
  const wasOpen = !!state.collectionContext.pad2;
  state.collectionContext = { pad2: null, selectedPieceIds: [] };
  state.collectionOpen = false;
  state.pieceOpen = false;
  state.collectionPreview = null;
  const levelWasCollection =
    state.buildValuesActiveLevel === "collection" ||
    state.buildValuesActiveLevel === "piece";
  const propsWasCollection =
    state.propertiesActiveLevel === "collection" ||
    state.propertiesActiveLevel === "piece" ||
    state.propertiesActiveLevel === PROPERTY_LEVELS_LEGACY;
  resetEditorLevelsForRootWorkspace();
  return wasOpen || levelWasCollection || propsWasCollection;
}

function setCollectionPreviewFromPiece(pad2str, pr) {
  if (!pad2str || !pr) {
    state.collectionPreview = null;
    return;
  }
  const pad4 = CollectionFs.pad4(pr.num);
  if (pr.buildStatus === "built") {
    state.collectionPreview = {
      pad2: pad2str,
      pad4,
      pieceId: pr.id,
      built: true,
      stale: false,
    };
    return;
  }
  if (CollectionFs.pieceOutputExists(projectPath, pad2str, pr.num)) {
    state.collectionPreview = {
      pad2: pad2str,
      pad4,
      pieceId: pr.id,
      built: false,
      stale: true,
    };
    return;
  }
  state.collectionPreview = {
    pad2: pad2str,
    pad4,
    pieceId: pr.id,
    built: false,
    stale: false,
    needsBuild: true,
  };
}

function updateCollectionPreviewFromSession(options = {}) {
  const pad2 = state.collectionContext?.pad2;
  const sel = state.collectionContext?.selectedPieceIds || [];
  if (!pad2 || sel.length !== 1) {
    state.collectionPreview = null;
    return;
  }
  const coll = CollectionFs.readCollection(projectPath, pad2);
  const pr = coll?.pieceRecords?.find((p) => p.id === sel[0]);
  setCollectionPreviewFromPiece(pad2, pr);
  if (options.sourceStale && state.collectionPreview) {
    state.collectionPreview.sourceStale = true;
  }
}

function setCollectionSession(pad2str, selectedPieceIds) {
  ensureCollectionSession();
  state.collectionContext.pad2 = pad2str || null;
  state.collectionContext.selectedPieceIds = Array.isArray(selectedPieceIds)
    ? selectedPieceIds
    : [];
  ensureCollectionSession();
  if (pad2str) {
    const sel = state.collectionContext.selectedPieceIds;
    if (sel.length === 1) {
      state.buildValuesActiveLevel = "piece";
      state.propertiesActiveLevel = "piece";
    } else {
      state.buildValuesActiveLevel = "collection";
      state.propertiesActiveLevel = "collection";
    }
    hydrateCollectionEditor(pad2str);
    ensureValueAutoState();
    state.valueAutoEditLevel = "collection";
    updateCollectionPreviewFromSession();
  } else {
    resetEditorLevelsForRootWorkspace();
    state.collectionPreview = null;
  }
  saveDevJson();
  return state;
}

function transportCollectionPieceToViewer(pad2str, pieceId) {
  const collection = CollectionFs.readCollection(projectPath, pad2str);
  if (!collection) return { ok: false, error: "Collection not found" };

  let id = pieceId;
  if (!id) {
    const sel = state.collectionContext?.selectedPieceIds || [];
    if (sel.length === 1) id = sel[0];
  }
  if (!id) {
    return { ok: false, error: "Select exactly one piece to transport" };
  }

  const pieceRecord = collection.pieceRecords.find((p) => p.id === id);
  if (!pieceRecord) return { ok: false, error: "Piece not found" };

  CollectionRuntime.migratePieceRecordFields(pieceRecord);
  ensurePropertyState();
  const captured = CollectionRuntime.capturePieceRecipeForViewer(
    collection,
    pieceRecord,
    state.propertyLevels,
  );
  if (!Object.keys(captured.recipe || {}).length) {
    return { ok: false, error: "No piece properties to transport" };
  }

  setCollectionSession(null, []);
  ensurePropertyState();
  state.propertyLevels.viewer = CollectionRuntime.propertiesToPieceLevelBag(
    captured.recipe,
  );
  state.props.current = { ...captured.recipe };
  state.props.locks = { ...(captured.locks || {}) };
  if (captured.seed != null && !Number.isNaN(Number(captured.seed))) {
    state.seed = Number(captured.seed);
  }
  state.propertiesActiveLevel = "viewer";
  saveDevJson();

  return {
    ok: true,
    state,
    piece: pieceRecord,
    pad2: pad2str,
  };
}

function resolveCollectionBuildValues(collection, pieceRecord) {
  const bags = CollectionRuntime.buildCollectionValueBags(
    state.buildValueLevels,
    collection,
    pieceRecord,
  );
  const flat = CollectionRuntime.mergeBuildValueBags(
    bags,
    pieceRecord.seed ?? state.seed,
  );
  const numFromBag = pieceRecord.values?.num;
  if (numFromBag && typeof numFromBag === "object" && numFromBag.use) {
    flat.num = String(numFromBag.value != null ? numFromBag.value : pieceRecord.num);
  } else {
    flat.num = CollectionFs.pad4(pieceRecord.num);
  }
  return flat;
}

function resolveCollectionArtBuilderValues(collection, pieceRecord, fixed) {
  const flat = resolveCollectionBuildValues(collection, pieceRecord);
  const seed = pieceRecord.seed ?? state.seed ?? 0;
  const values = flatToArtBuilderInput(flat, fixed, seed);
  values.piece.num = pieceRecord.num;
  values.piece.seed = Number(seed);
  values._collectionValuesFlat = flat;
  return values;
}

function broadcastCollectionBuild(msg) {
  if (!wss) return;
  const payload = JSON.stringify(msg);
  wss.clients.forEach((c) => {
    if (c.readyState === 1) c.send(payload);
  });
}

function artBuilderHasErrors(output) {
  return Array.isArray(output?.errors) && output.errors.length > 0;
}

function artBuilderFailed(output) {
  if (!output) return true;
  return artBuilderHasErrors(output);
}

function artBuilderErrorSummary(errors) {
  if (!Array.isArray(errors) || !errors.length) return "Build failed";
  return errors
    .map((e) => {
      if (typeof e === "string") return e;
      const info = e?.info != null ? String(e.info) : "";
      const err = e?.error != null ? String(e.error) : "";
      const line = [info, err].filter(Boolean).join(": ");
      return line || JSON.stringify(e);
    })
    .join("\n");
}

function emitBuildLog(level, text, meta) {
  if (!text) return;
  const entry = {
    level: level || "info",
    text: String(text),
    ts: Date.now(),
  };
  getBuildLogAppender().append(entry);
  broadcastCollectionBuild({
    type: "buildLog",
    ...entry,
    ...(meta && typeof meta === "object" ? { meta } : {}),
  });
}

let buildLogAppender;
let artLogAppender;
function getBuildLogAppender() {
  if (!buildLogAppender) {
    buildLogAppender = createDebouncedLogAppender(buildLogFilePath(projectPath));
  }
  return buildLogAppender;
}
function getArtLogAppender() {
  if (!artLogAppender) {
    artLogAppender = createDebouncedLogAppender(artLogFilePath(projectPath));
  }
  return artLogAppender;
}

const _buildConsoleOrig = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};
let buildLogTeeDepth = 0;

function formatBuildLogArgs(args) {
  const stripAnsi = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, "");
  return args
    .map((a) => {
      if (typeof a === "string") return stripAnsi(a);
      try {
        return stripAnsi(JSON.stringify(a));
      } catch (_) {
        return stripAnsi(String(a));
      }
    })
    .join(" ");
}

function installBuildLogTee() {
  buildLogTeeDepth += 1;
  if (buildLogTeeDepth > 1) return;
  console.log = (...args) => {
    _buildConsoleOrig.log(...args);
    emitBuildLog("info", formatBuildLogArgs(args));
  };
  console.warn = (...args) => {
    _buildConsoleOrig.warn(...args);
    emitBuildLog("warn", formatBuildLogArgs(args));
  };
  console.error = (...args) => {
    _buildConsoleOrig.error(...args);
    emitBuildLog("error", formatBuildLogArgs(args));
  };
}

function uninstallBuildLogTee() {
  buildLogTeeDepth = Math.max(0, buildLogTeeDepth - 1);
  if (buildLogTeeDepth > 0) return;
  console.log = _buildConsoleOrig.log;
  console.warn = _buildConsoleOrig.warn;
  console.error = _buildConsoleOrig.error;
}

function finalizeCollectionBuildPass(pad2str, files) {
  const coll = CollectionFs.readCollection(projectPath, pad2str);
  if (!coll) return;
  CollectionRuntime.copySourceSnapshot(projectPath, pad2str, files);
  coll.sourceFingerprint = CollectionRuntime.computeSourceFingerprint(files, resolvedProjectPath());
  CollectionFs.writeCollection(projectPath, coll);
}

function performCollectionPieceBuild(pad2str, pieceId, opts = {}) {
  const collection = CollectionFs.readCollection(projectPath, pad2str);
  if (!collection) return { ok: false, error: "Collection not found" };
  if (collection.frozen) return { ok: false, error: "Collection is frozen" };
  const pieceRecord = collection.pieceRecords.find((p) => p.id === pieceId);
  if (!pieceRecord) return { ok: false, error: "Piece not found" };

  CollectionRuntime.migratePieceRecordFields(pieceRecord);

  pieceRecord.overrideProperties = CollectionRuntime.snapshotOverrideProperties(
    state.propertyLevels?.override || {},
  );

  const randomMode =
    !!opts.reshuffle || !CollectionRuntime.hasPieceProperties(pieceRecord);

  if (opts.reshuffle) {
    pieceRecord.seed =
      (Number(pieceRecord.seed ?? state.seed ?? 0) + 1) % 100000;
  }

  const propertyInput = randomMode
    ? CollectionRuntime.buildCollectionLocks(collection, pieceRecord)
    : CollectionRuntime.buildCollectionFullRecipe(collection, pieceRecord);

  refreshBuildValueScan();
  const values = resolveCollectionArtBuilderValues(
    collection,
    pieceRecord,
    propertyInput,
  );
  const project = getProjectFromState();
  project.metadataFlat = values._collectionValuesFlat || {};

  const onMinify = (c) => PMasterProcess.minimizeJS(Terser, c);
  const onMinifyGL = (c) => PMasterProcess.minimizeGLSL(Glslx, c);

  const output = PMasterProcess.ArtBuilder(
    PMaster,
    PMasterV2.Node,
    onMinify,
    onMinifyGL,
    project,
    values,
    [],
    true,
  );

  if (!output) {
    const pieceDir = CollectionFs.pieceDirPath(
      projectPath,
      pad2str,
      pieceRecord.num,
    );
    CollectionRuntime.writePieceBuildFailure(pieceDir, []);
    CollectionFs.patchPiece(projectPath, pad2str, pieceId, {
      buildStatus: "error",
    });
    emitBuildLog("error", `Piece ${CollectionFs.pieceListLabel(pieceRecord)}: ArtBuilder failed`, {
      pieceId,
      pad2: pad2str,
    });
    return { ok: false, error: "ArtBuilder failed" };
  }

  if (artBuilderFailed(output)) {
    const pieceDir = CollectionFs.pieceDirPath(
      projectPath,
      pad2str,
      pieceRecord.num,
    );
    CollectionRuntime.writePieceBuildFailure(pieceDir, output.errors);
    CollectionFs.patchPiece(projectPath, pad2str, pieceId, {
      buildStatus: "error",
    });
    const summary = artBuilderErrorSummary(output.errors);
    emitBuildLog("error", `Piece ${CollectionFs.pieceListLabel(pieceRecord)}: ${summary.split("\n")[0]}`, {
      pieceId,
      pad2: pad2str,
    });
    return { ok: false, error: summary, errors: output.errors };
  }

  if (output.output) output.output = patchSendParamsTarget(output.output);
  if (output.output_min) output.output_min = patchSendParamsTarget(output.output_min);

  const hxdna = concatHxDnaString(output.activeprops, output.propertyGroups);
  Object.keys(output).forEach((k) => {
    if (typeof output[k] === "string") {
      output[k] = output[k].replaceAll("[HxDNA]", hxdna);
    }
  });

  const pieceDir = CollectionFs.pieceDirPath(
    projectPath,
    pad2str,
    pieceRecord.num,
  );
  output._collectionValuesFlat = values._collectionValuesFlat;
  CollectionRuntime.mapArtBuilderOutputToPieceDir(output, pieceDir, pieceRecord);

  pieceRecord.buildStatus = "built";
  pieceRecord.lastBuiltAt = new Date().toISOString();
  pieceRecord.properties = { ...(output.activeprops || {}) };
  pieceRecord.lastBuiltAllprops = output.allprops || null;
  pieceRecord.lastBuiltPropertyGroups = output.propertyGroups || null;
  pieceRecord.lastBuiltPropertyGroupOrder = output.propertyGroupOrder || null;
  pieceRecord.lastBuiltPropertyGroupFlags = output.propertyGroupFlags || null;
  const flatBuilt = values._collectionValuesFlat || {};
  pieceRecord.values = CollectionRuntime.flatToValueBag(flatBuilt);
  delete pieceRecord.lastBuiltProperties;
  delete pieceRecord.propertyOverrides;

  CollectionFs.patchPiece(projectPath, pad2str, pieceId, {
    buildStatus: "built",
    lastBuiltAt: pieceRecord.lastBuiltAt,
    properties: pieceRecord.properties,
    overrideProperties: pieceRecord.overrideProperties,
    lastBuiltAllprops: pieceRecord.lastBuiltAllprops,
    lastBuiltPropertyGroups: pieceRecord.lastBuiltPropertyGroups,
    lastBuiltPropertyGroupOrder: pieceRecord.lastBuiltPropertyGroupOrder,
    lastBuiltPropertyGroupFlags: pieceRecord.lastBuiltPropertyGroupFlags,
    values: pieceRecord.values,
    fixedProperties: pieceRecord.fixedProperties,
    seed: pieceRecord.seed,
  });

  if (!opts.skipFingerprint) {
    finalizeCollectionBuildPass(pad2str, getEffectiveSourceFiles());
  }

  if (
    state.collectionContext.pad2 === pad2str &&
    (state.collectionContext.selectedPieceIds || []).includes(pieceId)
  ) {
    hydrateCollectionEditor(pad2str);
  }

  setCollectionPreviewFromPiece(pad2str, pieceRecord);

  return { ok: true, output, pieceRecord, pieceDir };
}

async function runCollectionBuildJob(job) {
  const { pad2, pieceIds, forceAll } = job;
  let collection = CollectionFs.readCollection(projectPath, pad2);
  if (!collection) {
    collectionBuildJob = null;
    return;
  }

  let targets = collection.pieceRecords;
  if (forceAll) {
    collection = CollectionFs.patchCollection(projectPath, pad2, {
      invalidateAll: true,
    }).collection;
    targets = collection.pieceRecords;
  } else if (pieceIds && pieceIds.length) {
    const idSet = new Set(pieceIds);
    targets = collection.pieceRecords.filter((p) => idSet.has(p.id));
  } else {
    targets = collection.pieceRecords.filter((p) => p.buildStatus !== "built");
  }

  const total = targets.length;
  let succeeded = 0;
  let failed = 0;
  installBuildLogTee();
  try {
    if (total > 0) {
      emitBuildLog(
        "info",
        `Collection ${pad2}: building ${total} piece(s)`,
        { pad2, total },
      );
    }
    for (let i = 0; i < targets.length; i++) {
      if (job.cancelled) break;
      const pr = targets[i];
      broadcastCollectionBuild({
        type: "collectionBuildProgress",
        pad2,
        pieceId: pr.id,
        pieceNum: pr.num,
        index: i + 1,
        total,
        label: CollectionFs.pieceListLabel(pr),
      });
      const result = performCollectionPieceBuild(pad2, pr.id, {
        skipFingerprint: true,
        reshuffle: !!job.reshuffle,
      });
      if (result.ok) succeeded++;
      else failed++;
      emitBuildLog(
        result.ok ? "info" : "error",
        `${CollectionFs.pieceListLabel(pr)}: ${result.ok ? "ok" : result.error || "failed"}`,
        { pad2, pieceId: pr.id },
      );
      getBuildLogAppender().flush();
    }

    if (!job.cancelled && total > 0 && failed === 0) {
      finalizeCollectionBuildPass(pad2, getEffectiveSourceFiles());
    }

    broadcastCollectionBuild({
      type: job.cancelled ? "collectionBuildCancelled" : "collectionBuildDone",
      pad2,
      reason: job.cancelled ? "user" : "done",
      total,
      succeeded,
      failed,
    });
    if (!job.cancelled && total > 0) {
      emitBuildLog(
        failed > 0 ? "error" : "info",
        `Collection ${pad2}: ${succeeded} succeeded, ${failed} failed`,
        { pad2, succeeded, failed },
      );
    }
  } finally {
    getBuildLogAppender().flush();
    uninstallBuildLogTee();
  }
  collectionBuildJob = null;
  saveDevJson();
  broadcastUpdate();
}

function startCollectionBuild(pad2, options = {}) {
  if (collectionBuildJob) {
    return { ok: false, error: "Build already in progress" };
  }
  const coll = CollectionFs.readCollection(projectPath, pad2);
  if (!coll) return { ok: false, error: "Collection not found" };
  if (coll.frozen) return { ok: false, error: "Collection is frozen" };

  collectionBuildJob = {
    pad2,
    pieceIds: options.pieceIds || null,
    forceAll: !!options.forceAll,
    reshuffle: !!options.reshuffle,
    cancelled: false,
  };

  runCollectionBuildJob(collectionBuildJob);
  return { ok: true, job: { pad2, total: coll.pieceRecords.length } };
}

/**
 * After a build, mirror Final properties (activeprops) into the active level
 * so the Properties panel matches what ArtBuilder used.
 * @param {object} activeprops
 * @param {boolean} shuffle
 * @param {object} fixed keys passed to SetRandomProperties as fixed
 */
function applyActivePropsToActiveLevel(activeprops, shuffle, fixed = {}) {
  ensurePropertyState();
  const activeLevel = state.propertiesActiveLevel || "viewer";
  if (activeLevel === "result" || !PROPERTY_LEVELS.includes(activeLevel)) return;
  if (!state.propertyLevels[activeLevel]) state.propertyLevels[activeLevel] = {};

  for (const [name, val] of Object.entries(activeprops || {})) {
    if (val == null) continue;
    if (shuffle && fixed[name] !== undefined) continue;

    const prev = state.propertyLevels[activeLevel][name] || {
      value: "",
      use: activeLevel === "viewer",
    };
    state.propertyLevels[activeLevel][name] = {
      value: String(val),
      use: activeLevel === "viewer" ? true : prev.use,
    };
  }
}

const CORE_DEBUG_DEFAULTS = {
  debug_cert: "on",
  debug_canvas_input: "on",
};

function applyCoreDebugDefaults(fixed) {
  const viewer = state.propertyLevels?.viewer || {};
  const out = { ...fixed };
  for (const [name, value] of Object.entries(CORE_DEBUG_DEFAULTS)) {
    if (out[name] != null && String(out[name]) !== "") continue;
    const entry = viewer[name];
    if (entry && entry.value != null && String(entry.value) !== "") {
      out[name] = String(entry.value);
      continue;
    }
    out[name] = value;
  }
  return out;
}

function getFixedProperties(shuffle = false) {
  ensurePropertyState();
  if (!shuffle) {
    return applyCoreDebugDefaults(
      CollectionRuntime.getRootFixedProperties(
        state.propertyLevels,
        false,
        {},
      ),
    );
  }
  const fixed = {};
  const merged = getMergedPropertiesWithResult();
  const activeLevel = state.propertiesActiveLevel || "viewer";
  const locks = state.props.locks || {};
  const groups = state.lastBuild?.propertyGroups || {};
  const groupFlags = state.lastBuild?.propertyGroupFlags || {};
  const all = state.lastBuild?.allprops || {};

  for (const name of Object.keys(all)) {
    const group = groups[name];
    const flags = group && groupFlags[group];
    const pinDebug = !!(flags && flags.pinOnRandom) || group === "Debug";
    const locked = !!locks[name] || pinDebug;

    // Default: all keys merge (implicit use), but Random only fixes locked/debug.
    if (activeLevel === "viewer") {
      if (locked) {
        const v =
          merged[name] ??
          state.props.current?.[name] ??
          state.lastBuild?.activeprops?.[name];
        if (v !== undefined) fixed[name] = String(v);
      }
      continue;
    }

    const activeEntry = state.propertyLevels[activeLevel]?.[name];
    const useAtActive = !!activeEntry?.use;

    // Override / collection / piece: unticked + locked → fixed; ticked + unlocked → roll.
    if (locked || !useAtActive) {
      let v;
      if (
        locked &&
        useAtActive &&
        activeEntry?.value != null &&
        activeEntry.value !== ""
      ) {
        v = String(activeEntry.value);
      } else {
        v =
          merged[name] ??
          state.props.current?.[name] ??
          state.lastBuild?.activeprops?.[name];
      }
      if (v !== undefined) fixed[name] = String(v);
    }
  }
  return applyCoreDebugDefaults(fixed);
}

function getBuildValues(fixed, seed) {
  return {
    num: 1,
    seed,
    collection: {
      name: "50 char placeholder 000000000000000000000000000000",
      size: 186,
      description: "Lets party!!",
      policy: "00000000000000000000000000000000000000000000000000000000",
    },
    piece: { num: 1, seed, tag: "PG-00-000" },
    artist: { name: "Artist" },
    properties: fixed,
  };
}

/** Default flat entries for first-run migration (matches legacy getBuildValues placeholders). */
function defaultBuildValueLevels() {
  const gv = getBuildValues({}, 0);
  return {
    default: {
      artist: { value: gv.artist.name, use: true },
      name: { value: gv.collection.name, use: true },
      description: { value: gv.collection.description, use: true },
      website: { value: "", use: false },
      tag: { value: gv.piece.tag, use: true },
      num: { value: String(gv.piece.num), use: true },
      seed: { value: "0", use: false },
      collection_name: { value: gv.collection.name, use: false },
      collection_size: { value: String(gv.collection.size), use: true },
      collection_description: { value: gv.collection.description, use: false },
      policy: { value: gv.collection.policy, use: true },
    },
    collection: {},
    piece: {},
    override: {},
  };
}

function ensureBuildValueState() {
  if (!state.buildValueLevels || typeof state.buildValueLevels !== "object") {
    state.buildValueLevels = defaultBuildValueLevels();
  }
  for (const level of BUILD_VALUE_LEVELS) {
    if (!state.buildValueLevels[level] || typeof state.buildValueLevels[level] !== "object") {
      state.buildValueLevels[level] = {};
    }
  }
  if (!state.buildValuesActiveLevel) state.buildValuesActiveLevel = "default";
  if (state.collectionOpen == null) state.collectionOpen = false;
  if (state.pieceOpen == null) state.pieceOpen = false;
  if (!Array.isArray(state.buildValueCustomKeys)) state.buildValueCustomKeys = [];
  if (!Array.isArray(state.buildValueLockedKeys)) state.buildValueLockedKeys = [];
  if (!Array.isArray(state.buildValueKeyOrder)) state.buildValueKeyOrder = [];
  ensureValueAutoState();
}

function collectBuildValueKeySet() {
  const keys = new Set([
    ...(state.buildValueLockedKeys || []),
    ...(state.buildValueCustomKeys || []),
  ]);
  for (const level of BUILD_VALUE_LEVELS) {
    const bag = state.buildValueLevels[level] || {};
    Object.keys(bag).forEach((k) => keys.add(k));
  }
  return keys;
}

function syncBuildValueKeyOrderFromSchema(keySet) {
  const keys = [...keySet];
  if (!Array.isArray(state.buildValueKeyOrder) || state.buildValueKeyOrder.length === 0) {
    state.buildValueKeyOrder = [...keys].sort();
  } else {
    state.buildValueKeyOrder = orderBuildValueKeys(keys, state.buildValueKeyOrder);
  }
}

function syncValueAutoKeysFromSchema() {
  ensureValueAutoState();
  const keys = state.buildValueSchema || [];
  const allowed = new Set(keys);
  for (const level of VALUE_AUTO_LEVELS) {
    const bag = state.valueAutoLevels[level];
    for (const key of keys) {
      if (!bag[key]) bag[key] = { enabled: false, prompt: "" };
    }
    for (const key of Object.keys(bag)) {
      if (!allowed.has(key)) delete bag[key];
    }
  }
}

function isBuildValueKeyRemovable(key) {
  const locked = new Set(state.buildValueLockedKeys || []);
  return !locked.has(key);
}

function recomputeBuildValueSchema() {
  const keySet = collectBuildValueKeySet();
  syncBuildValueKeyOrderFromSchema(keySet);
  return [...state.buildValueKeyOrder];
}

function allBuildValueKeys() {
  return recomputeBuildValueSchema();
}

function syncBuildValueKeysFromSchema() {
  ensureBuildValueState();
  state.buildValueSchema = recomputeBuildValueSchema();
  const keys = state.buildValueSchema;
  const allowed = new Set(keys);
  for (const level of BUILD_VALUE_LEVELS) {
    const bag = state.buildValueLevels[level];
    for (const key of keys) {
      if (!bag[key] || typeof bag[key] !== "object") {
        bag[key] = { value: "", use: false };
      } else {
        if (bag[key].value == null) bag[key].value = "";
        if (bag[key].use == null) bag[key].use = false;
      }
    }
    for (const key of Object.keys(bag)) {
      if (!allowed.has(key)) delete bag[key];
    }
  }
  syncValueAutoKeysFromSchema();
}

/** Scan art sources; updates locked keys and full schema (locked + custom). */
function refreshBuildValueScan() {
  if (!state || !state.files) return [];
  const bundles = collectSourceBundles(resolvedProjectPath(), getEffectiveSourceFiles());
  state.buildValueLockedKeys = lockedBuildValueKeys(bundles);
  if (!Array.isArray(state.buildValueCustomKeys)) state.buildValueCustomKeys = [];
  state.buildValueCustomKeys = state.buildValueCustomKeys.filter((k) =>
    typeof k === "string" && k.length > 0,
  );
  migrateBuildValueCustomKeys();
  syncBuildValueKeysFromSchema();
  return state.buildValueSchema;
}

/** Infer custom keys once for projects saved before buildValueCustomKeys existed. */
function migrateBuildValueCustomKeys() {
  if (state.buildValueCustomKeys && state.buildValueCustomKeys.length > 0) return;
  const locked = new Set(state.buildValueLockedKeys || []);
  const custom = [];
  for (const level of BUILD_VALUE_LEVELS) {
    for (const k of Object.keys(state.buildValueLevels[level] || {})) {
      if (!locked.has(k) && !custom.includes(k)) custom.push(k);
    }
  }
  if (custom.length) state.buildValueCustomKeys = custom.sort();
}

function removeBuildValueKey(key) {
  if (!isBuildValueKeyRemovable(key)) return false;
  state.buildValueCustomKeys = (state.buildValueCustomKeys || []).filter((k) => k !== key);
  state.buildValueKeyOrder = removeKeyFromOrder(state.buildValueKeyOrder, key);
  for (const level of BUILD_VALUE_LEVELS) {
    if (state.buildValueLevels[level]) delete state.buildValueLevels[level][key];
  }
  for (const level of VALUE_AUTO_LEVELS) {
    if (state.valueAutoLevels?.[level]) delete state.valueAutoLevels[level][key];
  }
  syncBuildValueKeysFromSchema();
  return true;
}

/**
 * Merge enabled keys from each level; `state.seed` is always applied as `seed`.
 * @param {object} levels
 * @param {{ seed?: number }} [opts]
 */
function mergeBuildValues(levels, opts = {}) {
  const out = {};
  for (const level of BUILD_VALUE_LEVELS) {
    const bag = levels[level] || {};
    for (const [key, entry] of Object.entries(bag)) {
      if (entry && entry.use) out[key] = entry.value != null ? String(entry.value) : "";
    }
  }
  if (opts.seed != null && !Number.isNaN(Number(opts.seed))) {
    out.seed = String(opts.seed);
  }
  return applyDerivedBuildValues(out);
}

/**
 * Map flat merged Values-panel keys to nested shape ArtBuilder expects.
 */
function flatToArtBuilderInput(flat, fixed, seed) {
  const num = parseInt(flat.num, 10) || 1;
  const pieceSeed =
    seed != null && !Number.isNaN(Number(seed))
      ? Number(seed)
      : parseInt(flat.seed, 10) || 0;
  const collectionName =
    flat.collection_name ||
    "50 char placeholder 000000000000000000000000000000";
  const collectionDescription =
    flat.collection_description || flat.description || "Lets party!!";
  return {
    properties: fixed,
    collection: {
      name: collectionName,
      size: parseInt(flat.collection_size, 10) || 186,
      description: collectionDescription,
      policy:
        flat.policy ||
        "00000000000000000000000000000000000000000000000000000000",
    },
    piece: {
      num,
      seed: pieceSeed,
      tag: flat.tag || "PG-00-000",
      ...(flat.hash ? { hash: flat.hash } : {}),
    },
    artist: {
      name: flat.artist || "Artist",
    },
    ...(flat.name ? { piececollection: { name: flat.name } } : {}),
    debug_stat_samples: flat.debug_stat_samples,
  };
}

function resolveArtBuilderValues(fixed, seed, extra = {}) {
  refreshBuildValueScan();
  const flat = mergeBuildValues(state.buildValueLevels, { seed });
  const values = flatToArtBuilderInput(flat, fixed, seed);
  return { ...values, ...extra };
}

/**
 * Property distribution analysis only (no HTML/metadata minify).
 * See docs/PROPERTY-ANALYSIS.md.
 * @param {number} samples
 * @returns {Promise<object>}
 */
async function performAnalysis(samples) {
  if (!state) {
    return { ok: false, error: "No project state loaded" };
  }
  if (analysisInProgress) {
    return { ok: false, error: "Analysis already in progress" };
  }

  samples = clampAnalysisSamples(
    samples ?? state.settings?.analysisSamples ?? ANALYSIS_SAMPLES_DEFAULT,
  );
  analysisInProgress = true;
  broadcastAnalysis({ type: "analysisStart", samples });
  await new Promise((resolve) => setImmediate(resolve));

  const t0 = Date.now();
  try {
    refreshParamScan();
    const project = getProjectFromState();
    const fixed = getFixedProperties(false);
    const seed = state.seed ?? Math.floor(Math.random() * 10000);
    const values = resolveArtBuilderValues(fixed, seed);

    const onProgress = (p) => {
      broadcastAnalysis({
        type: "analysisProgress",
        n: p.n,
        samples: p.samples,
        percent: p.percent,
      });
    };

    console.log(`${GREEN}Property analysis (${samples} samples)...${RESET}`);
    const result = await PMasterProcess.PropertyAnalysis(
      PMaster,
      PMasterV2.Node,
      project,
      values,
      samples,
      onProgress,
    );

    state.lastAnalysis = {
      ...result,
      requested_samples: samples,
      completed_at: new Date().toISOString(),
    };
    if (!state.settings) state.settings = {};
    state.settings.analysisSamples = samples;
    saveDevJson();

    broadcastAnalysis({ type: "analysisDone", result: state.lastAnalysis });
    return state.lastAnalysis;
  } catch (e) {
    const errResult = {
      ok: false,
      error: e.message || String(e),
      duration_ms: Date.now() - t0,
    };
    state.lastAnalysis = errResult;
    broadcastAnalysis({ type: "analysisDone", result: errResult });
    return errResult;
  } finally {
    analysisInProgress = false;
  }
}

function performBuild(shuffle = false) {
  if (isCollectionMode()) {
    console.log(`${GREEN}Skipping root build — collection open${RESET}`);
    return;
  }

  installBuildLogTee();
  try {
  console.log(`${GREEN}Building...${RESET}`);
  broadcastRebuilding();
  const paramsMd = refreshParamScan();
  try {
    saveFile(`${projectPath}/output.params.md`, paramsMd);
  } catch (e) {
    console.error("Could not write output.params.md:", e.message || e);
  }
  refreshBuildValueScan();
  const project = getProjectFromState();

  const fixed = getFixedProperties(shuffle);
  if(shuffle) state.seed = new Date().getMilliseconds() % 40000;
  let seed = state.seed ?? Math.floor(Math.random() * 10000);
  console.log("building with seed: "+seed)
  const values = resolveArtBuilderValues(fixed, seed, {
    debug_stat_samples: state.settings.debugStatSamples,
  });

  const onMinify = c => PMasterProcess.minimizeJS(Terser, c);
  const onMinifyGL = c => PMasterProcess.minimizeGLSL(Glslx, c);

  const output = PMasterProcess.ArtBuilder(PMaster, PMasterV2.Node, onMinify, onMinifyGL, project, values, [], true);
  refreshImportWatchPaths();
  if (!output || artBuilderFailed(output)) {
    if (output?.errors?.length) {
      try {
        saveFile(
          `${projectPath}/output.errors.json`,
          JSON.stringify(output.errors, null, 2),
        );
      } catch (e) {
        console.error("Could not write output.errors.json:", e.message || e);
      }
    }
    state.lastBuild = output || null;
    maybeInvalidateCollectionsOnSourceChange();
    syncEffectiveCoreHash();
    saveDevJson();
    broadcastUpdate();
    emitBuildLog(
      "error",
      artBuilderErrorSummary(output?.errors) || "Build failed",
    );
    return;
  }
  if (output) {
    if (output.output) output.output = patchSendParamsTarget(output.output);
    if (output.output_min) output.output_min = patchSendParamsTarget(output.output_min);
    state.lastBuild = output;
    if (output.activeprops) {
      state.props.current = { ...output.activeprops };
      syncPropertyLevelsFromBuild(output.activeprops, output.allprops);
      applyActivePropsToActiveLevel(output.activeprops, shuffle, fixed);
    }
    if (output.allprops) {
      const groups = output.propertyGroups || {};
      const groupFlags = output.propertyGroupFlags || {};
      Object.keys(output.allprops).forEach((k) => {
        if (k in state.props.locks) return;
        const g = groups[k];
        const flags = g && groupFlags[g];
        if (flags && flags.lockUi) state.props.locks[k] = true;
        else if (k.startsWith("debug_")) state.props.locks[k] = true;
      });
    }

    const hxdna = concatHxDnaString(
      output.activeprops,
      output.propertyGroups,
    );

    Object.keys(output).forEach(k => {
      let val = output[k];
      if (typeof val == "string") {
        output[k] = val.replaceAll("[HxDNA]", hxdna);
      }
    })

    // data = data.replaceAll("[HxDNA]", hxdna);


    // Object.entries(output.activeprops).forEach(([k,v])=>{
    //   if (k.includes("HxDNA_")) {
    //     hxdna+= n%2 ? v : v.toLocaleLowerCase();
    //     n++;
    //   }
    // })
    console.log("HexDNA:",hxdna);

    let fileSave = [
      {name:"metadata",     ext:"json"},
      {name:"metadata_min", ext:"json"},
      {name:"output",       ext:"html"},
      {name:"output_min",   ext:"html"},
      {name:"utf8link",     ext:"txt"},
      {name:"errors",       ext:"json", stringify:true},
    ]
    fileSave.forEach(({name,ext,stringify})=>{
      let data = output[name];
      if (data === undefined || data === null) return;
      stringify && (data=JSON.stringify(data,null,2));
      if (VERBOSE_FS) console.log("saving output:", name, ext);
      saveFile(`${projectPath}/output.${name}.${ext}`, data);
    })

    if (output.metadata_outputs && typeof output.metadata_outputs === "object") {
      for (const [filename, entry] of Object.entries(output.metadata_outputs)) {
        if (filename === "metadata.json") continue;
        if (!entry || entry.min == null) continue;
        if (VERBOSE_FS) console.log("saving metadata output:", filename);
        saveFile(`${projectPath}/output.${filename}`, entry.min);
      }
    }

    maybeInvalidateCollectionsOnSourceChange();
    syncEffectiveCoreHash();
    saveDevJson();
    broadcastUpdate();
    emitBuildLog("info", "Build completed");
  } else {
    saveDevJson();
    broadcastUpdate();
    emitBuildLog("error", "Build failed");
  }
  } finally {
    getBuildLogAppender().flush();
    uninstallBuildLogTee();
  }
}

loadDevJson();

const projectResolved = path.resolve(__dirname, projectPath);
const advDir = __dirname;
let rebuildDebounce = null;

function scheduleFileRebuild() {
  if (!state || !state.settings.autoRebuildOnFileChange) return;
  clearTimeout(rebuildDebounce);
  rebuildDebounce = setTimeout(() => {
    rebuildDebounce = null;
    try {
      if (filesHaveChanged()) {
        updateFilesFromDisk();
        maybeInvalidateCollectionsOnSourceChange();
        if (!isCollectionMode()) {
          performBuild();
        }
      }
    } catch (e) {
      console.error("File watch rebuild error:", e);
    }
  }, 200);
}

/** Explicit paths (not `dir/*` globs) — more reliable on Windows + editors that atomic-save. */
const parametersWatchDir = path.join(projectResolved, "parameters");
const globalParametersWatchDir = path.join(advDir, "parameters");
const watchPaths = [
  ...SOURCE_FILE_NAMES.map((n) => path.join(projectResolved, n)),
  path.join(advDir, DEFAULT_RUNTIME_REL),
  path.join(parametersWatchDir, "*.html"),
  path.join(globalParametersWatchDir, "*.html"),
];

const usePoll =
  process.env.ADVBUILDER_POLL_WATCH === "1" ||
  process.env.CHOKIDAR_USEPOLLING === "1";

watcher = chokidar.watch(watchPaths, {
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 350, pollInterval: 100 },
  usePolling: usePoll,
  interval: usePoll ? 800 : undefined,
});

function fileWatchShouldReact(fp) {
  if (!fp) return true;
  const fpResolved = path.resolve(fp);
  const base = path.basename(fp);
  if (base === "dev.json" || base.startsWith("output.")) return false;

  const importPaths = state?.importWatchPaths || [];
  if (importPaths.some((p) => path.resolve(p) === fpResolved)) return true;

  const allowed = new Set([
    ...SOURCE_FILE_NAMES,
    "cc-v3.23.html",
    "cc-v3.22.html",
  ]);
  if (allowed.has(base)) {
    const expected = path.resolve(projectResolved, base);
    if (fpResolved === expected) {
      if (base === "core.html" && getStoredRuntimeId(projectPath) !== PROJECT_CORE_ID) {
        return false;
      }
      return true;
    }
  }

  if (fpResolved.replace(/\\/g, "/").includes("/parameters/")) {
    if (base.endsWith(".html")) return true;
    if (base.endsWith(".memory.json")) return false;
  }

  const globalParams = path.resolve(globalParametersWatchDir);
  if (
    (fpResolved.startsWith(globalParams + path.sep) || fpResolved === globalParams) &&
    base.endsWith(".html")
  ) {
    return true;
  }

  const advRuntimePaths = [
    path.resolve(advDir, DEFAULT_RUNTIME_REL),
  ];
  if (advRuntimePaths.includes(fpResolved)) return true;

  const runtimeId = getStoredRuntimeId(projectPath);
  if (runtimeId !== PROJECT_CORE_ID) {
    try {
      if (fpResolved === path.resolve(resolveRuntimeFile(runtimeId))) return true;
    } catch (_) {}
  }
  return false;
}

watcher.on("all", (ev, fp) => {
  if (!fileWatchShouldReact(fp)) return;
  if (!fp) {
    scheduleFileRebuild();
    return;
  }
  const base = path.basename(fp);
  if (base === "dev.json" || base.startsWith("output.")) return;
  const allowed = new Set([
    ...SOURCE_FILE_NAMES,
    "cc-v3.23.html",
    "cc-v3.22.html",
  ]);
  if (allowed.has(base)) {
    if (base === "core.html" && getStoredRuntimeId(projectPath) !== PROJECT_CORE_ID) {
      return;
    }
    scheduleFileRebuild();
    return;
  }
  const runtimeId = getStoredRuntimeId(projectPath);
  if (runtimeId !== PROJECT_CORE_ID && fp) {
    try {
      if (path.resolve(fp) === path.resolve(resolveRuntimeFile(runtimeId))) {
        scheduleFileRebuild();
        return;
      }
    } catch (_) {}
  }
  const importPaths = state.importWatchPaths || [];
  if (fp && importPaths.some((p) => path.resolve(p) === path.resolve(fp))) {
    scheduleFileRebuild();
    return;
  }
  if (fp && fp.replace(/\\/g, "/").includes("/parameters/")) {
    if (base.endsWith(".html")) scheduleParamDriverScan();
    else if (base.endsWith(".memory.json")) {
      /* payload/index memory changed — no full rebuild */
    }
  }
});

let devUIHTML = loadFile('./dev-ui.html') || '<h1>dev-ui.html missing</h1>';

const server = http.createServer((req, res) => {
  /** `req.url` includes query string (e.g. `/?embed=1`); route on pathname only. */
  let pathname = '/';
  try {
    pathname = new URL(req.url || '/', 'http://localhost').pathname;
  } catch (_) {
    pathname = (req.url || '/').split('?')[0] || '/';
  }

  if (pathname === '/whoami') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        pid: process.pid,
        projectName,
        projectPath,
      }),
    );
    return;
  }

  if (pathname === '/') {
    const html = loadFile('./dev-ui.html') || devUIHTML;
    res.writeHead(200, {'Content-Type':'text/html'});
    res.end(html);

  } else if (
    pathname === '/README.md' ||
    pathname === '/STAGING.md' ||
    pathname.startsWith('/docs/') ||
    ((pathname.startsWith('/runtimes/') || pathname.startsWith('/lib/')) && pathname.toLowerCase().endsWith('.md'))
  ) {
    const rel = pathname.startsWith('/docs/')
      ? 'docs/' + decodeURIComponent(pathname.slice('/docs/'.length)).replace(/\\/g, '/')
      : decodeURIComponent(pathname.slice(1)).replace(/\\/g, '/');
    const found = readHelpFile(__dirname, rel);
    if (!found) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const type = found.ext === '.md' ? 'text/markdown; charset=utf-8' : 'text/plain; charset=utf-8';
    res.writeHead(200, { 'Content-Type': type });
    res.end(found.text);

  } else if (pathname.startsWith('/vendor/')) {
    const base = path.basename(pathname);
    if (!base || base !== base.replace(/[^a-zA-Z0-9._-]/g, "")) {
      res.writeHead(400);
      res.end();
      return;
    }
    const vendorPath = path.join(advDir, "vendor", base);
    const ext = path.extname(base).toLowerCase();
    const types = { ".js": "application/javascript", ".css": "text/css", ".map": "application/json" };
    const body = loadFile(vendorPath);
    if (body == null) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(body);

  } else if (pathname === "/collection_ui.js") {
    const src = loadFile(path.join(advDir, "collection_ui.js"));
    if (src == null) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "application/javascript" });
    res.end(src);
  } else if (pathname === "/console_panel.js") {
    const src = loadFile(path.join(advDir, "console_panel.js"));
    if (src == null) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "application/javascript" });
    res.end(src);
  } else if (pathname === "/capture_host.js") {
    const src = loadFile(path.join(advDir, "capture_host.js"));
    if (src == null) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "application/javascript" });
    res.end(src);
  } else if (pathname === "/view_nav_controls.js") {
    const src = loadFile(path.join(advDir, "view_nav_controls.js"));
    if (src == null) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "application/javascript" });
    res.end(src);
  } else if (pathname.startsWith('/ui/')) {
    const base = path.basename(pathname);
    if (!base || base !== base.replace(/[^a-zA-Z0-9._-]/g, '')) {
      res.writeHead(400);
      res.end();
      return;
    }
    const uiPath = path.join(advDir, 'ui', base);
    const ext = path.extname(base).toLowerCase();
    const types = { '.js': 'application/javascript', '.css': 'text/css' };
    if (!types[ext]) {
      res.writeHead(400);
      res.end();
      return;
    }
    const body = loadFile(uiPath);
    if (body == null) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': types[ext] });
    res.end(body);

  } else if (pathname === "/doc_viewer.js") {
    const src = loadFile(path.join(advDir, "doc_viewer.js"));
    if (src == null) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "application/javascript" });
    res.end(src);

  } else if (pathname === "/color_picker.js") {
    const src = loadFile(path.join(advDir, "color_picker.js"));
    if (src == null) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "application/javascript" });
    res.end(src);

  } else if (pathname === "/viewport_bg.js") {
    const src = loadFile(path.join(advDir, "viewport_bg.js"));
    if (src == null) {
      res.writeHead(404);
      res.end();
      return;
    }
    const wrapped =
      "(function(g){var module={exports:{}};var exports=module.exports;\n" +
      src +
      "\ng.advViewportBg=module.exports;})(typeof window!=='undefined'?window:globalThis);";
    res.writeHead(200, { "Content-Type": "application/javascript" });
    res.end(wrapped);

  } else if (pathname === "/param_color.js") {
    const src = loadFile(path.join(advDir, "param_color.js"));
    if (src == null) {
      res.writeHead(404);
      res.end();
      return;
    }
    const wrapped =
      "(function(g){var module={exports:{}};var exports=module.exports;\n" +
      src +
      "\ng.advParamColor=module.exports;})(typeof window!=='undefined'?window:globalThis);";
    res.writeHead(200, { "Content-Type": "application/javascript" });
    res.end(wrapped);

  } else if (pathname === "/param_messenger.js") {
    const src = loadFile(path.join(advDir, "param_messenger.js"));
    if (src == null) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "application/javascript" });
    res.end(src);
  } else if (pathname === "/param_readout.js") {
    const src = loadFile(path.join(advDir, "param_readout.js"));
    if (src == null) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "application/javascript" });
    res.end(src);
  } else if (pathname === "/param_driver_host.js") {
    const src = loadFile(path.join(advDir, "param_driver_host.js"));
    if (src == null) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "application/javascript" });
    res.end(src);
  } else if (pathname === "/platform_secrets.js") {
    const src = loadFile(path.join(advDir, "platform_secrets.js"));
    if (src == null) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "application/javascript" });
    res.end(src);
  } else if (pathname === "/parameters/DRIVERS_README.txt") {
    seedDriversReadme(projectPath, DRIVERS_README_TEMPLATE);
    const body = loadFile(readmePath(projectPath));
    if (body == null) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(body);
  } else if (/^\/parameters\/[a-zA-Z0-9_-]+\.html$/.test(pathname)) {
    const id = path.basename(pathname, ".html");
    if (!isValidDriverId(id)) {
      res.writeHead(400);
      res.end();
      return;
    }
    const fp = driverHtmlPath(projectPath, id);
    let body = fp ? loadFile(fp) : null;
    if (body == null) {
      res.writeHead(404);
      res.end();
      return;
    }
    body = wrapDriverHtml(body);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(body);
  } else if (/^\/parameters\/[a-zA-Z0-9_-]+\/store$/.test(pathname)) {
    const id = pathname.split("/")[2];
    if (!isValidDriverId(id)) {
      res.writeHead(400);
      res.end();
      return;
    }
    let file = "";
    try {
      file = new URL(req.url || "/", "http://localhost").searchParams.get("file") || "";
    } catch (_) {
      file = "";
    }
    if (!isValidDriverStoreBasename(id, file)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Invalid store file" }));
      return;
    }
    if (req.method === "GET") {
      const result = readDriverStoreJson(projectPath, id, file);
      res.writeHead(result.ok ? 200 : 400, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error }));
      return;
    }
    if (req.method === "PUT") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 600000) req.destroy();
      });
      req.on("end", () => {
        let patch = {};
        try {
          patch = JSON.parse(body || "{}");
        } catch (_) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Invalid JSON body" }));
          return;
        }
        const result = writeDriverStoreJson(projectPath, id, file, patch);
        res.writeHead(result.ok ? 200 : 400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify(
            result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error },
          ),
        );
      });
      req.on("error", () => {
        res.writeHead(500);
        res.end();
      });
      return;
    }
    res.writeHead(405);
    res.end();
  } else if (pathname === "/param_coerce.js") {
    const src = loadFile(path.join(advDir, "param_coerce.js"));
    if (src == null) {
      res.writeHead(404);
      res.end();
      return;
    }
    const wrapped =
      "(function(g){var module={exports:{}};var exports=module.exports;\n" +
      src +
      "\ng.advParamCoerce=module.exports;})(typeof window!=='undefined'?window:globalThis);";
    res.writeHead(200, { "Content-Type": "application/javascript" });
    res.end(wrapped);

  } else if (req.url.startsWith('/visualise')) {
    const u = new URL(`http://localhost${req.url}`);
    const mode = u.searchParams.get('mode') || 'full';
    const collPad2 = u.searchParams.get('collection');
    const piecePad4 = u.searchParams.get('piece');
    let c = '<h1>No build</h1>';
    let contentType = 'text/html';

    if (
      collPad2 &&
      piecePad4 &&
      /^\d{2}$/.test(collPad2) &&
      /^\d{4}$/.test(piecePad4)
    ) {
      const pieceNum = parseInt(piecePad4, 10);
      const pieceDir = CollectionFs.pieceDirPath(
        projectPath,
        collPad2,
        pieceNum,
      );
      const readPieceFile = (name) => {
        const fp = path.join(pieceDir, name);
        return fs.existsSync(fp) ? loadFile(fp) : null;
      };
      if (mode === "min") {
        c = patchVisualiseHtml(readPieceFile("min.html") || c);
      } else if (mode === 'utf8') {
        const utf8 = readPieceFile('utf8.txt');
        c = utf8
          ? renderUtf8Viewer({ utf8link: utf8 })
          : '<h1>No utf8 build</h1>';
        contentType = 'text/html';
      } else if (mode === 'metadata') {
        const metadata_outputs = {};
        if (fs.existsSync(pieceDir)) {
          for (const fname of fs.readdirSync(pieceDir)) {
            if (!isMetadataOutputFilename(fname)) continue;
            const raw = readPieceFile(fname);
            if (!raw) continue;
            try {
              const parsed = JSON.parse(raw);
              metadata_outputs[fname] = {
                pretty: JSON.stringify(parsed, null, 2),
                min: raw,
                size: Buffer.byteLength(raw, "utf8"),
              };
            } catch (_) {
              /* skip invalid */
            }
          }
        }
        if (Object.keys(metadata_outputs).length) {
          c = renderMetadataViewer(
            { metadata_outputs },
            { cardanoMetadataSplit: state.settings?.cardanoMetadataSplit !== false },
          );
        } else {
          c = '<h1>No metadata build</h1>';
        }
        contentType = 'text/html';
      } else if (mode !== 'analysis') {
        c = readPieceFile("full.html") || c;
        if (c && c !== "<h1>No build</h1>") {
          c = patchVisualiseHtml(c);
        }
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(c);
      return;
    }

    if (mode === 'analysis') {
      c = renderAnalysisViewer({
        defaultSamples:
          state.settings?.analysisSamples ?? ANALYSIS_SAMPLES_DEFAULT,
        lastAnalysis: state.lastAnalysis ?? null,
        hideDebug: state.settings?.analysisHideDebug !== false,
        hideHxDna: state.settings?.analysisHideHxDna !== false,
        expertOpen: !!state.settings?.analysisExpertOpen,
      });
      contentType = 'text/html';
    } else if (state.lastBuild) {
      if (mode === "min") {
        c = patchVisualiseHtml(state.lastBuild.output_min || "");
      } else if (mode === "utf8") {
        c = renderUtf8Viewer(state.lastBuild);
        contentType = "text/html";
      } else if (mode === "metadata") {
        if (!hasMetadataBuilder(projectPath)) {
          c = renderMetadataSetupViewer({
            projectName,
            metadataPath: metadataJsPath(projectPath),
          });
        } else if (state.lastBuild) {
          c = renderMetadataViewer(state.lastBuild, {
            cardanoMetadataSplit: state.settings?.cardanoMetadataSplit !== false,
          });
        } else {
          c = "<h1>No build</h1>";
        }
        contentType = "text/html";
      } else {
        c = patchVisualiseHtml(state.lastBuild.output || "");
      }
    }
    res.writeHead(200, {'Content-Type': contentType});
    res.end(c);

  } else if (pathname === '/state') {
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify(state));

  } else if (pathname === '/runtimes') {
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, projectName, ...getRuntimesState(projectPath) }));

  } else if (pathname === '/project/runtime') {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
      return;
    }
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      let payload;
      try {
        payload = JSON.parse(body || '{}');
      } catch (_) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
        return;
      }
      const result = setProjectRuntime(projectPath, payload.runtimeId);
      if (!result.ok) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }
      if (!result.skipped) {
        syncEffectiveCoreHash();
        maybeInvalidateCollectionsOnSourceChange();
        performBuild();
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    });
    return;

  } else if (pathname === '/params') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          schema: state.paramSchema || [],
          errors: state.paramScanErrors || [],
          values: state.paramValues || {},
        }),
      );
    } else if (req.method === 'POST') {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        let payload;
        try {
          payload = JSON.parse(body || '{}');
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
          return;
        }
        if (!state.paramValues || typeof state.paramValues !== 'object') {
          state.paramValues = {};
        }
        if (Array.isArray(payload.remove)) {
          for (const k of payload.remove) {
            if (typeof k === 'string') delete state.paramValues[k];
          }
        }
        if (payload.values && typeof payload.values === 'object') {
          Object.assign(state.paramValues, payload.values);
        }
        const persist = payload.persist !== false;
        if (persist) saveDevJson();
        if (payload.broadcast !== false) broadcastParams();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, values: state.paramValues }));
      });
    } else {
      res.writeHead(405);
      res.end();
    }

  } else if (pathname === "/metadata/create-default") {
    if (req.method !== "POST") {
      res.writeHead(405);
      res.end();
      return;
    }
    const result = writeDefaultMetadataJs(projectPath);
    if (!result.ok) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: result.error }));
      return;
    }
    syncSourceFilesFromDisk();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        path: result.path,
        relativePath: `${projectName}/metadata.js`,
      }),
    );
    performBuild();
  } else if (pathname === "/collection-scripts") {
    if (req.method !== "GET") {
      res.writeHead(405);
      res.end();
      return;
    }
    refreshCollectionScriptNames();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        scripts: state.collectionScriptNames || [],
        hasFile: fs.existsSync(collectionJsPath(projectPath)),
      }),
    );
  } else if (pathname === "/collection/create-default") {
    if (req.method !== "POST") {
      res.writeHead(405);
      res.end();
      return;
    }
    const result = writeDefaultCollectionJs(projectPath);
    if (!result.ok) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: result.error }));
      return;
    }
    syncSourceFilesFromDisk();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        path: result.path,
        relativePath: `${projectName}/collection.js`,
      }),
    );
    broadcastUpdate();
  } else if (pathname === "/buildValues") {
    if (req.method !== "POST") {
      res.writeHead(405);
      res.end();
      return;
    }
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      let payload;
      try {
        payload = JSON.parse(body || "{}");
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
        return;
      }
      ensureBuildValueState();
      let collectionResult = null;
      const level = payload.level;
      if (level && BUILD_VALUE_LEVELS.includes(level)) {
        if (!state.buildValueLevels[level]) state.buildValueLevels[level] = {};
        if (payload.patch && typeof payload.patch === "object") {
          for (const [key, entry] of Object.entries(payload.patch)) {
            if (!entry || typeof entry !== "object") continue;
            const prev = state.buildValueLevels[level][key] || { value: "", use: false };
            state.buildValueLevels[level][key] = {
              value: entry.value != null ? String(entry.value) : prev.value ?? "",
              use: entry.use != null ? !!entry.use : prev.use,
            };
          }
        }
      }
      if (
        payload.valueAutoEditLevel &&
        VALUE_AUTO_LEVELS.includes(payload.valueAutoEditLevel)
      ) {
        state.valueAutoEditLevel = payload.valueAutoEditLevel;
      }
      const autoLevel =
        payload.valueAutoLevel ||
        payload.valueAutoEditLevel ||
        state.valueAutoEditLevel ||
        "default";
      if (
        payload.valueAutoPatch &&
        typeof payload.valueAutoPatch === "object" &&
        VALUE_AUTO_LEVELS.includes(autoLevel)
      ) {
        applyValueAutoPatch(state.valueAutoLevels[autoLevel], payload.valueAutoPatch);
        if (autoLevel === "collection") {
          collectionResult = persistCollectionValueAuto(
            autoLevel,
            payload.valueAutoPatch,
          );
          if (!collectionResult.ok) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify(collectionResult));
            return;
          }
        }
      }
      if (
        payload.valueAutoRemoveKey &&
        typeof payload.valueAutoRemoveKey === "string" &&
        VALUE_AUTO_LEVELS.includes(autoLevel)
      ) {
        const autoKey = payload.valueAutoRemoveKey.trim();
        if (autoLevel === "collection") {
          collectionResult = persistCollectionValueAuto(autoLevel, null, autoKey);
          if (!collectionResult.ok) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify(collectionResult));
            return;
          }
        } else {
          delete state.valueAutoLevels.default[autoKey];
        }
      }
      if (payload.reorderKeys && Array.isArray(payload.reorderKeys)) {
        const activeForReorder =
          payload.activeLevel || state.buildValuesActiveLevel || "default";
        if (activeForReorder !== "default") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              ok: false,
              error: "Key reorder is only allowed on the default level",
            }),
          );
          return;
        }
        const schemaKeys = [...collectBuildValueKeySet()].sort();
        if (!isValidBuildValueKeyReorder(payload.reorderKeys, schemaKeys)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              ok: false,
              error: "reorderKeys must list each schema key exactly once",
            }),
          );
          return;
        }
        state.buildValueKeyOrder = payload.reorderKeys.map(String);
        state.buildValueSchema = [...state.buildValueKeyOrder];
      }
      if (payload.addKey && typeof payload.addKey === "string") {
        const key = payload.addKey.trim();
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
          if (!state.buildValueCustomKeys.includes(key)) {
            state.buildValueCustomKeys.push(key);
          }
          state.buildValueKeyOrder = appendKeyToOrder(state.buildValueKeyOrder, key);
          for (const lv of BUILD_VALUE_LEVELS) {
            if (!state.buildValueLevels[lv][key]) {
              state.buildValueLevels[lv][key] = { value: "", use: false };
            }
          }
          for (const lv of VALUE_AUTO_LEVELS) {
            if (!state.valueAutoLevels[lv][key]) {
              state.valueAutoLevels[lv][key] = { enabled: false, prompt: "" };
            }
          }
        }
      }
      if (payload.removeKey && typeof payload.removeKey === "string") {
        const key = payload.removeKey.trim();
        if (!removeBuildValueKey(key)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              ok: false,
              error: "Key cannot be removed (required by builder or source)",
            }),
          );
          return;
        }
      }
      if (payload.activeLevel) {
        const al = payload.activeLevel;
        if (al === "result" || al === "auto" || BUILD_VALUE_LEVELS.includes(al)) {
          state.buildValuesActiveLevel = al;
        }
        if (VALUE_AUTO_LEVELS.includes(al)) {
          state.valueAutoEditLevel = al;
        }
      }
      syncBuildValueKeysFromSchema();
      if (
        isCollectionMode() &&
        level &&
        (level === "collection" || level === "piece") &&
        payload.patch
      ) {
        collectionResult = persistCollectionBuildValues(level, payload.patch);
        if (!collectionResult.ok) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify(collectionResult));
          return;
        }
      }
      if (isCollectionMode() && level === "override" && payload.patch) {
        const pad2 = state.collectionContext.pad2;
        CollectionFs.patchCollection(projectPath, pad2, { invalidateAll: true });
        updateCollectionPreviewFromSession();
      }
      const shouldRebuild =
        payload.rebuild !== false && !isCollectionMode();
      applyIncomingParamValues(payload.paramValues);
      saveDevJson();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          buildValueLevels: state.buildValueLevels,
          buildValuesActiveLevel: state.buildValuesActiveLevel,
          buildValueSchema: state.buildValueSchema,
          buildValueKeyOrder: state.buildValueKeyOrder,
          buildValueCustomKeys: state.buildValueCustomKeys,
          buildValueLockedKeys: state.buildValueLockedKeys,
          valueAutoLevels: state.valueAutoLevels,
          valueAutoEditLevel: state.valueAutoEditLevel,
          merged: mergeBuildValues(state.buildValueLevels, { seed: state.seed }),
          collection: collectionResult?.collection || null,
        }),
      );
      if (shouldRebuild) performBuild();
      else if (
        collectionResult?.collection &&
        buildValuesPatchAffectsEditor(payload)
      ) {
        broadcastUpdate();
      }
    });
  } else if (pathname === "/auto/resolve") {
    if (req.method !== "POST") {
      res.writeHead(405);
      res.end();
      return;
    }
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      let payload;
      try {
        payload = JSON.parse(body || "{}");
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
        return;
      }
      const key = payload.key;
      if (!key || typeof key !== "string") {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "key required" }));
        return;
      }
      const target = resolveAutoPieceTarget(payload);
      if (!target.ok) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify(target));
        return;
      }
      const result = buildAutoResolveForRequest(
        payload,
        target.coll,
        target.pieceRecord,
      );
      res.writeHead(result.ok ? 200 : 400, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    });
  } else if (pathname === "/auto/generate") {
    if (req.method !== "POST") {
      res.writeHead(405);
      res.end();
      return;
    }
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      (async () => {
        let payload;
        try {
          payload = JSON.parse(body || "{}");
        } catch (e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
          return;
        }
        const key = payload.key;
        if (!key || typeof key !== "string") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "key required" }));
          return;
        }
        const apiKey = loadAdvBuilderXaiKey();
        if (!apiKey) {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              ok: false,
              error: "xAI API key not configured (use Electron app xAI key modal)",
            }),
          );
          return;
        }
        const target = resolveAutoPieceTarget(payload);
        if (!target.ok) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify(target));
          return;
        }
        const trimmedKey = key.trim();
        if (payload.onlyIfEmpty) {
          ensureBuildValueState();
          const flat = mergeBuildValues(state.buildValueLevels, {
            seed: state.seed,
          });
          const cur = flat[trimmedKey];
          if (cur != null && String(cur).trim() !== "") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                ok: true,
                skipped: true,
                key: trimmedKey,
                reason: "already has value",
              }),
            );
            return;
          }
        }
        const resolved = buildAutoResolveForRequest(
          payload,
          target.coll,
          target.pieceRecord,
        );
        if (!resolved.ok) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify(resolved));
          return;
        }
        const gen = await generateOneValueField({
          apiKey,
          key: key.trim(),
          resolved,
        });
        if (!gen.ok) {
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(JSON.stringify(gen));
          return;
        }
        const written = writeGeneratedValueToPiece(
          target.pad2,
          target.pieceRecord,
          key.trim(),
          gen.value,
        );
        if (!written.ok) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify(written));
          return;
        }
        saveDevJson();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: true,
            key: key.trim(),
            value: gen.value,
            level: resolved.level,
            piece: written.piece,
            collection: written.collection,
          }),
        );
        broadcastUpdate();
      })().catch((err) => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: false,
            error: err.message || String(err),
          }),
        );
      });
    });
  } else if (pathname === "/propertyLevels") {
    if (req.method !== "POST") {
      res.writeHead(405);
      res.end();
      return;
    }
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      let payload;
      try {
        payload = JSON.parse(body || "{}");
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
        return;
      }
      ensurePropertyState();
      const level = payload.level;
      if (level && PROPERTY_LEVELS.includes(level)) {
        if (!state.propertyLevels[level]) state.propertyLevels[level] = {};
        if (payload.patch && typeof payload.patch === "object") {
          for (const [key, entry] of Object.entries(payload.patch)) {
            if (!entry || typeof entry !== "object") continue;
            const prev = state.propertyLevels[level][key] || {
              value: "",
              use: false,
            };
            let use =
              entry.use != null ? !!entry.use : prev.use;
            if (level === "viewer") use = true;
            state.propertyLevels[level][key] = {
              value:
                entry.value != null ? String(entry.value) : prev.value ?? "",
              use,
            };
          }
        }
      }
      if (payload.activeLevel) {
        const al = payload.activeLevel;
        if (al === "result" || PROPERTY_LEVELS.includes(al)) {
          state.propertiesActiveLevel = al;
        }
      }
      normalizePropertiesActiveLevel();
      if (payload.locks && typeof payload.locks === "object") {
        state.props.locks = { ...state.props.locks, ...payload.locks };
      }
      let collectionResult = null;
      if (
        payload.fixedToggle &&
        typeof payload.fixedToggle === "object" &&
        level &&
        (level === "collection" || level === "piece")
      ) {
        const ft = payload.fixedToggle;
        if (ft.prop) {
          collectionResult = persistCollectionFixedProperty(
            level,
            ft.prop,
            ft.value != null ? ft.value : "",
            !!ft.locked,
          );
          if (!collectionResult.ok) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify(collectionResult));
            return;
          }
        }
      }
      if (
        isCollectionMode() &&
        level &&
        (level === "collection" || level === "piece") &&
        payload.patch
      ) {
        const patchResult = persistCollectionPropertyLevels(level, payload.patch);
        if (!patchResult.ok) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify(patchResult));
          return;
        }
        collectionResult = {
          ...patchResult,
          collection: patchResult.collection || collectionResult?.collection,
          piece: patchResult.piece || collectionResult?.piece,
        };
      }
      if (isCollectionMode() && level === "override" && payload.patch) {
        const pad2 = state.collectionContext.pad2;
        CollectionFs.patchCollection(projectPath, pad2, { invalidateAll: true });
        updateCollectionPreviewFromSession();
      }
      const shouldRebuild =
        payload.rebuild !== false && !isCollectionMode();
      applyIncomingParamValues(payload.paramValues);
      saveDevJson();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          propertyLevels: state.propertyLevels,
          propertiesActiveLevel: state.propertiesActiveLevel,
          merged: getMergedPropertiesWithResult(),
          props: state.props,
          collection: collectionResult?.collection || null,
          piece: collectionResult?.piece || null,
          collectionFixedProperties: state.collectionFixedProperties || {},
          pieceFixedProperties: state.pieceFixedProperties || {},
        }),
      );
      if (shouldRebuild) performBuild();
      else if (collectionResult?.collection) broadcastUpdate();
    });
  } else if (pathname === '/updateProps') {
    let body = '';
    req.on('data', d => body += d);
    req.on("end", () => {
      let d;
      try {
        d = JSON.parse(body);
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Invalid JSON" }));
        return;
      }
      ensurePropertyState();
      const oldCur = JSON.stringify(state.props.current);
      state.props.current = d.current || state.props.current;
      state.props.locks = d.locks || state.props.locks;
      const activeLevel = state.propertiesActiveLevel || "viewer";
      if (
        activeLevel !== "result" &&
        PROPERTY_LEVELS.includes(activeLevel) &&
        d.current
      ) {
        if (!state.propertyLevels[activeLevel]) {
          state.propertyLevels[activeLevel] = {};
        }
        for (const [key, val] of Object.entries(d.current)) {
          const prev = state.propertyLevels[activeLevel][key] || {
            value: "",
            use: false,
          };
          if (d.levelPatch && d.levelPatch[key]) {
            const lp = d.levelPatch[key];
            state.propertyLevels[activeLevel][key] = {
              value: lp.value != null ? String(lp.value) : prev.value,
              use: lp.use != null ? !!lp.use : prev.use,
            };
          } else if (state.props.current[key] !== undefined) {
            state.propertyLevels[activeLevel][key] = {
              value: String(state.props.current[key]),
              use: prev.use,
            };
          }
        }
      }
      applyIncomingParamValues(d.paramValues);
      saveDevJson();
      const changed = JSON.stringify(state.props.current) !== oldCur;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
      if (changed) performBuild();
    });

  } else if (pathname === '/random') {
    if (isCollectionMode()) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Use collection build in collection mode" }));
    } else {
      let body = "";
      req.on("data", (d) => (body += d));
      req.on("end", () => {
        let payload = {};
        try {
          payload = JSON.parse(body || "{}");
        } catch (e) {
          payload = {};
        }
        applyIncomingParamValues(payload.paramValues);
        performBuild(true);
        res.writeHead(200);
        res.end();
      });
    }
  } else if (pathname === "/metadata/settings") {
    if (req.method !== "POST") {
      res.writeHead(405);
      res.end();
      return;
    }
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      let payload = {};
      try {
        payload = JSON.parse(body || "{}");
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
        return;
      }
      saveMetadataUiSettings(payload);
      const shouldRebuild = payload.rebuild !== false;
      if (shouldRebuild) performBuild();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          cardanoMetadataSplit: state.settings.cardanoMetadataSplit !== false,
        }),
      );
    });
  } else if (pathname === "/console/art-log") {
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
      return;
    }
    let body = "";
    req.on("data", (d) => {
      body += d;
    });
    req.on("end", () => {
      let payload = {};
      try {
        payload = JSON.parse(body || "{}");
      } catch (_) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
        return;
      }
      const lines = payload.lines;
      if (Array.isArray(lines) && lines.length) {
        getArtLogAppender().appendMany(lines);
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  } else if (pathname === "/console/logs") {
    if (req.method === "GET") {
      const u = new URL(`http://localhost${req.url}`);
      const tail = Math.min(
        10000,
        Math.max(1, parseInt(u.searchParams.get("tail") || "100", 10) || 100),
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          build: readLogTail(buildLogFilePath(projectPath), tail),
          art: readLogTail(artLogFilePath(projectPath), tail),
        }),
      );
      return;
    }
    if (req.method === "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
      return;
    }
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
  } else if (pathname === "/console/logs/clear") {
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
      return;
    }
    let body = "";
    req.on("data", (d) => {
      body += d;
    });
    req.on("end", () => {
      let payload = {};
      try {
        payload = JSON.parse(body || "{}");
      } catch (_) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
        return;
      }
      const stream = payload.stream || "all";
      if (stream === "build" || stream === "all") getBuildLogAppender().clear();
      if (stream === "art" || stream === "all") getArtLogAppender().clear();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  } else if (pathname === "/viewport/settings") {
    if (req.method !== "POST") {
      res.writeHead(405);
      res.end();
      return;
    }
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      let payload = {};
      try {
        payload = JSON.parse(body || "{}");
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
        return;
      }
      saveViewportUiSettings(payload);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          solid: state.settings.viewportBgSolid !== false,
          solidColor: state.settings.viewportBgSolidColor,
          checkerAltColor: state.settings.viewportBgCheckerAltColor,
        }),
      );
    });
  } else if (pathname === "/captures/folder") {
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
      return;
    }
    try {
      const dir = ensureCapturesDir(projectPath);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, path: dir }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: e.message || "Could not open captures" }));
    }
  } else if (pathname === "/captures/reveal") {
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
      return;
    }
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      let payload = {};
      try {
        payload = JSON.parse(body || "{}");
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
        return;
      }
      const file = resolveCaptureFile(projectPath, payload.name);
      if (!file) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Capture not found" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, path: file, name: path.basename(file) }));
    });
  } else if (pathname === "/captures") {
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
      return;
    }
    const chunks = [];
    let size = 0;
    let tooBig = false;
    req.on("data", (d) => {
      size += d.length;
      if (size > CAPTURE_MAX_BYTES) {
        tooBig = true;
        return;
      }
      chunks.push(d);
    });
    req.on("end", () => {
      if (tooBig) {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Capture is too large" }));
        return;
      }
      const u = new URL(`http://localhost${req.url}`);
      const ext = u.searchParams.get("ext") || captureExtForMime(req.headers["content-type"]);
      const result = writeCapture(projectPath, {
        ext,
        projectName,
        bytes: Buffer.concat(chunks),
      });
      res.writeHead(result.ok ? 200 : result.status || 500, {
        "Content-Type": "application/json",
      });
      res.end(JSON.stringify(result));
    });
  } else if (pathname === '/analyze/settings') {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end();
      return;
    }
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      let payload = {};
      try {
        payload = JSON.parse(body || '{}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
        return;
      }
      saveAnalysisUiSettings(payload);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          samples: state.settings.analysisSamples,
          hideDebug: state.settings.analysisHideDebug,
          hideHxDna: state.settings.analysisHideHxDna,
          expertOpen: !!state.settings.analysisExpertOpen,
        }),
      );
    });

  } else if (pathname === '/analyze') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(state.lastAnalysis ?? null));
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end();
      return;
    }
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      let payload = {};
      try {
        payload = JSON.parse(body || '{}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
        return;
      }
      const samples =
        payload.samples ??
        state.settings?.analysisSamples ??
        ANALYSIS_SAMPLES_DEFAULT;
      performAnalysis(samples)
        .then((result) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        })
        .catch((e) => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              ok: false,
              error: e.message || String(e),
            }),
          );
        });
    });

  } else if (pathname === "/param-driver-ui") {
    if (req.method !== "POST") {
      res.writeHead(405);
      res.end();
      return;
    }
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      let payload;
      try {
        payload = JSON.parse(body || "{}");
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
        return;
      }
      if (payload.paramDriverMode != null) {
        state.paramDriverMode = String(payload.paramDriverMode);
        ensureParamDriverState();
      }
      if (payload.paramDriverHeight != null) {
        state.paramDriverHeight = Math.max(48, Math.min(600, Number(payload.paramDriverHeight) || 280));
      }
      if (payload.paramReadoutHeight != null) {
        state.paramReadoutHeight = Math.max(32, Math.min(300, Number(payload.paramReadoutHeight) || 72));
      }
      if (payload.paramReadoutCollapsed != null) {
        state.paramReadoutCollapsed = !!payload.paramReadoutCollapsed;
      }
      saveDevJson();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          paramDriverMode: state.paramDriverMode,
          paramDrivers: state.paramDrivers || [],
        }),
      );
    });
  } else if (pathname === "/collections" || pathname.startsWith("/collections/")) {
    const parts = pathname.split("/").filter(Boolean);
    const sendJson = (code, obj) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    const readBody = (cb) => {
      let body = "";
      req.on("data", (d) => {
        body += d;
        if (body.length > 600000) req.destroy();
      });
      req.on("end", () => {
        let payload = {};
        try {
          payload = JSON.parse(body || "{}");
        } catch (_) {
          sendJson(400, { ok: false, error: "Invalid JSON" });
          return;
        }
        cb(payload);
      });
    };

    if (pathname === "/collections" && req.method === "GET") {
      sendJson(200, { ok: true, collections: CollectionFs.listCollectionPad2s(projectPath) });
      return;
    }
    if (pathname === "/collections" && req.method === "POST") {
      readBody((payload) => {
        const result = CollectionFs.createCollection(
          projectPath,
          payload.name,
        );
        sendJson(result.ok ? 200 : 400, result);
        if (result.ok) broadcastUpdate();
      });
      return;
    }
    if (pathname === "/collections/session" && req.method === "POST") {
      readBody((payload) => {
        setCollectionSession(payload.pad2 || null, payload.selectedPieceIds);
        let coll = payload.pad2
          ? CollectionFs.readCollection(projectPath, payload.pad2)
          : null;
        if (coll) {
          CollectionFs.enrichCollectionForClient(projectPath, payload.pad2, coll);
        }
        sendJson(200, { ok: true, state, collection: coll });
        broadcastUpdate();
      });
      return;
    }
    if (pathname === "/collections/invalidate-source" && req.method === "POST") {
      invalidateCollectionsOnSourceChange();
      sendJson(200, { ok: true });
      return;
    }

    const pad2 = parts[1];
    if (!pad2 || !/^\d{2}$/.test(pad2)) {
      sendJson(400, { ok: false, error: "Invalid collection pad2" });
      return;
    }

    if (parts.length === 4 && req.method === "GET") {
      const pad4 = parts[2];
      const file = parts[3];
      if (!/^\d{4}$/.test(pad4)) {
        sendJson(400, { ok: false, error: "Invalid piece pad4" });
        return;
      }
      const pieceNum = parseInt(pad4, 10);
      const pieceDir = CollectionFs.pieceDirPath(projectPath, pad2, pieceNum);
      const allowed = {
        "full.html": "text/html",
        "min.html": "text/html",
        "utf8.txt": "text/plain; charset=utf-8",
        "metadata.json": "application/json",
        "values.json": "application/json",
        "properties.json": "application/json",
        "pieceRecord.json": "application/json",
        "errors.json": "application/json",
      };
      let ct = allowed[file];
      if (!ct && isMetadataOutputFilename(file)) {
        ct = "application/json";
      }
      if (!ct) {
        sendJson(404, { ok: false, error: "Unknown file" });
        return;
      }
      const fp = path.join(pieceDir, file);
      const body = loadFile(fp);
      if (body == null) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": ct });
      res.end(body);
      return;
    }

    if (parts.length === 2 && req.method === "GET") {
      const coll = CollectionFs.readCollection(projectPath, pad2);
      if (!coll) {
        sendJson(404, { ok: false, error: "Not found" });
        return;
      }
      CollectionFs.enrichCollectionForClient(projectPath, pad2, coll);
      sendJson(200, { ok: true, collection: coll });
      return;
    }

    if (parts.length === 2 && req.method === "PATCH") {
      readBody((payload) => {
        const result = CollectionFs.patchCollection(projectPath, pad2, payload);
        sendJson(result.ok ? 200 : 400, result);
        if (result.ok) {
          const metaOnly = isAutoMetaOnlyPatch(payload);
          if (state.collectionContext.pad2 === pad2 && !metaOnly) {
            hydrateCollectionEditor(pad2);
          }
          if (!metaOnly) broadcastUpdate();
        }
      });
      return;
    }

    if (parts.length === 2 && req.method === "DELETE") {
      const result = CollectionFs.deleteCollection(projectPath, pad2);
      if (result.ok && state.collectionContext.pad2 === pad2) {
        setCollectionSession(null, []);
      }
      sendJson(result.ok ? 200 : 400, result);
      broadcastUpdate();
      return;
    }

    if (parts[2] === "reveal" && parts.length === 4 && req.method === "POST") {
      const pad4 = parts[3];
      if (!/^\d{4}$/.test(pad4)) {
        sendJson(400, { ok: false, error: "Invalid piece pad4" });
        return;
      }
      const pieceNum = parseInt(pad4, 10);
      const pieceDir = CollectionFs.pieceDirPath(projectPath, pad2, pieceNum);
      fs.mkdirSync(pieceDir, { recursive: true });
      sendJson(200, {
        ok: true,
        path: path.resolve(pieceDir),
        relativePath: path
          .relative(path.resolve(projectPath), pieceDir)
          .replace(/\\/g, "/"),
      });
      return;
    }

    if (parts[2] === "to-viewer" && parts.length === 3 && req.method === "POST") {
      readBody((payload) => {
        const result = transportCollectionPieceToViewer(pad2, payload.pieceId);
        sendJson(result.ok ? 200 : 400, result);
        if (result.ok) {
          broadcastUpdate();
          performBuild();
        }
      });
      return;
    }

    if (parts[2] === "run-script" && parts.length === 3 && req.method === "POST") {
      readBody((payload) => {
        const result = runCollectionScript(
          projectPath,
          pad2,
          payload.scriptName,
        );
        if (!result.ok) {
          sendJson(400, result);
          return;
        }
        const firstId = result.collection.pieceRecords[0]?.id || null;
        setCollectionSession(pad2, firstId ? [firstId] : []);
        CollectionFs.enrichCollectionForClient(
          projectPath,
          pad2,
          result.collection,
        );
        sendJson(200, {
          ok: true,
          collection: result.collection,
          pieceCount: result.pieceCount,
          scriptName: result.scriptName,
          state,
        });
        broadcastUpdate();
      });
      return;
    }

    if (parts[2] === "pieces" && parts.length === 3 && req.method === "POST") {
      readBody((payload) => {
        const coll = CollectionFs.readCollection(projectPath, pad2);
        if (!coll) {
          sendJson(404, { ok: false, error: "Collection not found" });
          return;
        }
        const room = CollectionFs.MAX_PIECES - coll.pieceRecords.length;
        const requested = Math.max(1, parseInt(String(payload.count), 10) || 1);
        if (room < 1) {
          sendJson(400, {
            ok: false,
            error: `Maximum pieces (${CollectionFs.MAX_PIECES}) reached`,
          });
          return;
        }
        if (requested > room) {
          sendJson(400, {
            ok: false,
            error: `Can only add ${room} more piece(s) (max ${CollectionFs.MAX_PIECES} per collection)`,
          });
          return;
        }
        const count = Math.min(requested, room, 500);
        let opts = payload.opts && typeof payload.opts === "object" ? { ...payload.opts } : {};
        if (payload.fromViewer) {
          const captured = CollectionRuntime.captureViewerRecipeForPiece(state);
          if (!Object.keys(captured.fixedProperties || {}).length) {
            sendJson(400, { ok: false, error: "No viewer properties to capture" });
            return;
          }
          opts = { ...captured, ...opts, fixedProperties: { ...captured.fixedProperties, ...(opts.fixedProperties || {}) } };
        }
        const added = [];
        const useRandomSeeds = count > 1 && !payload.fromViewer;
        for (let i = 0; i < count; i++) {
          const pieceOpts = useRandomSeeds
            ? { ...opts, seed: CollectionFs.randomPieceSeed(i) }
            : opts;
          const r = CollectionFs.addPiece(projectPath, pad2, pieceOpts);
          if (!r.ok) {
            sendJson(400, r);
            return;
          }
          added.push(r.piece);
        }
        const collOut = CollectionFs.readCollection(projectPath, pad2);
        if (collOut) CollectionFs.enrichCollectionForClient(projectPath, pad2, collOut);
        sendJson(200, { ok: true, pieces: added, collection: collOut });
        broadcastUpdate();
      });
      return;
    }

    if (parts[2] === "build" && parts[3] === "cancel" && req.method === "POST") {
      if (collectionBuildJob && collectionBuildJob.pad2 === pad2) {
        collectionBuildJob.cancelled = true;
      }
      sendJson(200, { ok: true });
      return;
    }

    if (parts[2] === "build" && parts.length === 3 && req.method === "POST") {
        readBody((payload) => {
        const result = startCollectionBuild(pad2, {
          pieceIds: payload.pieceIds,
          forceAll: !!payload.forceAll,
          reshuffle: !!payload.reshuffle,
        });
        sendJson(result.ok ? 200 : 400, result);
      });
      return;
    }

    if (parts[2] === "freeze" && req.method === "POST") {
      readBody((payload) => {
        const result = CollectionFs.patchCollection(projectPath, pad2, {
          frozen: !!payload.frozen,
          forceUnfreeze: payload.frozen === false,
        });
        sendJson(result.ok ? 200 : 400, result);
        if (result.ok) broadcastUpdate();
      });
      return;
    }

    if (parts[2] === "pieces" && parts.length === 4 && req.method === "PATCH") {
      const pieceId = parts[3];
      readBody((payload) => {
        const result = CollectionFs.patchPiece(projectPath, pad2, pieceId, payload);
        sendJson(result.ok ? 200 : 400, result);
        if (result.ok) {
          if (state.collectionContext.pad2 === pad2) {
            hydrateCollectionEditor(pad2);
          }
          broadcastUpdate();
        }
      });
      return;
    }

    if (parts[2] === "pieces" && parts.length === 4 && req.method === "DELETE") {
      const pieceId = parts[3];
      const result = CollectionFs.deletePieces(projectPath, pad2, [pieceId]);
      if (result.ok && state.collectionContext.pad2 === pad2) {
        state.collectionContext.selectedPieceIds = (
          state.collectionContext.selectedPieceIds || []
        ).filter((id) => id !== pieceId);
        hydrateCollectionEditor(pad2);
      }
      sendJson(result.ok ? 200 : 400, result);
      broadcastUpdate();
      return;
    }

    sendJson(404, { ok: false, error: "Not found" });
  } else if (pathname === '/rebuild') {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end();
      return;
    }
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      let payload = {};
      try {
        payload = JSON.parse(body || '{}');
      } catch (_) {
        payload = {};
      }
      if (isCollectionMode()) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, skipped: 'collection' }));
        return;
      }
      applyIncomingParamValues(payload.paramValues);
      performBuild();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  } else if (pathname === '/updateSeed') {
    let body = '';
    req.on('data', d => body += d);
    req.on("end", () => {
      let d;
      try {
        d = JSON.parse(body || "{}");
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Invalid JSON" }));
        return;
      }
      const newSeed = parseInt(d.seed, 10);
      if (!isNaN(newSeed)) {
        state.seed = Math.max(0, Math.min(9999, newSeed));
        if (isCollectionMode()) {
          const sel = state.collectionContext.selectedPieceIds || [];
          if (sel.length === 1) {
            const pad2 = state.collectionContext.pad2;
            CollectionFs.patchPiece(projectPath, pad2, sel[0], {
              seed: state.seed,
              invalidateBuild: true,
            });
            hydrateCollectionEditor(pad2);
            saveDevJson();
            broadcastUpdate();
          }
        } else {
          saveDevJson();
          performBuild();
        }
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({success:true, seed: state.seed}));
      } else {
        res.writeHead(400);
        res.end();
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

wss = new WebSocketServer({ server });

function broadcastRebuilding() {
  if (!wss) return;
  const payload = JSON.stringify({ type: "rebuilding" });
  wss.clients.forEach((c) => {
    if (c.readyState === 1) c.send(payload);
  });
}

function broadcastUpdate() {
  if (!wss) return;
  wss.clients.forEach(c => { if (c.readyState===1) c.send(JSON.stringify({type:'update', data:state})); });
}

function broadcastParams() {
  if (!wss) return;
  const payload = JSON.stringify({
    type: 'params',
    values: state.paramValues || {},
  });
  wss.clients.forEach((c) => {
    if (c.readyState === 1) c.send(payload);
  });
}

function broadcastAnalysis(msg) {
  if (!wss) return;
  const payload = JSON.stringify(msg);
  wss.clients.forEach((c) => {
    if (c.readyState === 1) c.send(payload);
  });
}

wss.on('connection', ws => ws.send(JSON.stringify({type:'update', data:state})));

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(
      `\x1b[31mPort ${PORT} is already in use.\x1b[0m ` +
        "Stop the other Construct² / node builder.js process, or set ADVBUILDER_PORT to a free port.",
    );
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  const migrationResults = runStartupDriverStoreMigrations(projectPath);
  for (const r of migrationResults) {
    if (r.migrated) {
      console.log(
        `${GREEN}Driver memory migrated (${r.driverId}): ${(r.filesCopied || []).join(", ")}${RESET}`,
      );
    } else if (r.error) {
      console.error(`\x1b[31mDriver memory migration failed (${r.driverId}): ${r.error}\x1b[0m`);
    }
  }
  console.log(`${GREEN}UI: http://localhost:${PORT}${RESET}`);
  if (!process.env.ADVBUILDER_NO_OPEN) {
    import("open").then((o) => o.default(`http://localhost:${PORT}`));
  }
  ensureCollectionSession();
  if (!state.lastBuild && !isCollectionMode()) performBuild();
});

const cleanup = () => {
  clearTimeout(rebuildDebounce);
  rebuildDebounce = null;
  clearTimeout(driverScanDebounce);
  driverScanDebounce = null;
  const finish = () => {
    try {
      if (wss) wss.close();
    } catch (_) {}
    try {
      server.close();
    } catch (_) {}
    process.exit(0);
  };
  if (watcher) {
    const w = watcher;
    watcher = null;
    const watched = state?.importWatchedAbs;
    if (watched instanceof Set) watched.clear();
    Promise.resolve(typeof w.close === "function" ? w.close() : undefined)
      .then(finish)
      .catch(finish);
    return;
  }
  finish();
};
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);