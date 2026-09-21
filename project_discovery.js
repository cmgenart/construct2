const fs = require("fs");
const path = require("path");

const PROJECT_DIR_DENY = new Set([
  "docs",
  "node_modules",
  ".git",
  ".cursor",
]);

/**
 * @param {string} fullPath
 * @param {string} name
 */
function isConstruct2ProjectDir(fullPath, name) {
  if (PROJECT_DIR_DENY.has(name)) return false;
  if (name.startsWith(".")) return false;
  try {
    const has = (f) => fs.existsSync(path.join(fullPath, f));
    return has("setup.js") || has("dev.json");
  } catch {
    return false;
  }
}

function readProjectFlags(full) {
  const has = (f) => fs.existsSync(path.join(full, f));
  let needsReview = false;
  const reportPath = path.join(full, "legacy-import.report.json");
  if (fs.existsSync(reportPath)) {
    try {
      needsReview = !!JSON.parse(fs.readFileSync(reportPath, "utf8")).needsReview;
    } catch {
      /* ignore */
    }
  } else if (has("dev.json")) {
    try {
      const dev = JSON.parse(fs.readFileSync(path.join(full, "dev.json"), "utf8"));
      needsReview = !!dev.settings?.legacyImport?.needsReview;
    } catch {
      /* ignore */
    }
  }
  return {
    devJson: has("dev.json"),
    coreHtml: has("core.html"),
    setupJs: has("setup.js"),
    defsJs: has("defs.js"),
    functionsJs: has("functions.js"),
    drawJs: has("draw.js"),
    needsReview,
  };
}

/**
 * @param {string} fullPath
 * @param {string} name
 */
function findLegacyDataFileInDir(fullPath) {
  try {
    const entries = fs.readdirSync(fullPath);
    const dataFile = entries.find((e) => e.endsWith("_data.json"));
    return dataFile ? path.join(fullPath, dataFile) : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} fullPath
 * @param {string} name
 */
function isLegacyProjectDir(fullPath, name) {
  if (PROJECT_DIR_DENY.has(name)) return false;
  if (name.startsWith(".")) return false;
  if (isConstruct2ProjectDir(fullPath, name)) return false;
  return !!findLegacyDataFileInDir(fullPath);
}

/**
 * @param {string} rootDir
 * @param {object} [opts]
 * @param {Record<string, { path: string }>} [opts.legacyConversions]
 * @param {string} [opts.writableRoot]
 * @param {(dir: string) => object|null} [opts.summarizeLegacy]
 * @returns {{ name: string, path: string, kind: string, flags: object, legacy?: object }[]}
 */
function listAllProjectsInRoot(rootDir, opts = {}) {
  const root = path.resolve(rootDir);
  const legacyConversions = opts.legacyConversions || {};
  const writableRoot = opts.writableRoot ? path.resolve(opts.writableRoot) : null;
  const summarizeLegacy = opts.summarizeLegacy;
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const full = path.join(root, ent.name);
    if (isConstruct2ProjectDir(full, ent.name)) {
      out.push({
        kind: "construct2",
        name: ent.name,
        path: full,
        flags: readProjectFlags(full),
      });
      continue;
    }
    if (!isLegacyProjectDir(full, ent.name)) continue;
    let legacy = null;
    if (summarizeLegacy) {
      try {
        legacy = summarizeLegacy(full);
      } catch {
        legacy = {
          displayName: ent.name,
          typeid: "unknown",
          runtimeLabel: "unknown",
          needsReview: true,
        };
      }
    }
    const convertedPath =
      legacyConversions[path.resolve(full)]?.path ||
      (legacy?.convertedPath ?? null);
    out.push({
      kind: "legacy",
      name: legacy?.displayName || ent.name,
      path: full,
      legacy: legacy
        ? {
            ...legacy,
            convertedPath: convertedPath || legacy.convertedPath || null,
          }
        : { displayName: ent.name, convertedPath },
      flags: {
        legacy: true,
        needsReview: !!(legacy && legacy.needsReview),
      },
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/**
 * @param {string} rootDir
 * @returns {{ name: string, path: string, flags: object }[]}
 */
function listProjectsInRoot(rootDir) {
  return listAllProjectsInRoot(rootDir).filter((p) => p.kind === "construct2");
}

/**
 * @param {string} childPath
 * @param {string} rootPath
 */
function isPathInsideRoot(childPath, rootPath) {
  const rootResolved = path.resolve(rootPath);
  const resolved = path.resolve(childPath);
  const rel = path.relative(rootResolved, resolved);
  return (
    rel === "" ||
    (!rel.startsWith(".." + path.sep) && rel !== ".." && !path.isAbsolute(rel))
  );
}

/**
 * @param {string} name
 */
function slugifyProjectName(name) {
  return (
    String(name)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project"
  );
}

module.exports = {
  PROJECT_DIR_DENY,
  isConstruct2ProjectDir,
  isLegacyProjectDir,
  findLegacyDataFileInDir,
  listAllProjectsInRoot,
  listProjectsInRoot,
  isPathInsideRoot,
  slugifyProjectName,
};
