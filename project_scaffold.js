const fs = require("fs");
const path = require("path");
const { slugifyProjectName } = require("./project_discovery.js");

const TEMPLATES_DIR = path.join(__dirname, "templates", "projects");
const RUNTIMES_DIR = path.join(__dirname, "runtimes");

/**
 * @returns {object}
 */
function loadTemplateManifest() {
  const file = path.join(TEMPLATES_DIR, "manifest.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  return raw;
}

const DEFAULT_RUNTIME_ID = "cc-v3.23";

/**
 * Older projects stored `cc-v3` for the current v3 core (now 3.23).
 * @param {string} runtimeId
 */
function normalizeRuntimeId(runtimeId) {
  if (!runtimeId || typeof runtimeId !== "string") return runtimeId;
  const manifestPath = path.join(RUNTIMES_DIR, "manifest.json");
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      for (const entry of manifest.runtimes || []) {
        if (entry.id === runtimeId) return entry.id;
        if (Array.isArray(entry.aliases) && entry.aliases.includes(runtimeId)) {
          return entry.id;
        }
      }
    } catch (_) {}
  }
  if (runtimeId === "cc-v3") return DEFAULT_RUNTIME_ID;
  return runtimeId;
}

/**
 * @param {string} runtimeId
 */
function resolveRuntimeFile(runtimeId) {
  const id = normalizeRuntimeId(runtimeId);
  const manifestPath = path.join(RUNTIMES_DIR, "manifest.json");
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const entry = (manifest.runtimes || []).find((r) => r.id === id);
    if (entry && entry.file) {
      return path.join(RUNTIMES_DIR, entry.file);
    }
  }
  if (id === "cc-v3.23") {
    return path.join(RUNTIMES_DIR, "cc-v3.23.html");
  }
  if (id === "cc-v3.22") {
    return path.join(RUNTIMES_DIR, "cc-v3.22.html");
  }
  return path.join(RUNTIMES_DIR, "cc-v3.23.html");
}

/**
 * @param {string} templateId
 * @param {string} targetDir  absolute project directory (created)
 * @param {object} [opts]
 * @param {string} [opts.displayName]
 */
function scaffoldProject(templateId, targetDir, opts = {}) {
  const manifest = loadTemplateManifest();
  const tpl = (manifest.templates || []).find((t) => t.id === templateId);
  if (!tpl) {
    throw new Error(`Unknown template: ${templateId}`);
  }

  const templateDir = path.join(TEMPLATES_DIR, templateId);
  if (!fs.existsSync(templateDir)) {
    throw new Error(`Template folder missing: ${templateDir}`);
  }

  const dest = path.resolve(targetDir);
  if (fs.existsSync(dest)) {
    throw new Error(`Target already exists: ${dest}`);
  }
  fs.mkdirSync(dest, { recursive: true });

  const projectMetaPath = path.join(templateDir, "project.json");
  const projectMeta = fs.existsSync(projectMetaPath)
    ? JSON.parse(fs.readFileSync(projectMetaPath, "utf8"))
    : { runtime: tpl.runtime || DEFAULT_RUNTIME_ID, files: [] };

  const runtimeFile = resolveRuntimeFile(
    projectMeta.runtime || tpl.runtime || DEFAULT_RUNTIME_ID,
  );
  if (!fs.existsSync(runtimeFile)) {
    throw new Error(`Runtime file missing: ${runtimeFile}`);
  }

  const copyNames = new Set(projectMeta.files || []);
  for (const ent of fs.readdirSync(templateDir, { withFileTypes: true })) {
    if (!ent.isFile()) continue;
    if (ent.name === "project.json") continue;
    copyNames.add(ent.name);
  }
  copyNames.delete("core.html");

  for (const name of copyNames) {
    const src = path.join(templateDir, name);
    if (!fs.existsSync(src)) continue;
    fs.copyFileSync(src, path.join(dest, name));
  }

  fs.copyFileSync(runtimeFile, path.join(dest, "core.html"));

  const seed = String(Math.floor(Math.random() * 40000));
  const devJson = {
    seed,
    buildValueLevels: {
      default: {
        name: { value: opts.displayName || path.basename(dest), use: true },
        artist: { value: "", use: true },
        description: { value: "", use: true },
        policy: {
          value: "00000000000000000000000000000000000000000000000000000000",
          use: true,
        },
        num: { value: "0001", use: true },
        collection_name: { value: slugifyProjectName(path.basename(dest)), use: true },
      },
      collection: {},
    },
    propertyLevels: {
      viewer: {},
      collection: {},
      piece: {},
      override: {},
    },
    paramValues: {},
    settings: {
      autoRebuildOnFileChange: true,
    },
  };
  fs.writeFileSync(path.join(dest, "dev.json"), JSON.stringify(devJson, null, 2), "utf8");

  return {
    path: dest,
    name: path.basename(dest),
    templateId,
    runtime: projectMeta.runtime || tpl.runtime,
  };
}

module.exports = {
  TEMPLATES_DIR,
  DEFAULT_RUNTIME_ID,
  loadTemplateManifest,
  normalizeRuntimeId,
  resolveRuntimeFile,
  scaffoldProject,
};
