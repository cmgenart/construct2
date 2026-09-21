const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  resolveRuntimeFile,
  normalizeRuntimeId,
  DEFAULT_RUNTIME_ID,
} = require("./project_scaffold.js");

const RUNTIMES_DIR = path.join(__dirname, "runtimes");
const HIDDEN_RUNTIME_IDS = new Set(["cc-v3.22"]);
const PROJECT_CORE_ID = "project-core";

let manifestCache = null;

function hashUtf8(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

function hashFile(filePath) {
  return hashUtf8(fs.readFileSync(filePath, "utf8"));
}

function loadRuntimeManifest() {
  if (manifestCache) return manifestCache;
  const manifestPath = path.join(RUNTIMES_DIR, "manifest.json");
  manifestCache = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return manifestCache;
}

function clearRuntimeManifestCache() {
  manifestCache = null;
}

function runtimeGroup(id) {
  return id.startsWith("legacy/") ? "legacy" : "modern";
}

function buildRuntimeHashMap() {
  const manifest = loadRuntimeManifest();
  const map = new Map();
  for (const entry of manifest.runtimes || []) {
    if (entry.canvasHash) {
      map.set(entry.canvasHash, entry.id);
      continue;
    }
    const file = path.join(RUNTIMES_DIR, entry.file);
    if (fs.existsSync(file)) {
      map.set(hashFile(file), entry.id);
    }
  }
  return map;
}

function readProjectJson(projectPath) {
  const p = path.join(projectPath, "project.json");
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

function readDevJson(projectPath) {
  const p = path.join(projectPath, "dev.json");
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

function writeProjectJson(projectPath, data) {
  fs.writeFileSync(
    path.join(projectPath, "project.json"),
    JSON.stringify(data, null, 2),
    "utf8",
  );
}

function getCorePaths(projectPath) {
  const resolved = path.resolve(projectPath);
  return {
    core: path.join(resolved, "core.html"),
    projectJson: path.join(resolved, "project.json"),
    devJson: path.join(resolved, "dev.json"),
  };
}

function projectHasCoreFile(projectPath) {
  return fs.existsSync(getCorePaths(projectPath).core);
}

function isCustomProjectCore(projectPath) {
  const { core } = getCorePaths(projectPath);
  if (!fs.existsSync(core)) return false;
  const hash = hashFile(core);
  return !buildRuntimeHashMap().has(hash);
}

function inferRuntimeIdFromCoreFile(projectPath) {
  const { core } = getCorePaths(projectPath);
  if (!fs.existsSync(core)) return DEFAULT_RUNTIME_ID;
  const hash = hashFile(core);
  const hashMap = buildRuntimeHashMap();
  if (hashMap.has(hash)) return hashMap.get(hash);
  return PROJECT_CORE_ID;
}

function getStoredRuntimeId(projectPath) {
  const projectMeta = readProjectJson(projectPath);
  if (typeof projectMeta.runtime === "string" && projectMeta.runtime) {
    return normalizeRuntimeId(projectMeta.runtime);
  }
  const dev = readDevJson(projectPath);
  const fromDev = dev.settings?.selectedRuntime?.id;
  if (typeof fromDev === "string" && fromDev) return normalizeRuntimeId(fromDev);
  return inferRuntimeIdFromCoreFile(projectPath);
}

function getManifestEntry(runtimeId) {
  const id = normalizeRuntimeId(runtimeId);
  const manifest = loadRuntimeManifest();
  return (manifest.runtimes || []).find((r) => r.id === id) || null;
}

function resolveEffectiveCoreContent(projectPath, runtimeId) {
  const id = normalizeRuntimeId(runtimeId || getStoredRuntimeId(projectPath));

  if (id === PROJECT_CORE_ID) {
    const { core } = getCorePaths(projectPath);
    if (fs.existsSync(core)) return fs.readFileSync(core, "utf8");
    return "";
  }

  const entry = getManifestEntry(id);
  if (!entry || HIDDEN_RUNTIME_IDS.has(id)) {
    return resolveEffectiveCoreContent(projectPath, DEFAULT_RUNTIME_ID);
  }

  const src = resolveRuntimeFile(id);
  if (fs.existsSync(src)) return fs.readFileSync(src, "utf8");

  const { core } = getCorePaths(projectPath);
  if (fs.existsSync(core)) return fs.readFileSync(core, "utf8");
  return "";
}

function getProjectCoreInfo(projectPath) {
  const { core } = getCorePaths(projectPath);
  let hash = null;
  if (fs.existsSync(core)) hash = hashFile(core);
  return {
    fileName: path.basename(core),
    label: "Project core",
    hash,
    exists: fs.existsSync(core),
    isCustom: isCustomProjectCore(projectPath),
    storedRuntimeId: readProjectJson(projectPath).runtime || null,
  };
}

function listRuntimesForApi() {
  const manifest = loadRuntimeManifest();
  return (manifest.runtimes || [])
    .filter((r) => !HIDDEN_RUNTIME_IDS.has(r.id))
    .map((r) => ({
      id: r.id,
      label: r.label || r.id,
      ccVersion: r.ccVersion || null,
      group: runtimeGroup(r.id),
      needsReview: !!r.needsReview,
    }));
}

function getRuntimesState(projectPath) {
  return {
    currentId: getStoredRuntimeId(projectPath),
    projectCore: getProjectCoreInfo(projectPath),
    runtimes: listRuntimesForApi(),
  };
}

function summarizeSelectedRuntime(projectPath) {
  const state = getRuntimesState(projectPath);
  const id = state.currentId;
  let label = id;
  if (id === PROJECT_CORE_ID) {
    const coreFile = state.projectCore.fileName || "core.html";
    label = state.projectCore.isCustom
      ? `${coreFile} (project, custom)`
      : `${coreFile} (project)`;
  } else {
    const entry = state.runtimes.find((r) => r.id === id);
    label = entry?.label || id;
  }
  return {
    id,
    label,
    isProjectCore: id === PROJECT_CORE_ID,
    isCustomCore: state.projectCore.isCustom,
    hasProjectCore: state.projectCore.exists,
  };
}

function updateDevJsonRuntime(devJsonPath, runtimeId, entry) {
  if (!fs.existsSync(devJsonPath)) return;
  let dev;
  try {
    dev = JSON.parse(fs.readFileSync(devJsonPath, "utf8"));
  } catch {
    return;
  }
  dev.settings = dev.settings || {};
  dev.settings.selectedRuntime = {
    id: runtimeId,
    label:
      entry?.label ||
      (runtimeId === PROJECT_CORE_ID ? "Project core" : runtimeId),
    switchedAt: new Date().toISOString(),
  };
  fs.writeFileSync(devJsonPath, JSON.stringify(dev, null, 2), "utf8");
}

function setProjectRuntime(projectPath, runtimeId) {
  if (!runtimeId || typeof runtimeId !== "string") {
    return { ok: false, error: "runtimeId required" };
  }

  const { devJson } = getCorePaths(projectPath);
  const projectMeta = readProjectJson(projectPath);

  if (runtimeId === PROJECT_CORE_ID) {
    if (!projectHasCoreFile(projectPath)) {
      return {
        ok: false,
        error: "No project core.html",
        code: "NO_PROJECT_CORE",
      };
    }
    const stored = getStoredRuntimeId(projectPath);
    if (stored === PROJECT_CORE_ID) {
      return { ok: true, runtimeId: PROJECT_CORE_ID, skipped: true };
    }
    projectMeta.runtime = PROJECT_CORE_ID;
    writeProjectJson(projectPath, projectMeta);
    updateDevJsonRuntime(devJson, PROJECT_CORE_ID);
    return { ok: true, runtimeId: PROJECT_CORE_ID };
  }

  const canonicalId = normalizeRuntimeId(runtimeId);
  const entry = getManifestEntry(canonicalId);
  if (!entry) {
    return { ok: false, error: `Unknown runtime: ${runtimeId}` };
  }
  if (HIDDEN_RUNTIME_IDS.has(canonicalId)) {
    return { ok: false, error: "Runtime not available", code: "HIDDEN_RUNTIME" };
  }

  const src = resolveRuntimeFile(canonicalId);
  if (!fs.existsSync(src)) {
    return { ok: false, error: `Runtime file missing: ${src}` };
  }

  const stored = getStoredRuntimeId(projectPath);
  if (stored === canonicalId) {
    return { ok: true, runtimeId: canonicalId, skipped: true };
  }

  projectMeta.runtime = canonicalId;
  writeProjectJson(projectPath, projectMeta);
  updateDevJsonRuntime(devJson, canonicalId, entry);

  const warnings = [];
  if (entry.needsReview) {
    warnings.push("This legacy runtime may need manual review");
  }

  return {
    ok: true,
    runtimeId: canonicalId,
    needsReview: !!entry.needsReview,
    warnings,
  };
}

module.exports = {
  RUNTIMES_DIR,
  PROJECT_CORE_ID,
  DEFAULT_RUNTIME_ID,
  HIDDEN_RUNTIME_IDS,
  normalizeRuntimeId,
  hashUtf8,
  hashFile,
  loadRuntimeManifest,
  clearRuntimeManifestCache,
  projectHasCoreFile,
  isCustomProjectCore,
  getStoredRuntimeId,
  resolveEffectiveCoreContent,
  getProjectCoreInfo,
  getRuntimesState,
  summarizeSelectedRuntime,
  setProjectRuntime,
  listRuntimesForApi,
  runtimeGroup,
  resolveRuntimeFile,
};
