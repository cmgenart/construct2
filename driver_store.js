/**
 * Driver store paths (userData) and migration from legacy `<project>/parameters/`.
 * @see docs/PARAMETER-DRIVERS-DESIGN.md §5.6
 */

const fs = require("fs");
const path = require("path");

const DRIVER_ID_RE = /^[a-zA-Z0-9_-]+$/;
const DRIVER_STORE_JSON_RE = /^[a-zA-Z0-9._-]+\.json$/;
const DRIVER_STORE_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MIGRATION_AUDIT = ".migration.json";

function parametersDir(projectPath) {
  return path.join(path.resolve(projectPath), "parameters");
}

function sanitizeProjectName(name) {
  const s = String(name || "project")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_");
  return s || "project";
}

function getStoreEnv() {
  const userDataRoot = process.env.ADVBUILDER_USER_DATA || "";
  const projectName = process.env.ADVBUILDER_PROJECT_NAME || "";
  if (!userDataRoot || !projectName) return null;
  return {
    userDataRoot: path.resolve(userDataRoot),
    projectName: sanitizeProjectName(projectName),
  };
}

function isValidDriverId(id) {
  return typeof id === "string" && DRIVER_ID_RE.test(id);
}

function isValidDriverStoreBasename(driverId, basename) {
  if (!isValidDriverId(driverId) || typeof basename !== "string") return false;
  if (!DRIVER_STORE_JSON_RE.test(basename)) return false;
  if (basename === `${driverId}.memory.json`) return true;
  const prefix = `${driverId}.`;
  const suffix = ".memory.json";
  if (!basename.startsWith(prefix) || !basename.endsWith(suffix)) return false;
  const slug = basename.slice(prefix.length, basename.length - suffix.length);
  if (!slug || slug.includes(".")) return false;
  return DRIVER_STORE_SLUG_RE.test(slug);
}

function legacyDriverStoreFilePath(projectPath, driverId, basename) {
  if (!isValidDriverStoreBasename(driverId, basename)) return null;
  const dir = path.resolve(parametersDir(projectPath));
  const fp = path.resolve(dir, basename);
  const rel = path.relative(dir, fp);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return fp;
}

function userDataDriverStoreDir(env, driverId) {
  if (!env || !isValidDriverId(driverId)) return null;
  return path.join(env.userDataRoot, "driver-stores", env.projectName, driverId);
}

function resolveDriverStoreFilePath(projectPath, driverId, basename) {
  if (!isValidDriverStoreBasename(driverId, basename)) return null;
  const env = getStoreEnv();
  if (env) {
    const dir = userDataDriverStoreDir(env, driverId);
    const fp = path.resolve(dir, basename);
    const rel = path.relative(dir, fp);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
    return fp;
  }
  return legacyDriverStoreFilePath(projectPath, driverId, basename);
}

function listLegacyMemoryFiles(projectPath, driverId) {
  const dir = parametersDir(projectPath);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => isValidDriverStoreBasename(driverId, name))
    .sort();
}

function readJsonFile(fp) {
  const raw = fs.readFileSync(fp, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid JSON object: ${path.basename(fp)}`);
  }
  return parsed;
}

function writeJsonFile(fp, data) {
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function verifyXaiChatStore(userDataDir, driverId) {
  const indexPath = path.join(userDataDir, `${driverId}.memory.json`);
  if (!fs.existsSync(indexPath)) {
    throw new Error("Index file missing after copy");
  }
  const index = readJsonFile(indexPath);
  const entries = Array.isArray(index.entries) ? index.entries : [];
  for (const row of entries) {
    if (!row || typeof row.slug !== "string" || !row.slug) {
      throw new Error("Invalid index row (missing slug)");
    }
    const payloadName = `${driverId}.${row.slug}.memory.json`;
    const payloadPath = path.join(userDataDir, payloadName);
    if (!fs.existsSync(payloadPath)) {
      writeJsonFile(payloadPath, {
        version: 1,
        slug: row.slug,
        name: row.name || row.slug,
        alignment: row.alignment || "",
        primer: null,
        launchCount: 0,
        condensedHistory: "",
        lastConversation: [],
        records: {},
      });
    }
  }
  for (const name of fs.readdirSync(userDataDir)) {
    if (!isValidDriverStoreBasename(driverId, name) || name === `${driverId}.memory.json`) {
      continue;
    }
    const prefix = `${driverId}.`;
    const suffix = ".memory.json";
    const slug = name.slice(prefix.length, name.length - suffix.length);
    const inIndex = entries.some((r) => r.slug === slug);
    if (!inIndex) {
      console.warn(`[advBuilder] orphan payload after migration: ${name}`);
    }
  }
  return { index, entries };
}

/**
 * Migrate legacy parameters/*.memory.json → userData when index not yet present.
 * @param {string} projectPath
 * @param {string} driverId
 * @returns {{ ok: boolean, migrated?: boolean, filesCopied?: string[], error?: string, message?: string }}
 */
function migrateDriverStoreFromParameters(projectPath, driverId) {
  const env = getStoreEnv();
  if (!env) {
    return { ok: true, migrated: false, message: "userData not configured" };
  }
  if (!isValidDriverId(driverId)) {
    return { ok: false, error: "Invalid driver id" };
  }

  const userDataDir = userDataDriverStoreDir(env, driverId);
  const indexPath = path.join(userDataDir, `${driverId}.memory.json`);
  if (fs.existsSync(indexPath)) {
    return { ok: true, migrated: false, message: "userData index already exists" };
  }

  const legacyFiles = listLegacyMemoryFiles(projectPath, driverId);
  if (!legacyFiles.length) {
    return { ok: true, migrated: false, message: "no legacy memory files" };
  }

  fs.mkdirSync(userDataDir, { recursive: true });
  const backupDir = path.join(
    userDataDir,
    "migration-backup",
    new Date().toISOString().replace(/[:.]/g, "-"),
  );
  fs.mkdirSync(backupDir, { recursive: true });

  const filesCopied = [];
  try {
    for (const name of legacyFiles) {
      const src = legacyDriverStoreFilePath(projectPath, driverId, name);
      if (!src || !fs.existsSync(src)) continue;
      const dest = path.join(userDataDir, name);
      const data = readJsonFile(src);
      writeJsonFile(dest, data);
      fs.copyFileSync(src, path.join(backupDir, name));
      filesCopied.push(name);
    }

    verifyXaiChatStore(userDataDir, driverId);

    const audit = {
      version: 1,
      migratedAt: new Date().toISOString(),
      source: "project-parameters",
      sourceProject: env.projectName,
      sourcePath: path.resolve(parametersDir(projectPath)),
      filesCopied,
      filesRemovedFromProject: [],
    };

    const removed = [];
    for (const name of filesCopied) {
      const src = legacyDriverStoreFilePath(projectPath, driverId, name);
      if (src && fs.existsSync(src)) {
        fs.unlinkSync(src);
        removed.push(name);
      }
    }
    audit.filesRemovedFromProject = removed;

    writeJsonFile(path.join(userDataDir, MIGRATION_AUDIT), audit);

    console.log(
      `[advBuilder] Migrated ${filesCopied.length} driver store file(s) for ${driverId} → userData (${env.projectName})`,
    );
    return { ok: true, migrated: true, filesCopied, removed };
  } catch (e) {
    return { ok: false, error: String(e.message || e), filesCopied };
  }
}

function runStartupDriverStoreMigrations(projectPath) {
  const env = getStoreEnv();
  if (!env) return [];
  const results = [];
  for (const driverId of ["xaiChat"]) {
    results.push({ driverId, ...migrateDriverStoreFromParameters(projectPath, driverId) });
  }
  return results;
}

module.exports = {
  DRIVER_ID_RE,
  DRIVER_STORE_SLUG_RE,
  sanitizeProjectName,
  getStoreEnv,
  isValidDriverStoreBasename,
  legacyDriverStoreFilePath,
  userDataDriverStoreDir,
  resolveDriverStoreFilePath,
  listLegacyMemoryFiles,
  migrateDriverStoreFromParameters,
  runStartupDriverStoreMigrations,
  parametersDir,
};
