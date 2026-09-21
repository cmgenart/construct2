/**
 * Load project collection.js (CollectionScripts export).
 */
const fs = require("fs");
const path = require("path");

const DEFAULT_COLLECTION_TEMPLATE_PATH = path.join(
  __dirname,
  "templates",
  "collection.js.default",
);

function readDefaultCollectionTemplateFile() {
  try {
    return fs.readFileSync(DEFAULT_COLLECTION_TEMPLATE_PATH, "utf8");
  } catch (_) {
    return null;
  }
}

/**
 * @param {string} projectPath — e.g. ../art/MyCollection
 */
function collectionJsPath(projectPath) {
  return path.resolve(__dirname, projectPath, "collection.js");
}

/**
 * @param {string} projectPath
 */
function collectionJsExists(projectPath) {
  return fs.existsSync(collectionJsPath(projectPath));
}

function defaultCollectionTemplate() {
  return readDefaultCollectionTemplateFile() || "";
}

/**
 * @param {object} mod
 * @returns {Record<string, Function>|null}
 */
function extractCollectionScripts(mod) {
  if (!mod || typeof mod !== "object") return null;
  const raw = mod.CollectionScripts;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out = {};
  for (const [name, fn] of Object.entries(raw)) {
    if (typeof fn === "function") out[name] = fn;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * @param {string} projectPath
 * @returns {Record<string, Function>|null}
 */
function loadCollectionScripts(projectPath) {
  const p = collectionJsPath(projectPath);
  if (!fs.existsSync(p)) return null;
  try {
    const resolved = require.resolve(p);
    delete require.cache[resolved];
    const mod = require(resolved);
    return extractCollectionScripts(mod);
  } catch (e) {
    console.error("[advBuilder] collection.js load error:", e.message || e);
    return null;
  }
}

/**
 * @param {string} projectPath
 * @returns {string[]}
 */
function listCollectionScriptNames(projectPath) {
  const scripts = loadCollectionScripts(projectPath);
  if (!scripts) return [];
  return Object.keys(scripts).sort((a, b) => a.localeCompare(b));
}

/**
 * @param {string} projectPath
 */
function hasCollectionScripts(projectPath) {
  return listCollectionScriptNames(projectPath).length > 0;
}

/**
 * Write default collection.js to project root.
 * @param {string} projectPath
 * @returns {{ ok: boolean, path?: string, error?: string }}
 */
function writeDefaultCollectionJs(projectPath) {
  const p = collectionJsPath(projectPath);
  if (fs.existsSync(p)) {
    return { ok: false, error: "collection.js already exists" };
  }
  try {
    fs.writeFileSync(p, defaultCollectionTemplate(), "utf8");
    return { ok: true, path: p };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

module.exports = {
  collectionJsPath,
  collectionJsExists,
  loadCollectionScripts,
  listCollectionScriptNames,
  hasCollectionScripts,
  writeDefaultCollectionJs,
  defaultCollectionTemplate,
};
