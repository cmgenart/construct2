/**
 * Single authority for Construct² project source file inventory.
 * Used by startup inspect, builder watch/sync, fingerprint, and _source snapshots.
 */
const fs = require("fs");
const path = require("path");
const {
  getStoredRuntimeId,
  resolveEffectiveCoreContent,
  summarizeSelectedRuntime,
} = require("./project_runtime.js");

/** Canonical art codeblocks (build, fingerprint, _source, param scan). */
const CANONICAL_SOURCE_NAMES = [
  "core.html",
  "setup.js",
  "defs.js",
  "functions.js",
  "draw.js",
  "cert.js",
  "metadata.js",
];

/** Extra files synced/watched by builder; scanned for imports but not fingerprinted as canonical. */
const BUILDER_EXTRA_NAMES = ["collection.js"];

/** All files synced from disk by the builder. */
const BUILDER_SOURCE_NAMES = [...CANONICAL_SOURCE_NAMES, ...BUILDER_EXTRA_NAMES];

function importResolve() {
  return require("./import_resolve.js");
}

/**
 * @param {string} projectPath
 * @returns {Record<string, string>}
 */
function loadCanonicalSourcesFromDisk(projectPath) {
  const resolved = path.resolve(projectPath);
  const files = {};
  for (const name of CANONICAL_SOURCE_NAMES) {
    const full = path.join(resolved, name);
    try {
      files[name] = fs.existsSync(full) ? fs.readFileSync(full, "utf8") : "";
    } catch {
      files[name] = "";
    }
  }
  return files;
}

/**
 * Canonical sources with effective core.html (active runtime selection).
 * @param {string} projectPath
 * @returns {Record<string, string>}
 */
function getEffectiveCanonicalSources(projectPath) {
  const resolved = path.resolve(projectPath);
  const files = loadCanonicalSourcesFromDisk(resolved);
  const runtimeId = getStoredRuntimeId(resolved);
  files["core.html"] = resolveEffectiveCoreContent(resolved, runtimeId);
  return files;
}

/**
 * @param {string} absPath
 */
function statFileEntry(absPath) {
  try {
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
      return { exists: false, bytes: 0, mtime: null };
    }
    const st = fs.statSync(absPath);
    return {
      exists: true,
      bytes: st.size,
      mtime: st.mtime.toISOString(),
    };
  } catch {
    return { exists: false, bytes: 0, mtime: null };
  }
}

/**
 * @param {string} projectPath
 * @param {Record<string, string>} files
 */
function discoverAllSourceEntries(projectPath, files) {
  const resolved = path.resolve(projectPath);
  const { discoverImportGraph, resolveImportPath } = importResolve();
  const graph = discoverImportGraph(resolved, files);
  const entries = [];

  for (const name of CANONICAL_SOURCE_NAMES) {
    const full = path.join(resolved, name);
    const stat =
      name === "core.html" && files[name] != null
        ? {
            exists: true,
            bytes: Buffer.byteLength(files[name], "utf8"),
            mtime: statFileEntry(full).mtime,
          }
        : statFileEntry(full);
    entries.push({
      path: name,
      kind: "canonical",
      absPath: full,
      ...stat,
    });
  }

  for (const name of BUILDER_EXTRA_NAMES) {
    if (files[name] == null && !fs.existsSync(path.join(resolved, name))) continue;
    const full = path.join(resolved, name);
    entries.push({
      path: name,
      kind: "builder",
      absPath: full,
      ...statFileEntry(full),
    });
  }

  const canonicalSet = new Set([
    ...CANONICAL_SOURCE_NAMES,
    ...BUILDER_EXTRA_NAMES,
  ]);
  for (const entry of [...graph.values()].sort((a, b) => a.rel.localeCompare(b.rel))) {
    if (canonicalSet.has(entry.rel)) continue;
    const resolvedImport = resolveImportPath(resolved, entry.rel);
    const abs =
      resolvedImport.ok && resolvedImport.abs
        ? resolvedImport.abs
        : path.join(resolved, entry.rel);
    const kind =
      resolvedImport.ok && resolvedImport.source === "lib" ? "lib" : "import";
    entries.push({
      path: entry.rel,
      kind,
      absPath: abs,
      ...statFileEntry(abs),
    });
  }

  return entries;
}

/**
 * Source file list for the startup project details panel.
 * @param {string} projectPath
 */
function listInspectableSourceFiles(projectPath) {
  const resolved = path.resolve(projectPath);
  const files = getEffectiveCanonicalSources(resolved);
  for (const name of BUILDER_EXTRA_NAMES) {
    const full = path.join(resolved, name);
    try {
      files[name] = fs.existsSync(full) ? fs.readFileSync(full, "utf8") : "";
    } catch {
      files[name] = "";
    }
  }

  const entries = discoverAllSourceEntries(resolved, files);
  let runtime = null;
  try {
    runtime = summarizeSelectedRuntime(resolved);
  } catch {
    runtime = null;
  }

  return entries.map((entry) => {
    if (entry.path !== "core.html" || !runtime || runtime.isProjectCore) {
      return entry;
    }
    return {
      ...entry,
      effective: true,
      runtimeLabel: runtime.label,
    };
  });
}

module.exports = {
  CANONICAL_SOURCE_NAMES,
  BUILDER_EXTRA_NAMES,
  BUILDER_SOURCE_NAMES,
  loadCanonicalSourcesFromDisk,
  getEffectiveCanonicalSources,
  discoverAllSourceEntries,
  listInspectableSourceFiles,
};
