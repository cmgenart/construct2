/**
 * Parameter driver discovery and readme seeding (dev-only).
 * @see docs/PARAMETER-DRIVERS-DESIGN.md
 */

const fs = require("fs");
const path = require("path");
const {
  resolveDriverStoreFilePath,
  parametersDir,
  isValidDriverStoreBasename,
  runStartupDriverStoreMigrations,
} = require("./driver_store.js");

const DRIVER_ID_RE = /^[a-zA-Z0-9_-]+$/;
const DRIVER_STORE_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DRIVER_STORE_MAX_BYTES = 512 * 1024;
const README_NAME = "DRIVERS_README.txt";
const CONSTRUCT2_ROOT = path.join(__dirname);

function globalParametersDir() {
  return path.join(CONSTRUCT2_ROOT, "parameters");
}

/**
 * @param {string} dir
 * @returns {string[]} sorted driver ids (basename without .html)
 */
function listDriverIdsInDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".html") && DRIVER_ID_RE.test(path.basename(f, ".html")))
    .map((f) => path.basename(f, ".html"))
    .sort();
}

/**
 * @param {string} projectPath
 * @returns {string[]} merged driver ids — global first, then project-only
 */
function scanParamDrivers(projectPath) {
  const globalIds = listDriverIdsInDir(globalParametersDir());
  const projectIds = listDriverIdsInDir(parametersDir(projectPath));
  const merged = [...globalIds];
  for (const id of projectIds) {
    if (!merged.includes(id)) merged.push(id);
  }
  return merged;
}

/**
 * Copy template readme if missing.
 * @param {string} projectPath
 * @param {string} templatePath absolute path to template file
 */
function seedDriversReadme(projectPath, templatePath) {
  const dir = parametersDir(projectPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, README_NAME);
  if (fs.existsSync(dest)) return false;
  const tpl = fs.readFileSync(templatePath, "utf8");
  fs.writeFileSync(dest, tpl);
  return true;
}

/**
 * Merge schema rows with current param values for driver getSchema().
 * @param {object[]} schema
 * @param {object} values
 */
function buildParamSchemaForDriver(schema, values) {
  const vals = values && typeof values === "object" ? values : {};
  return (schema || []).map((p) => {
    const row = { ...p };
    if (Object.prototype.hasOwnProperty.call(vals, p.name)) {
      row.value = vals[p.name];
    } else if ("default" in p) {
      row.value = p.default;
    }
    return row;
  });
}

function isValidDriverId(id) {
  return typeof id === "string" && DRIVER_ID_RE.test(id);
}

function driverHtmlPath(projectPath, id) {
  if (!isValidDriverId(id)) return null;
  const projectFp = path.join(parametersDir(projectPath), `${id}.html`);
  if (fs.existsSync(projectFp)) return projectFp;
  const globalFp = path.join(globalParametersDir(), `${id}.html`);
  if (fs.existsSync(globalFp)) return globalFp;
  return null;
}

function readmePath(projectPath) {
  return path.join(parametersDir(projectPath), README_NAME);
}

/**
 * @param {string} projectPath
 * @param {string} driverId
 * @param {string} basename
 */
function driverStoreFilePath(projectPath, driverId, basename) {
  return resolveDriverStoreFilePath(projectPath, driverId, basename);
}

/**
 * @param {string} projectPath
 * @param {string} driverId
 * @param {string} basename
 */
function readDriverStoreJson(projectPath, driverId, basename) {
  const fp = driverStoreFilePath(projectPath, driverId, basename);
  if (!fp) return { ok: false, error: "Invalid store file" };
  if (!fs.existsSync(fp)) return { ok: true, data: {} };
  try {
    const raw = fs.readFileSync(fp, "utf8");
    const parsed = JSON.parse(raw);
    const data =
      parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

/**
 * Shallow-merge patch into existing JSON file.
 * @param {string} projectPath
 * @param {string} driverId
 * @param {string} basename
 * @param {object} patch
 */
function writeDriverStoreJson(projectPath, driverId, basename, patch) {
  const fp = driverStoreFilePath(projectPath, driverId, basename);
  if (!fp) return { ok: false, error: "Invalid store file" };
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return { ok: false, error: "Invalid patch" };
  }
  let base = {};
  if (fs.existsSync(fp)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(fp, "utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) base = parsed;
    } catch (_) {}
  }
  const merged = { ...base, ...patch };
  const out = JSON.stringify(merged, null, 2) + "\n";
  if (Buffer.byteLength(out, "utf8") > DRIVER_STORE_MAX_BYTES) {
    return { ok: false, error: "Store file too large" };
  }
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, out, "utf8");
  return { ok: true, data: merged };
}

module.exports = {
  DRIVER_ID_RE,
  README_NAME,
  scanParamDrivers,
  seedDriversReadme,
  buildParamSchemaForDriver,
  isValidDriverId,
  driverHtmlPath,
  readmePath,
  parametersDir,
  isValidDriverStoreBasename,
  driverStoreFilePath,
  readDriverStoreJson,
  writeDriverStoreJson,
  runStartupDriverStoreMigrations,
  DRIVER_STORE_SLUG_RE,
};
