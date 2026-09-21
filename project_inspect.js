const fs = require("fs");
const path = require("path");
const {
  isConstruct2ProjectDir,
  isLegacyProjectDir,
  findLegacyDataFileInDir,
} = require("./project_discovery.js");
const { listCollectionPad2s } = require("./collection_fs.js");
const { summarizeLegacyProject, isLegacyProject } = require("./legacy_import.js");
const { summarizeSelectedRuntime } = require("./project_runtime.js");
const { listInspectableSourceFiles } = require("./source_inventory.js");

const OUTPUT_FILES = [
  "output.output.html",
  "output.output_min.html",
  "output.metadata.json",
  "output.metadata_min.json",
];

const DEV_JSON_SETTINGS_MAX = 2 * 1024 * 1024;

/**
 * @param {string} projectPath
 * @param {string} rel
 */
function fileEntry(projectPath, rel) {
  const full = path.join(projectPath, rel);
  try {
    if (!fs.existsSync(full)) {
      return { path: rel, exists: false, bytes: 0 };
    }
    const st = fs.statSync(full);
    return {
      path: rel,
      absPath: full,
      exists: true,
      bytes: st.size,
      mtime: st.mtime.toISOString(),
    };
  } catch {
    return { path: rel, absPath: full, exists: false, bytes: 0 };
  }
}

/**
 * Read dev.json settings without loading huge lastBuild blobs when possible.
 * @param {string} projectPath
 */
function readDevJsonSettings(projectPath) {
  const devPath = path.join(projectPath, "dev.json");
  if (!fs.existsSync(devPath)) return { settings: null, devJsonBytes: 0 };
  const st = fs.statSync(devPath);
  if (st.size > DEV_JSON_SETTINGS_MAX) {
    return { settings: null, devJsonBytes: st.size, devJsonTruncated: true };
  }
  try {
    const dev = JSON.parse(fs.readFileSync(devPath, "utf8"));
    return {
      settings: dev.settings || null,
      devJsonBytes: st.size,
      devJsonTruncated: false,
    };
  } catch {
    return { settings: null, devJsonBytes: st.size, devJsonTruncated: true };
  }
}

/**
 * @param {string} projectPath
 */
function readLegacyReport(projectPath) {
  const reportPath = path.join(projectPath, "legacy-import.report.json");
  if (!fs.existsSync(reportPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(reportPath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * @param {string} projectPath
 */
function resolveOutputHtmlPath(projectPath) {
  const candidates = [
    path.join(projectPath, "output.output.html"),
    path.join(projectPath, "output", "output.html"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  const { settings, devJsonTruncated } = readDevJsonSettings(projectPath);
  if (!devJsonTruncated && settings?.lastBuildPath) {
    const candidate = path.join(projectPath, String(settings.lastBuildPath));
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Aggregate read-only project details for the start-page panel.
 * @param {string} projectPath
 * @param {object} [opts]
 * @param {import("./workspace.js").WorkspaceRoot|null} [opts.root]
 * @param {string|null} [opts.convertedPath]
 */
function inspectProject(projectPath, opts = {}) {
  const resolved = path.resolve(projectPath);
  const folderName = path.basename(resolved);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return { ok: false, error: "Not a project directory" };
  }

  const construct2 = isConstruct2ProjectDir(resolved, folderName);
  const legacy = isLegacyProjectDir(resolved, folderName);
  if (!construct2 && !legacy) {
    return { ok: false, error: "Not a recognized project folder" };
  }

  const kind = legacy && !construct2 ? "legacy" : "construct2";
  let sourceFiles = [];
  if (kind === "construct2") {
    try {
      sourceFiles = listInspectableSourceFiles(resolved);
    } catch {
      sourceFiles = [];
    }
  }
  const dataFile = findLegacyDataFileInDir(resolved);
  if (dataFile) {
    sourceFiles.push(fileEntry(resolved, path.basename(dataFile)));
  }

  const outputs = OUTPUT_FILES.map((rel) => fileEntry(resolved, rel));
  const outputHtmlPath = resolveOutputHtmlPath(resolved);

  let collections = [];
  try {
    const collRoot = path.join(resolved, "collections");
    if (fs.existsSync(collRoot)) {
      collections = listCollectionPad2s(resolved);
    }
  } catch {
    collections = [];
  }

  const report = readLegacyReport(resolved);
  const { settings, devJsonBytes, devJsonTruncated } = readDevJsonSettings(resolved);
  const legacyImport = settings?.legacyImport || null;

  let legacyMeta = null;
  let runtime = null;
  if (kind === "construct2") {
    try {
      runtime = summarizeSelectedRuntime(resolved);
    } catch {
      runtime = null;
    }
  }
  if (kind === "legacy" && isLegacyProject(resolved)) {
    try {
      legacyMeta = summarizeLegacyProject(resolved);
    } catch {
      legacyMeta = { displayName: folderName, typeid: "unknown" };
    }
  } else if (legacyImport) {
    legacyMeta = {
      displayName: legacyImport.displayName || folderName,
      typeid: legacyImport.typeid || "unknown",
      runtimeId: legacyImport.runtimeId || null,
      runtimeLabel: legacyImport.runtimeLabel || null,
      dataFile: legacyImport.dataFile || dataFile,
    };
  }

  const needsReview =
    !!report?.needsReview ||
    !!legacyImport?.needsReview ||
    !!(legacyMeta && legacyMeta.needsReview);

  let legacyDataNewer = false;
  const dataFilePath = dataFile || legacyImport?.dataFile || null;
  if (dataFilePath && fs.existsSync(dataFilePath)) {
    const dataMtime = fs.statSync(dataFilePath).mtime;
    const upgradedAt = legacyImport?.upgradedAt || report?.upgradedAt || null;
    if (upgradedAt) {
      const upgradedMs = Date.parse(upgradedAt);
      if (!Number.isNaN(upgradedMs) && dataMtime.getTime() > upgradedMs) {
        legacyDataNewer = true;
      }
    }
  }

  return {
    ok: true,
    name: legacyMeta?.displayName || folderName,
    path: resolved,
    kind,
    root: opts.root
      ? {
          id: opts.root.id,
          label: opts.root.label,
          readOnly: !!opts.root.readOnly,
        }
      : null,
    flags: {
      needsReview,
      readOnlyRoot: !!opts.root?.readOnly,
      convertedPath: opts.convertedPath || legacyMeta?.convertedPath || null,
      devJson: devJsonBytes > 0 || fs.existsSync(path.join(resolved, "dev.json")),
    },
    sourceFiles,
    outputs,
    outputHtmlPath,
    collections,
    legacy: legacyMeta,
    runtime,
    provenance: {
      report,
      legacyImport,
      dataFile: dataFilePath,
      dataFileMtime:
        (dataFilePath && fs.existsSync(dataFilePath)
          ? fs.statSync(dataFilePath).mtime.toISOString()
          : null) ||
        legacyImport?.dataFileMtime ||
        report?.dataFileMtime ||
        null,
      legacyDataNewer,
      devJsonBytes,
      devJsonTruncated: !!devJsonTruncated,
    },
  };
}

module.exports = {
  OUTPUT_FILES,
  fileEntry,
  readDevJsonSettings,
  resolveOutputHtmlPath,
  inspectProject,
};
