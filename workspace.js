const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  listAllProjectsInRoot,
  isPathInsideRoot,
  slugifyProjectName,
  isConstruct2ProjectDir,
  isLegacyProjectDir,
} = require("./project_discovery.js");
const { summarizeLegacyProject } = require("./legacy_import.js");
const { getGenartRoot, getDevDemosRoot } = require("./workspace_layout.js");

const WORKSPACE_FILENAME = "workspace.json";
const MAX_RECENT = 10;
const USER_PROJECTS_ROOT_ID = "user-projects";
const DEMOS_ROOT_ID = "demos";
const DEMOS_LABEL = "Demos/";

/**
 * Default writable folder for packaged installs (and source trees with no sibling art/).
 * @param {string} [homedir]
 */
function getUserProjectsRoot(homedir = os.homedir()) {
  return path.join(homedir, "Documents", "Construct2", "projects");
}

/**
 * @param {string} construct2Dir
 */
function defaultDevRoots(construct2Dir) {
  const repoRoot = getGenartRoot(construct2Dir);
  const art = path.join(repoRoot, "art");
  const legacy = path.join(repoRoot, "art-legacy");
  /** @type {import("./workspace.js").WorkspaceRoot[]} */
  const roots = [];
  if (fs.existsSync(art)) {
    roots.push({
      id: "art",
      path: art,
      label: "art/",
      enabled: true,
      readOnly: false,
    });
  }
  if (fs.existsSync(legacy)) {
    roots.push({
      id: "legacy",
      path: legacy,
      label: "art-legacy/",
      enabled: true,
      readOnly: true,
    });
  }
  return roots;
}

/**
 * Bundled teaching projects. Packaged: `resources/demos` (and nearby fallbacks).
 * Dev: sibling `construct-demos/construct` when it exists.
 * @param {string} construct2Dir
 * @param {{ isPackaged?: boolean, resourcesPath?: string, execPath?: string, demosRoot?: string }} [opts]
 */
function getBundledDemosRoot(construct2Dir, opts = {}) {
  const usable = (p) => {
    if (!p) return null;
    const resolved = path.resolve(p);
    try {
      return fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()
        ? resolved
        : null;
    } catch {
      return null;
    }
  };
  if (opts.demosRoot) return usable(opts.demosRoot);
  if (opts.isPackaged) {
    const execDir = opts.execPath
      ? path.dirname(opts.execPath)
      : process.execPath
        ? path.dirname(process.execPath)
        : null;
    const resources = opts.resourcesPath || process.resourcesPath;
    const candidates = [
      resources && path.join(resources, "demos"),
      resources && path.join(resources, "..", "demos"),
      construct2Dir && path.join(construct2Dir, "..", "demos"),
      execDir && path.join(execDir, "resources", "demos"),
      execDir && path.join(execDir, "demos"),
    ];
    for (const candidate of candidates) {
      const hit = usable(candidate);
      if (hit) return hit;
    }
    return null;
  }
  if (!construct2Dir) return null;
  return usable(getDevDemosRoot(construct2Dir));
}

/**
 * Register (or refresh) the read-only Demos root when the folder exists.
 * New attach is inserted first so examples show above user projects.
 * @param {object} workspace
 * @param {{ demosRoot?: string|null }} [opts]
 */
function ensureDemosRoot(workspace, opts = {}) {
  const dir = opts.demosRoot ? path.resolve(opts.demosRoot) : null;
  if (!dir) return { created: false, updated: false, workspace };
  try {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      return { created: false, updated: false, workspace };
    }
  } catch {
    return { created: false, updated: false, workspace };
  }
  workspace.roots = workspace.roots || [];
  const byId = workspace.roots.find((r) => r.id === DEMOS_ROOT_ID);
  const byPath = workspace.roots.find((r) => path.resolve(r.path) === dir);
  if (byId) {
    const changed =
      path.resolve(byId.path) !== dir ||
      byId.readOnly !== true ||
      byId.enabled !== true ||
      byId.label !== DEMOS_LABEL;
    byId.path = dir;
    byId.label = DEMOS_LABEL;
    byId.readOnly = true;
    byId.enabled = true;
    return { created: false, updated: changed, workspace };
  }
  if (byPath) {
    byPath.id = DEMOS_ROOT_ID;
    byPath.label = DEMOS_LABEL;
    byPath.readOnly = true;
    byPath.enabled = true;
    return { created: false, updated: true, workspace };
  }
  workspace.roots.unshift({
    id: DEMOS_ROOT_ID,
    path: dir,
    label: DEMOS_LABEL,
    enabled: true,
    readOnly: true,
  });
  return { created: true, updated: false, workspace };
}

/**
 * @param {string} userDataDir
 * @param {string} construct2Dir
 */
function workspaceFilePath(userDataDir, construct2Dir) {
  if (userDataDir) return path.join(userDataDir, WORKSPACE_FILENAME);
  return path.join(construct2Dir, WORKSPACE_FILENAME);
}

/**
 * @param {string|null|undefined} userDataDir
 * @param {string} construct2Dir
 */
function loadWorkspace(userDataDir, construct2Dir, opts = {}) {
  const file = workspaceFilePath(userDataDir, construct2Dir);
  const normOpts = { isPackaged: !!opts.isPackaged };
  let workspace;
  try {
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      workspace = normalizeWorkspace(data, construct2Dir, normOpts);
    }
  } catch {
    /* fall through */
  }
  if (!workspace) {
    workspace = normalizeWorkspace(
      {
        version: 1,
        roots: opts.isPackaged ? [] : defaultDevRoots(construct2Dir),
        recentProjects: [],
        lastSelected: null,
        legacyConversions: {},
        pinnedProjects: {},
        expandedRootId: null,
      },
      construct2Dir,
      normOpts,
    );
  }
  const writable = ensureWritableUserRoot(workspace, opts);
  const demos = ensureDemosRoot(workspace, {
    demosRoot: getBundledDemosRoot(construct2Dir, opts),
  });
  if ((writable.created || demos.created || demos.updated) && userDataDir) {
    saveWorkspace(userDataDir, construct2Dir, workspace);
  }
  return workspace;
}

/**
 * If no enabled writable root exists, create Documents/Construct2/projects and register it.
 * @param {object} workspace
 * @param {{ userProjectsRoot?: string }} [opts]
 */
function ensureWritableUserRoot(workspace, opts = {}) {
  const writable = (workspace.roots || []).find((r) => r.enabled && !r.readOnly);
  if (writable) return { created: false, workspace };
  const dir = path.resolve(opts.userProjectsRoot || getUserProjectsRoot());
  fs.mkdirSync(dir, { recursive: true });
  const existing = (workspace.roots || []).find(
    (r) => path.resolve(r.path) === dir,
  );
  if (existing) {
    existing.enabled = true;
    existing.readOnly = false;
    return { created: false, workspace };
  }
  workspace.roots = workspace.roots || [];
  workspace.roots.push({
    id: USER_PROJECTS_ROOT_ID,
    path: dir,
    label: "projects/",
    enabled: true,
    readOnly: false,
  });
  return { created: true, workspace };
}

/**
 * @param {unknown} entry
 */
function normalizePinnedEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const name = String(entry.name || "").trim();
  const p = path.resolve(String(entry.path || ""));
  if (!name || !p) return null;
  return { name, path: p };
}

/**
 * Drop missing paths and projects outside their root.
 * @param {object} workspace
 */
function sanitizePinnedProjects(workspace) {
  const raw = workspace.pinnedProjects;
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const [rootId, list] of Object.entries(raw)) {
    if (!Array.isArray(list)) continue;
    const root = (workspace.roots || []).find((r) => r.id === rootId);
    if (!root || !root.enabled) continue;
    const valid = [];
    for (const entry of list) {
      const norm = normalizePinnedEntry(entry);
      if (!norm || !fs.existsSync(norm.path)) continue;
      if (!isPathInsideRoot(norm.path, root.path)) continue;
      valid.push(norm);
    }
    if (valid.length) out[rootId] = valid;
  }
  return out;
}

/**
 * @param {unknown} raw
 * @param {string} construct2Dir
 */
function normalizeWorkspace(raw, construct2Dir, opts = {}) {
  const ws = raw && typeof raw === "object" ? raw : {};
  let roots = Array.isArray(ws.roots) ? ws.roots : [];
  if (!roots.length && !opts.isPackaged) roots = defaultDevRoots(construct2Dir);
  const normalized = {
    version: 1,
    roots: roots.map((r, i) => {
      const id = String(r.id || `root-${i}`);
      let label = String(r.label || path.basename(String(r.path || "root")));
      if (id === "art") label = "art/";
      else if (id === "legacy") label = "art-legacy/";
      else if (id === DEMOS_ROOT_ID) label = DEMOS_LABEL;
      else if (label === "Active art") label = "art/";
      else if (label === "Legacy archive") label = "art-legacy/";
      else if (label && !label.endsWith("/")) label = label + "/";
      return {
        id,
        path: path.resolve(String(r.path || "")),
        label,
        enabled: r.enabled !== false,
        readOnly: !!r.readOnly,
      };
    }),
    recentProjects: Array.isArray(ws.recentProjects) ? ws.recentProjects : [],
    lastSelected: ws.lastSelected || null,
    legacyConversions:
      ws.legacyConversions && typeof ws.legacyConversions === "object"
        ? ws.legacyConversions
        : {},
    pinnedProjects:
      ws.pinnedProjects && typeof ws.pinnedProjects === "object"
        ? ws.pinnedProjects
        : {},
    expandedRootId:
      typeof ws.expandedRootId === "string" ? ws.expandedRootId : null,
  };
  normalized.pinnedProjects = sanitizePinnedProjects(normalized);
  if (
    normalized.expandedRootId &&
    normalized.expandedRootId !== "__recent__" &&
    !normalized.roots.some((r) => r.id === normalized.expandedRootId)
  ) {
    normalized.expandedRootId = null;
  }
  return normalized;
}

/**
 * @param {string|null|undefined} userDataDir
 * @param {string} construct2Dir
 * @param {object} workspace
 */
function saveWorkspace(userDataDir, construct2Dir, workspace) {
  const file = workspaceFilePath(userDataDir, construct2Dir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(workspace, null, 2), "utf8");
  return file;
}

/**
 * @param {object} workspace
 */
function getDefaultWritableRoot(workspace) {
  return (
    (workspace.roots || []).find((r) => r.enabled && !r.readOnly) ||
    (workspace.roots || []).find((r) => r.enabled) ||
    null
  );
}

/**
 * @param {object} workspace
 * @param {string} legacyPath
 */
function getLegacyConversion(workspace, legacyPath) {
  const key = path.resolve(legacyPath);
  const entry = workspace.legacyConversions?.[key];
  if (!entry || !entry.path) return null;
  return entry;
}

/**
 * @param {object} workspace
 * @param {string} legacyPath
 * @param {string} convertedPath
 */
function setLegacyConversion(workspace, legacyPath, convertedPath) {
  if (!workspace.legacyConversions) workspace.legacyConversions = {};
  workspace.legacyConversions[path.resolve(legacyPath)] = {
    path: path.resolve(convertedPath),
    convertedAt: new Date().toISOString(),
  };
}

/**
 * @param {object} workspace
 */
function listProjectsGrouped(workspace) {
  const writableRoot = getDefaultWritableRoot(workspace);
  const legacyConversions = workspace.legacyConversions || {};
  const roots = [];
  for (const root of workspace.roots || []) {
    if (!root.enabled) continue;
    const projects = listAllProjectsInRoot(root.path, {
      legacyConversions,
      writableRoot: writableRoot?.path || null,
      summarizeLegacy: (dir) => {
        const summary = summarizeLegacyProject(dir);
        const folderDest =
          writableRoot && summary.folderName
            ? path.join(writableRoot.path, summary.folderName)
            : null;
        const convertedPath =
          legacyConversions[path.resolve(dir)]?.path ||
          (folderDest &&
          fs.existsSync(folderDest) &&
          isConstruct2ProjectDir(folderDest, summary.folderName)
            ? folderDest
            : null);
        return {
          ...summary,
          convertedPath,
        };
      },
    });
    roots.push({
      id: root.id,
      label: root.label,
      path: root.path,
      readOnly: !!root.readOnly,
      projects,
    });
  }
  return { roots };
}

/**
 * @param {object} workspace
 * @param {string} projectPath
 */
function findRootForProject(workspace, projectPath) {
  const resolved = path.resolve(projectPath);
  for (const root of workspace.roots || []) {
    if (!root.enabled) continue;
    if (isPathInsideRoot(resolved, root.path)) {
      return root;
    }
  }
  return null;
}

function setLastSelected(workspace, entry) {
  workspace.lastSelected = {
    rootId: entry.rootId || null,
    name: entry.name,
    path: path.resolve(entry.path),
  };
}

/**
 * @param {object} workspace
 * @param {{ name: string, path: string, rootId?: string }} entry
 */
function pushRecentProject(workspace, entry) {
  const recent = (workspace.recentProjects || []).filter(
    (r) => path.resolve(r.path) !== path.resolve(entry.path),
  );
  recent.unshift({
    name: entry.name,
    rootId: entry.rootId || null,
    path: path.resolve(entry.path),
    openedAt: new Date().toISOString(),
  });
  workspace.recentProjects = recent.slice(0, MAX_RECENT);
  setLastSelected(workspace, entry);
}

/**
 * @param {object} workspace
 * @param {string} rootId
 */
function getPinsForRoot(workspace, rootId) {
  return (workspace.pinnedProjects && workspace.pinnedProjects[rootId]) || [];
}

/**
 * @param {object} workspace
 * @param {{ name: string, path: string, rootId?: string }} entry
 */
function pinProject(workspace, entry) {
  const resolved = path.resolve(entry.path);
  const root = entry.rootId
    ? (workspace.roots || []).find((r) => r.id === entry.rootId)
    : findRootForProject(workspace, resolved);
  if (!root || !root.enabled) {
    return { ok: false, error: "Project not in a workspace root" };
  }
  if (!isPathInsideRoot(resolved, root.path)) {
    return { ok: false, error: "Path outside root" };
  }
  if (!fs.existsSync(resolved)) {
    return { ok: false, error: "Path does not exist" };
  }
  if (!workspace.pinnedProjects) workspace.pinnedProjects = {};
  const pins = workspace.pinnedProjects[root.id] || [];
  if (pins.some((p) => path.resolve(p.path) === resolved)) {
    return { ok: true, alreadyPinned: true, rootId: root.id };
  }
  pins.push({
    name: String(entry.name || path.basename(resolved)),
    path: resolved,
  });
  workspace.pinnedProjects[root.id] = pins;
  return { ok: true, rootId: root.id, pins };
}

/**
 * @param {object} workspace
 * @param {{ path: string, rootId?: string }} entry
 */
function unpinProject(workspace, entry) {
  const resolved = path.resolve(entry.path);
  const rootId =
    entry.rootId || findRootForProject(workspace, resolved)?.id || null;
  if (!rootId || !workspace.pinnedProjects?.[rootId]) {
    return { ok: true, alreadyUnpinned: true };
  }
  const before = workspace.pinnedProjects[rootId].length;
  workspace.pinnedProjects[rootId] = workspace.pinnedProjects[rootId].filter(
    (p) => path.resolve(p.path) !== resolved,
  );
  if (!workspace.pinnedProjects[rootId].length) {
    delete workspace.pinnedProjects[rootId];
  }
  return {
    ok: true,
    rootId,
    removed: before !== (workspace.pinnedProjects[rootId] || []).length,
  };
}

/**
 * @param {object} workspace
 * @param {string} folderPath
 * @param {object} [opts]
 */
function addWorkspaceRoot(workspace, folderPath, opts = {}) {
  const resolved = path.resolve(folderPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return { ok: false, error: "Not a directory" };
  }
  const duplicate = (workspace.roots || []).find(
    (r) => path.resolve(r.path) === resolved,
  );
  if (duplicate) {
    return {
      ok: false,
      error: "Root already registered",
      rootId: duplicate.id,
    };
  }
  const folderName = path.basename(resolved);
  const looksLegacy =
    opts.readOnly != null
      ? !!opts.readOnly
      : folderName.toLowerCase().includes("legacy") || /legacy/i.test(resolved);
  const root = {
    id: opts.id || `root-${Date.now()}`,
    path: resolved,
    label:
      opts.label ||
      (looksLegacy ? "art-legacy/" : folderName + "/"),
    enabled: true,
    readOnly: looksLegacy,
  };
  workspace.roots = workspace.roots || [];
  workspace.roots.push(root);
  return { ok: true, root };
}

/**
 * @param {object} workspace
 * @param {string} sourcePath
 * @param {string} rootId
 * @param {object} [opts]
 * @param {"error"|"skip"|"rename"} [opts.onCollision]
 */
function importProjectFolderToRoot(workspace, sourcePath, rootId, opts = {}) {
  const source = path.resolve(sourcePath);
  const root = (workspace.roots || []).find((r) => r.id === rootId && r.enabled);
  if (!root) return { ok: false, error: "Root not found" };
  if (root.readOnly) {
    return { ok: false, error: "Root is read-only", code: "READ_ONLY_ROOT" };
  }
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
    return { ok: false, error: "Source not a directory" };
  }
  const baseName = path.basename(source);
  let kind = null;
  if (isConstruct2ProjectDir(source, baseName)) kind = "construct2";
  else if (isLegacyProjectDir(source, baseName)) kind = "legacy";
  else return { ok: false, error: "Not a project folder" };

  let destName = baseName;
  let dest = path.join(root.path, destName);
  if (fs.existsSync(dest)) {
    const onCollision = opts.onCollision || "error";
    if (onCollision === "skip") {
      return { ok: true, skipped: true, path: dest, name: destName, kind };
    }
    if (onCollision === "rename") {
      let n = 2;
      while (fs.existsSync(path.join(root.path, `${baseName}-${n}`))) n += 1;
      destName = `${baseName}-${n}`;
      dest = path.join(root.path, destName);
    } else {
      return {
        ok: false,
        error: "Destination exists",
        code: "COLLISION",
        path: dest,
      };
    }
  }

  fs.cpSync(source, dest, { recursive: true, force: false });
  return { ok: true, path: dest, name: destName, kind };
}

/**
 * Copy a project into the default writable root (rename on name clash).
 * @param {object} workspace
 * @param {string} sourcePath
 * @param {object} [opts]
 * @param {string} [opts.rootId]
 */
function duplicateProjectToWritableRoot(workspace, sourcePath, opts = {}) {
  const writable =
    getWritableRoot(workspace, opts.rootId) || getDefaultWritableRoot(workspace);
  if (!writable || writable.readOnly) {
    return {
      ok: false,
      error: "No writable root available",
      code: "NO_WRITABLE_ROOT",
    };
  }
  const result = importProjectFolderToRoot(workspace, sourcePath, writable.id, {
    onCollision: "rename",
  });
  if (!result.ok) return result;
  return {
    ...result,
    rootId: writable.id,
    rootLabel: writable.label || writable.id,
  };
}

/**
 * @param {object} workspace
 * @param {string} rootId
 */
function getWritableRoot(workspace, rootId) {
  const root = (workspace.roots || []).find((r) => r.id === rootId);
  if (!root || !root.enabled || root.readOnly) return null;
  return root;
}

module.exports = {
  WORKSPACE_FILENAME,
  MAX_RECENT,
  USER_PROJECTS_ROOT_ID,
  DEMOS_ROOT_ID,
  defaultDevRoots,
  getGenartRoot,
  getUserProjectsRoot,
  getBundledDemosRoot,
  ensureWritableUserRoot,
  ensureDemosRoot,
  workspaceFilePath,
  loadWorkspace,
  saveWorkspace,
  normalizeWorkspace,
  sanitizePinnedProjects,
  getDefaultWritableRoot,
  getLegacyConversion,
  setLegacyConversion,
  listProjectsGrouped,
  findRootForProject,
  pushRecentProject,
  setLastSelected,
  getWritableRoot,
  getPinsForRoot,
  pinProject,
  unpinProject,
  addWorkspaceRoot,
  importProjectFolderToRoot,
  duplicateProjectToWritableRoot,
  slugifyProjectName,
};
