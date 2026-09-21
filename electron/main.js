const {
  app,
  BrowserWindow,
  ipcMain,
  clipboard,
  shell,
  session,
  dialog,
  Menu,
  screen,
} = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");
const { sanitizeProjectName } = require("../driver_store.js");
const { startBuilderHost, stopHandle, resolveBuilderHostKind } = require("./builder_host.js");
const { buildBugReportIssueUrl, bugReportTitle } = require("./github_issue.js");
const {
  loadWorkspace,
  saveWorkspace,
  normalizeWorkspace,
  DEMOS_ROOT_ID,
  listProjectsGrouped,
  pushRecentProject,
  getWritableRoot,
  findRootForProject,
  getDefaultWritableRoot,
  getLegacyConversion,
  setLegacyConversion,
  pinProject,
  unpinProject,
  addWorkspaceRoot,
  importProjectFolderToRoot,
  duplicateProjectToWritableRoot,
  setLastSelected,
} = require("../workspace.js");
const {
  isPathInsideRoot,
  slugifyProjectName,
  findLegacyDataFileInDir,
  isConstruct2ProjectDir,
  isLegacyProjectDir,
} = require("../project_discovery.js");
const { loadTemplateManifest, scaffoldProject } = require("../project_scaffold.js");
const {
  previewLegacyImport,
  importLegacyProject,
  listLegacyCandidates,
  batchImportLegacyProjects,
  resolveLegacyProjectPath,
  isLegacyProject,
  upgradeLegacyProject,
  reconvertLegacyProject,
  ensureLegacyCollectionsImported,
} = require("../legacy_import.js");
const { inspectProject, resolveOutputHtmlPath } = require("../project_inspect.js");
const { getRuntimesState, setProjectRuntime } = require("../project_runtime.js");
const { applyUserDataProfile } = require("./user_data_profile.js");
const { readHelpFile } = require("../help_paths.js");

const userDataProfile = applyUserDataProfile(app);

/** Windows ShellExecute / cmd limits; pool.pm metadata URLs are often 30k+. */
const EXTERNAL_URL_DIRECT_MAX = 2048;

/** Default art root (`art/` on the genart root) — compat / first root. */
function getProjectsRoot() {
  const ws = getWorkspace();
  const first =
    (ws.roots || []).find((r) => r.enabled && !r.readOnly) ||
    (ws.roots || []).find((r) => r.enabled);
  if (first) return first.path;
  return path.resolve(path.join(__dirname, "..", "..", "art"));
}

function workspaceLoadOpts() {
  return {
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    execPath: process.execPath,
  };
}

function getWorkspace() {
  return loadWorkspace(userDataPath(), getConstruct2Dir(), workspaceLoadOpts());
}

function persistWorkspace(workspace) {
  saveWorkspace(userDataPath(), getConstruct2Dir(), workspace);
  return workspace;
}

/** Construct 2 directory (contains `builder.js`). */
function getConstruct2Dir() {
  return path.resolve(path.join(__dirname, ".."));
}

const PROJECT_DIR_DENY = new Set([
  "docs",
  "node_modules",
  ".git",
  ".cursor",
]);

function isArtProjectDir(fullPath, name) {
  if (PROJECT_DIR_DENY.has(name)) return false;
  if (name.startsWith(".")) return false;
  try {
    const has = (f) => fs.existsSync(path.join(fullPath, f));
    return has("setup.js") || has("dev.json");
  } catch {
    return false;
  }
}

function listArtProjects() {
  const ws = getWorkspace();
  const grouped = listProjectsGrouped(ws);
  const legacyRoot = grouped.roots[0]?.path || getProjectsRoot();
  return {
    root: legacyRoot,
    roots: grouped.roots,
    projects: grouped.roots.flatMap((r) => r.projects),
    error: null,
  };
}

function validateProjectPath(projectPath) {
  const ws = getWorkspace();
  const resolved = path.resolve(projectPath);
  if (!fs.existsSync(resolved)) {
    return { ok: false, error: "Path does not exist" };
  }
  const root = findRootForProject(ws, resolved);
  if (!root) {
    return { ok: false, error: "Path outside configured workspace roots" };
  }
  return { ok: true, path: resolved, root };
}

function projectHasLegacyData(projectPath) {
  if (findLegacyDataFileInDir(projectPath)) return true;
  try {
    const devPath = path.join(projectPath, "dev.json");
    if (!fs.existsSync(devPath)) return false;
    const dev = JSON.parse(fs.readFileSync(devPath, "utf8"));
    const li = dev.settings?.legacyImport;
    return !!(li && (li.dataFile || li.typeid));
  } catch {
    return false;
  }
}

/** Main application window (for title updates). */
let mainWindow = null;
let windowStateSaveTimer = null;
/** Last known good bounds from resize/move — avoids bad close-time reads on Windows. */
let cachedWindowState = null;

const DEFAULT_WINDOW_BOUNDS = { width: 1280, height: 820, x: 0, y: 0 };

function windowStatePath() {
  return userDataPath("window-state.json");
}

function loadWindowState() {
  try {
    const raw = fs.readFileSync(windowStatePath(), "utf8");
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

function isValidWindowBounds(bounds) {
  return (
    bounds &&
    Number.isInteger(bounds.x) &&
    Number.isInteger(bounds.y) &&
    Number.isInteger(bounds.width) &&
    bounds.width >= 200 &&
    Number.isInteger(bounds.height) &&
    bounds.height >= 200
  );
}

function boundsVisibleOnSomeDisplay(bounds) {
  if (!isValidWindowBounds(bounds)) return false;
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  return screen.getAllDisplays().some((d) => {
    const b = d.bounds;
    return (
      bounds.x < b.x + b.width &&
      right > b.x &&
      bounds.y < b.y + b.height &&
      bottom > b.y
    );
  });
}

/** Fit window bounds inside a display work area (keeps title bar reachable). */
function clampBoundsToWorkArea(bounds, display) {
  if (!isValidWindowBounds(bounds)) return { ...DEFAULT_WINDOW_BOUNDS };
  const d =
    display ||
    screen.getDisplayMatching(bounds) ||
    screen.getPrimaryDisplay();
  const area = d.workArea || d.bounds;
  let { x, y, width, height } = bounds;

  width = Math.min(Math.max(width, 200), area.width);
  height = Math.min(Math.max(height, 200), area.height);

  if (x + width > area.x + area.width) {
    x = area.x + area.width - width;
  }
  if (y + height > area.y + area.height) {
    y = area.y + area.height - height;
  }
  if (x < area.x) x = area.x;
  if (y < area.y) y = area.y;

  return { x, y, width, height };
}

function isNormalWindow(win) {
  return (
    win &&
    !win.isDestroyed() &&
    !win.isMaximized() &&
    !win.isMinimized() &&
    !win.isFullScreen()
  );
}

function readWindowBounds(win) {
  const bounds = win.getBounds();
  const state = {
    bounds: {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    },
    contentBounds: null,
    displayBounds: null,
  };
  if (process.platform === "win32") {
    try {
      const content = win.getContentBounds();
      state.contentBounds = {
        x: content.x,
        y: content.y,
        width: content.width,
        height: content.height,
      };
    } catch {
      /* ignore */
    }
  }
  try {
    state.displayBounds = screen.getDisplayMatching(bounds).bounds;
  } catch {
    /* ignore */
  }
  return state;
}

function validatedWindowState(raw) {
  if (!raw || typeof raw !== "object") return null;
  const bounds = raw.bounds;
  if (!isValidWindowBounds(bounds)) {
    if (raw.isMaximized || raw.isFullScreen) {
      return {
        bounds: { ...DEFAULT_WINDOW_BOUNDS },
        isMaximized: !!raw.isMaximized,
        isFullScreen: !!raw.isFullScreen,
      };
    }
    return null;
  }
  if (!boundsVisibleOnSomeDisplay(bounds)) {
    return {
      bounds: { ...DEFAULT_WINDOW_BOUNDS },
      isMaximized: false,
      isFullScreen: false,
    };
  }
  const display = screen.getDisplayMatching(bounds);
  const clampedBounds = clampBoundsToWorkArea(bounds, display);
  let contentBounds = raw.contentBounds || null;
  if (contentBounds && isValidWindowBounds(contentBounds)) {
    contentBounds = clampBoundsToWorkArea(contentBounds, display);
  }
  return {
    bounds: clampedBounds,
    contentBounds,
    displayBounds: raw.displayBounds || null,
    isMaximized: !!raw.isMaximized,
    isFullScreen: !!raw.isFullScreen,
  };
}

/**
 * Update in-memory window state. Only refresh x/y/width/height while the window
 * is in normal state (electron-window-state pattern). When maximized, keep the
 * last normal bounds so restore + maximize() returns to the right layout.
 */
function syncWindowState(win) {
  if (!win || win.isDestroyed()) return cachedWindowState;

  const prev = cachedWindowState || validatedWindowState(loadWindowState()) || {
    bounds: { ...DEFAULT_WINDOW_BOUNDS },
  };
  const next = {
    bounds: { ...prev.bounds },
    contentBounds: prev.contentBounds ? { ...prev.contentBounds } : null,
    displayBounds: prev.displayBounds || null,
    isMaximized: win.isMaximized(),
    isFullScreen: win.isFullScreen(),
  };

  if (isNormalWindow(win)) {
    const measured = readWindowBounds(win);
    next.bounds = measured.bounds;
    next.contentBounds = measured.contentBounds;
    next.displayBounds = measured.displayBounds;
  }

  cachedWindowState = next;
  return next;
}

function persistWindowState(state) {
  if (!state?.bounds) return;
  try {
    fs.writeFileSync(windowStatePath(), JSON.stringify(state), "utf8");
  } catch {
    /* ignore */
  }
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  const state = syncWindowState(win);
  persistWindowState(state);
}

function scheduleSaveWindowState() {
  clearTimeout(windowStateSaveTimer);
  windowStateSaveTimer = setTimeout(() => {
    saveWindowState(mainWindow);
  }, 150);
}

function restoreWindowBounds(win, saved) {
  if (!saved?.bounds || !isValidWindowBounds(saved.bounds)) return;

  const display = screen.getDisplayMatching(saved.bounds);
  const bounds = clampBoundsToWorkArea(saved.bounds, display);
  const { contentBounds, isMaximized, isFullScreen } = saved;
  const useContent =
    process.platform === "win32" &&
    contentBounds &&
    isValidWindowBounds(contentBounds) &&
    !isMaximized &&
    !isFullScreen;

  if (useContent) {
    try {
      win.setContentBounds(clampBoundsToWorkArea(contentBounds, display));
      return;
    } catch {
      /* fall through */
    }
  }

  try {
    win.setBounds(bounds);
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} resolved
 * @param {"folder"|"select"|"auto"} [mode]
 */
async function revealInFilesystem(resolved, mode = "auto") {
  if (!fs.existsSync(resolved)) {
    return { ok: false, error: "Path does not exist" };
  }
  const st = fs.statSync(resolved);
  const openFolder = mode === "folder" || (mode === "auto" && st.isDirectory());
  if (openFolder && st.isDirectory()) {
    const err = await shell.openPath(resolved);
    if (err) return { ok: false, error: err };
    return { ok: true };
  }
  shell.showItemInFolder(resolved);
  return { ok: true };
}

function resolveRevealPath(payload) {
  if (payload?.absPath) {
    const resolved = path.resolve(payload.absPath);
    const projectPath = payload?.projectPath
      ? path.resolve(payload.projectPath)
      : null;
    if (projectPath) {
      const c2 = getConstruct2Dir();
      if (
        !isPathInsideRoot(resolved, projectPath) &&
        !isPathInsideRoot(resolved, c2)
      ) {
        return { ok: false, error: "Path outside project" };
      }
    } else {
      const check = validateProjectPath(resolved);
      if (!check.ok) {
        const ws = getWorkspace();
        const root = findRootForProject(ws, resolved);
        if (!root && !isPathInsideRoot(resolved, getConstruct2Dir())) {
          return check;
        }
      }
    }
    return { ok: true, path: resolved };
  }
  const targetPath = payload?.path;
  if (!targetPath) return { ok: false, error: "Path required" };
  const check = validateProjectPath(targetPath);
  if (!check.ok) return check;
  return { ok: true, path: check.path };
}

/**
 * @param {object} payload
 * @param {(result: object) => void} finish
 */
function buildContextMenuTemplate(payload, finish) {
  const kind = payload?.kind;
  const wrap = (id, label, extra = {}) => ({
    label,
    enabled: extra.enabled !== false,
    type: extra.type,
    ...extra,
    click: () => finish({ ok: true, action: id }),
  });

  if (kind === "root") {
    const readOnly = !!payload.readOnly;
    const items = [
      wrap("open-explorer", "Open in Explorer"),
      wrap("convert-all-legacy", "Convert all (legacy)", {
        enabled: !readOnly,
      }),
      wrap("remove-root", "Remove root"),
    ];
    if (readOnly) {
      items.push(wrap("enable-write", "Enable write"));
    }
    return items;
  }

  if (kind === "project") {
    const isLegacy = payload.projectKind === "legacy";
    const projectPath = payload.path;
    const hasLegacyData =
      !!projectPath && projectHasLegacyData(projectPath);
    const readOnlyRoot = !!payload.readOnlyRoot;
    const items = [
      wrap("open-dev", "Open dev UI"),
      wrap("open-explorer", "Open in Explorer"),
      wrap("open-output", "Open in browser"),
    ];
    if (isLegacy || hasLegacyData) {
      items.push(wrap("open-legacy-browser", "Open legacy in browser"));
    }
    if (hasLegacyData) {
      items.push(
        wrap("reconvert-legacy", "Re-convert from legacy", {
          enabled: !readOnlyRoot,
        }),
      );
    }
    if (readOnlyRoot) {
      items.push(wrap("duplicate", "Duplicate to my projects"));
    }
    items.push(
      { type: "separator" },
      payload.pinned
        ? wrap("unpin", "Unpin")
        : wrap("pin", "Pin"),
    );
    return items;
  }

  return [wrap("cancel", "Cancel")];
}

function focusBrowserWindow(win) {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
  if (process.platform === "win32") {
    win.setAlwaysOnTop(true, "screen-saver");
    win.setAlwaysOnTop(false);
  }
  win.webContents.focus();
}

function showContextMenuForSender(sender, payload) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      focusBrowserWindow(BrowserWindow.fromWebContents(sender));
      resolve(result);
    };
    const win = BrowserWindow.fromWebContents(sender);
    const menu = Menu.buildFromTemplate(
      buildContextMenuTemplate(payload, finish),
    );
    menu.popup({
      window: win || undefined,
      callback: () => {
        focusBrowserWindow(win);
        finish({ ok: false, cancelled: true });
      },
    });
  });
}

function resolveLegacyBrowserPath(projectPath) {
  const dataFile = findLegacyDataFileInDir(projectPath);
  if (dataFile) {
    try {
      const raw = JSON.parse(fs.readFileSync(dataFile, "utf8"));
      const html = raw.resolvedcontent || raw.html;
      if (typeof html === "string" && html.trim()) {
        const tmp = path.join(
          os.tmpdir(),
          `adv-legacy-${Date.now()}.html`,
        );
        fs.writeFileSync(tmp, html, "utf8");
        return tmp;
      }
    } catch {
      /* fall through */
    }
  }
  try {
    const entries = fs
      .readdirSync(projectPath)
      .filter((n) => n.endsWith(".html"))
      .map((n) => path.join(projectPath, n))
      .filter((p) => fs.statSync(p).isFile())
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    return entries[0] || null;
  } catch {
    return null;
  }
}

/** Last project chosen in the UI. */
let selectedProject = null;

/** Active builder host handle (spawn or utilityProcess). */
let builderChild = null;
/** Last successful host kind: spawn | utility. */
let lastBuilderHostKind = null;
/** Serialize overlapping dev-ui starts so only the latest project wins. */
let devUiStartChain = Promise.resolve();

const BUILDER_PORT =
  Number.parseInt(process.env.ADVBUILDER_PORT || "3100", 10) || 3100;
const BUILDER_HOST = "127.0.0.1";

let ipcRegistered = false;

function userDataPath(...parts) {
  return path.join(app.getPath("userData"), ...parts);
}

function sanitizeSecretName(name) {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function ensureUserDataDirs() {
  await fs.promises.mkdir(userDataPath("secrets"), { recursive: true });
  await fs.promises.mkdir(userDataPath("driver-stores"), { recursive: true });
  await fs.promises.mkdir(userDataPath(), { recursive: true });
}

async function storeSecretFile(name, value) {
  const file = userDataPath("secrets", `${sanitizeSecretName(name)}.txt`);
  if (value == null || value === "") {
    try {
      await fs.promises.unlink(file);
    } catch (_) {
      /* ignore */
    }
    return;
  }
  await fs.promises.writeFile(file, String(value), "utf8");
}

async function loadSecretFile(name) {
  const file = userDataPath("secrets", `${sanitizeSecretName(name)}.txt`);
  try {
    return await fs.promises.readFile(file, "utf8");
  } catch (_) {
    return null;
  }
}

/**
 * Open http(s) URL in the OS default browser.
 * Long URLs (typical pool.pm metadata links) fail on Windows via shell.openExternal(url).
 */
async function openUrlExternally(url) {
  const needsRedirect =
    url.length > EXTERNAL_URL_DIRECT_MAX ||
    (process.platform === "win32" && url.length > 1024);

  if (!needsRedirect) {
    await shell.openExternal(url);
    return;
  }

  const tmpPath = path.join(
    os.tmpdir(),
    `advbuilder-open-${Date.now()}.html`,
  );
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Open link</title><script>location.replace(${JSON.stringify(url)});</script></head><body></body></html>`;
  fs.writeFileSync(tmpPath, html, "utf8");
  try {
    await shell.openExternal(pathToFileURL(tmpPath).href);
  } finally {
    setTimeout(() => {
      try {
        fs.unlinkSync(tmpPath);
      } catch (_) {}
    }, 120000);
  }
}

function stopBuilderServer() {
  const ch = builderChild;
  builderChild = null;
  return stopHandle(ch);
}

async function startDevUiForProject(projectPathOrName) {
  const run = devUiStartChain.then(() => startDevUiForProjectInner(projectPathOrName));
  devUiStartChain = run.catch(() => {});
  return run;
}

async function startDevUiForProjectInner(projectPathOrName) {
  const advRoot = getConstruct2Dir();
  await stopBuilderServer();
  await ensureUserDataDirs();

  let projectPath;
  if (path.isAbsolute(projectPathOrName) || projectPathOrName.includes(path.sep)) {
    const check = validateProjectPath(projectPathOrName);
    if (!check.ok) return check;
    projectPath = check.path;
  } else {
    const ws = getWorkspace();
    const root = (ws.roots || []).find((r) => r.enabled && !r.readOnly) || ws.roots[0];
    if (!root) return { ok: false, error: "No workspace root configured" };
    projectPath = path.join(root.path, projectPathOrName);
    const check = validateProjectPath(projectPath);
    if (!check.ok) return check;
    projectPath = check.path;
  }

  const ws = getWorkspace();
  const resolved = resolveLegacyProjectPath(projectPath, ws, {
    getDefaultWritableRoot,
    getLegacyConversion,
    setLegacyConversion,
    findRootForProject,
  });
  if (!resolved.ok) return resolved;
  if (resolved.converted || resolved.fromExisting) {
    persistWorkspace(ws);
  }
  projectPath = resolved.path;

  const started = await startBuilderHost({
    isPackaged: app.isPackaged,
    advRoot,
    projectPath,
    port: BUILDER_PORT,
    host: BUILDER_HOST,
    timeoutMs: 25000,
    execPath: process.execPath,
    envFields: {
      port: BUILDER_PORT,
      userData: userDataPath(),
      projectPath,
      projectName: sanitizeProjectName(path.basename(projectPath)),
      xaiKeyPath: userDataPath("secrets", "xai-api-key.txt"),
    },
  });
  if (!started.ok) {
    builderChild = null;
    lastBuilderHostKind = started.kind || null;
    return started;
  }

  builderChild = started.handle;
  lastBuilderHostKind = started.kind;
  started.handle.once("exit", () => {
    if (builderChild === started.handle) builderChild = null;
  });
  if (started.fallbackFrom) {
    console.warn(
      `[advBuilder] ${started.fallbackFrom} host failed; using ${started.kind}`,
    );
  }

  const url = `http://${BUILDER_HOST}:${BUILDER_PORT}/?embed=1`;
  return {
    ok: true,
    url,
    projectPath,
    builderHost: started.kind,
    legacy: !!resolved.legacy,
    converted: !!resolved.converted,
    needsReview: !!resolved.needsReview,
    warnings: resolved.warnings || [],
  };
}

function readAppVersion() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(getConstruct2Dir(), "package.json"), "utf8"),
    );
    return String(pkg.version || "0.0.0");
  } catch {
    return "0.0.0";
  }
}

function getAppInfo() {
  return {
    version: readAppVersion(),
    platform: process.platform,
    arch: process.arch,
    osType: os.type(),
    osRelease: os.release(),
    electronVersion: process.versions.electron || null,
    isPackaged: app.isPackaged,
    userDataProfile: userDataProfile.profile,
    userData: userDataProfile.userData,
    builderHost: lastBuilderHostKind || resolveBuilderHostKind({ isPackaged: app.isPackaged }),
  };
}

function getAppIconPath() {
  const ico = path.join(getConstruct2Dir(), "electron", "icons", "icon.ico");
  if (fs.existsSync(ico)) return ico;
  const docsIco = path.join(getConstruct2Dir(), "docs", "icons", "icon.ico");
  if (fs.existsSync(docsIco)) return docsIco;
  return undefined;
}

function showAboutFromMenu() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("adv:show-about");
  mainWindow.focus();
}

function showHelpFromMenu(rel) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("adv:show-help", rel || "docs/user/README.md");
  mainWindow.focus();
}

function showBugReportFromMenu() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("adv:show-bug-report");
  mainWindow.focus();
}

function installApplicationMenu() {
  const template = [
    {
      label: "File",
      submenu: [{ role: "quit" }],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    {
      label: "Help",
      submenu: [
        { label: "Getting Started", click: () => showHelpFromMenu("docs/user/GETTING-STARTED.md") },
        { label: "User guide", click: () => showHelpFromMenu("docs/user/README.md") },
        { label: "Canvas Core", click: () => showHelpFromMenu("runtimes/cc-v3.23.getting-started.md") },
        { label: "AsciiCore", click: () => showHelpFromMenu("lib/AsciiCore.getting-started.md") },
        { label: "Technical", click: () => showHelpFromMenu("docs/README.md") },
        { type: "separator" },
        { label: "Report a bug…", click: () => showBugReportFromMenu() },
        { label: "About Construct²", click: () => showAboutFromMenu() },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function tailText(filePath, maxLines) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const lines = raw.split(/\r?\n/);
    return lines.slice(-maxLines).join("\n");
  } catch {
    return null;
  }
}

function readErrorsSnippet(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    if (raw.length <= 4096) return raw;
    return `${raw.slice(0, 4096)}\n… (truncated, ${raw.length} bytes)`;
  } catch {
    return null;
  }
}

function getBugReportContext() {
  const project = selectedProject
    ? { name: selectedProject.name, path: selectedProject.path }
    : null;
  if (!project?.path) {
    return { project: null, logs: null };
  }
  return {
    project,
    logs: {
      build: tailText(path.join(project.path, "output.build.log"), 40),
      art: tailText(path.join(project.path, "output.art.log"), 40),
      errors: readErrorsSnippet(path.join(project.path, "output.errors.json")),
    },
  };
}

function assembleBugReportBody(description, info, ctx) {
  const lines = [
    "## Description",
    String(description || "").trim() || "(none)",
    "",
    "## Version",
    info.version,
    "",
    "## Environment",
    `- Packaged: ${info.isPackaged ? "yes" : "no"}`,
    `- Profile: ${info.userDataProfile || "?"}`,
    `- Builder host: ${info.builderHost}`,
    `- OS: ${info.osType} ${info.osRelease} (${info.platform} ${info.arch})`,
    `- Electron: ${info.electronVersion || "?"}`,
    "",
  ];
  if (ctx.project) {
    lines.push("## Project", ctx.project.name, "");
  } else {
    lines.push("## Project", "No project open", "");
  }
  if (ctx.logs) {
    lines.push("## Logs");
    if (ctx.logs.build) {
      lines.push("### output.build.log", "```", ctx.logs.build, "```", "");
    }
    if (ctx.logs.art) {
      lines.push("### output.art.log", "```", ctx.logs.art, "```", "");
    }
    if (ctx.logs.errors) {
      lines.push("### output.errors.json", "```json", ctx.logs.errors, "```", "");
    }
  }
  return lines.join("\n");
}

function registerIpc() {
  if (ipcRegistered) return;
  ipcRegistered = true;

  ipcMain.handle("adv:get-workspace", () => getWorkspace());

  ipcMain.handle("adv:patch-workspace", (_evt, patch) => {
    if (!patch || typeof patch !== "object") {
      return { ok: false, error: "Invalid patch" };
    }
    const ws = getWorkspace();
    if (Array.isArray(patch.roots)) ws.roots = patch.roots;
    if (Array.isArray(patch.recentProjects)) ws.recentProjects = patch.recentProjects;
    if (patch.lastSelected != null) ws.lastSelected = patch.lastSelected;
    if (patch.pinnedProjects != null) ws.pinnedProjects = patch.pinnedProjects;
    if (patch.expandedRootId !== undefined) {
      ws.expandedRootId = patch.expandedRootId;
    }
    const normalized = normalizeWorkspace(ws, getConstruct2Dir(), workspaceLoadOpts());
    persistWorkspace(normalized);
    return { ok: true, workspace: normalized };
  });

  ipcMain.handle("adv:pick-folder", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths.length) {
      return { ok: false, cancelled: true };
    }
    return { ok: true, path: result.filePaths[0] };
  });

  ipcMain.handle("adv:list-templates", () => {
    try {
      return { ok: true, manifest: loadTemplateManifest() };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle("adv:create-project", (_evt, payload) => {
    try {
      const templateId = payload?.templateId || "cc-v3-minimal";
      const rootId = payload?.rootId;
      const displayName = payload?.name;
      if (!displayName || typeof displayName !== "string") {
        return { ok: false, error: "Project name required" };
      }
      const ws = getWorkspace();
      const root = getWritableRoot(ws, rootId) || (ws.roots || []).find((r) => r.enabled && !r.readOnly);
      if (!root) return { ok: false, error: "No writable root selected" };
      const slug = slugifyProjectName(displayName);
      const targetDir = path.join(root.path, slug);
      const created = scaffoldProject(templateId, targetDir, { displayName });
      return { ok: true, project: created };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle("adv:preview-legacy-import", (_evt, payload) => {
    try {
      const legacyPath = payload?.path;
      if (!legacyPath) return { ok: false, error: "Legacy path required" };
      const report = previewLegacyImport(legacyPath, {
        projectName: payload?.name,
      });
      return { ok: true, report };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle("adv:import-legacy-project", (_evt, payload) => {
    try {
      const legacyPath = payload?.path;
      const rootId = payload?.rootId;
      const name = payload?.name;
      if (!legacyPath) return { ok: false, error: "Legacy path required" };
      const ws = getWorkspace();
      const root = getWritableRoot(ws, rootId) || (ws.roots || []).find((r) => r.enabled && !r.readOnly);
      if (!root) return { ok: false, error: "No writable root selected" };
      const report = importLegacyProject(legacyPath, root.path, { projectName: name });
      return { ok: true, report };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle("adv:list-legacy-candidates", (_evt, payload) => {
    try {
      const legacyRoot = payload?.legacyRoot;
      if (!legacyRoot) return { ok: false, error: "Legacy root required" };
      const ws = getWorkspace();
      let targetRoot = null;
      if (payload?.rootId) {
        const root = getWritableRoot(ws, payload.rootId);
        if (root) targetRoot = root.path;
      }
      const candidates = listLegacyCandidates(legacyRoot, { targetRoot });
      return { ok: true, candidates };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle("adv:batch-import-legacy", (_evt, payload) => {
    try {
      const legacyRoot = payload?.legacyRoot;
      const rootId = payload?.rootId;
      const paths = payload?.paths;
      if (!legacyRoot) return { ok: false, error: "Legacy root required" };
      const ws = getWorkspace();
      const root = getWritableRoot(ws, rootId) || (ws.roots || []).find((r) => r.enabled && !r.readOnly);
      if (!root) return { ok: false, error: "No writable root selected" };
      const report = batchImportLegacyProjects(legacyRoot, root.path, {
        paths: Array.isArray(paths) ? paths : undefined,
        skipExisting: payload?.skipExisting !== false,
        stopOnError: !!payload?.stopOnError,
      });
      return { ok: true, report };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle("adv:get-projects-root", () => getProjectsRoot());

  ipcMain.handle("adv:list-projects", () => listArtProjects());

  ipcMain.handle("adv:get-selected-project", () => selectedProject);

  ipcMain.handle("adv:set-selected-project", (_evt, payload) => {
    if (
      payload &&
      typeof payload.name === "string" &&
      typeof payload.path === "string"
    ) {
      const check = validateProjectPath(payload.path);
      if (!check.ok) return check;
      selectedProject = {
        name: payload.name,
        path: check.path,
        rootId: payload.rootId || null,
        kind: payload.kind,
        flags: payload.flags,
        legacy: payload.legacy,
      };
      const ws = getWorkspace();
      setLastSelected(ws, {
        name: payload.name,
        path: check.path,
        rootId: payload.rootId || null,
      });
      persistWorkspace(ws);
      return { ok: true, project: selectedProject };
    }
    return { ok: false, error: "Invalid payload" };
  });

  ipcMain.handle("adv:convert-legacy-project", (_evt, payload) => {
    try {
      const legacyPath = payload?.path;
      if (!legacyPath) return { ok: false, error: "Legacy path required" };
      const check = validateProjectPath(legacyPath);
      if (!check.ok) return check;
      if (!isLegacyProject(check.path)) {
        return { ok: false, error: "Not a legacy project folder" };
      }
      const ws = getWorkspace();
      const resolved = resolveLegacyProjectPath(check.path, ws, {
        getDefaultWritableRoot,
        getLegacyConversion,
        setLegacyConversion,
        findRootForProject,
      });
      if (!resolved.ok) return resolved;
      persistWorkspace(ws);
      return resolved;
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle("adv:start-dev-ui", async (_evt, payload) => {
    const projectPath =
      (payload && payload.projectPath) ||
      (selectedProject && selectedProject.path);
    const name =
      (payload && payload.projectName) || (selectedProject && selectedProject.name);
    if (projectPath && typeof projectPath === "string") {
      const result = await startDevUiForProject(projectPath);
      if (result.ok) {
        const ws = getWorkspace();
        const openedPath = result.projectPath || projectPath;
        const openedName =
          selectedProject?.name || path.basename(openedPath);
        selectedProject = {
          name: openedName,
          path: openedPath,
          rootId: findRootForProject(ws, openedPath)?.id || selectedProject?.rootId || null,
        };
        pushRecentProject(ws, {
          name: openedName,
          path: openedPath,
          rootId: selectedProject.rootId,
        });
        persistWorkspace(ws);
        setDevWindowTitle(openedPath);
      }
      return result;
    }
    if (!name || typeof name !== "string") {
      return { ok: false, error: "No project selected" };
    }
    return startDevUiForProject(name);
  });

  ipcMain.handle("adv:get-dev-server-origin", () => {
    return `http://${BUILDER_HOST}:${BUILDER_PORT}`;
  });

  ipcMain.handle("adv:stop-dev-ui", async () => {
    await stopBuilderServer();
    setDevWindowTitle(null);
    return { ok: true };
  });

  ipcMain.handle("adv:set-window-title", (_evt, payload) => {
    const title = payload?.title;
    if (typeof title === "string" && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setTitle(title);
      return { ok: true };
    }
    return { ok: false };
  });

  ipcMain.handle("adv:focus-window", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      focusBrowserWindow(mainWindow);
      return { ok: true };
    }
    return { ok: false };
  });

  ipcMain.handle("adv:clipboard-read", () => clipboard.readText());

  ipcMain.handle("adv:clipboard-write", (_evt, text) => {
    if (typeof text !== "string") {
      return { ok: false, error: "Invalid clipboard text" };
    }
    clipboard.writeText(text);
    return { ok: true };
  });

  ipcMain.handle("adv:open-external", async (_evt, url) => {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
      return { ok: false, error: "Invalid URL" };
    }
    try {
      await openUrlExternally(url);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle("adv:get-app-info", () => getAppInfo());

  ipcMain.handle("adv:read-help-doc", (_evt, rel) => {
    const found = readHelpFile(getConstruct2Dir(), rel);
    if (!found) return { ok: false, error: "Not found" };
    return { ok: true, rel: found.rel, text: found.text, ext: found.ext };
  });

  ipcMain.handle("adv:get-bug-report-context", () => getBugReportContext());

  ipcMain.handle("adv:open-bug-report", async (_evt, payload) => {
    const description = String(payload?.description || "").trim();
    if (!description) return { ok: false, error: "Description required" };
    const info = getAppInfo();
    const ctx = getBugReportContext();
    const title = bugReportTitle(description);
    const body = assembleBugReportBody(description, info, ctx);
    const url = buildBugReportIssueUrl({ title, body });
    try {
      await openUrlExternally(url);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle("adv:get-project-details", (_evt, payload) => {
    try {
      const projectPath = payload?.path;
      if (!projectPath) return { ok: false, error: "Project path required" };
      const check = validateProjectPath(projectPath);
      if (!check.ok) return check;
      const ws = getWorkspace();
      const grouped = listProjectsGrouped(ws);
      let convertedPath = null;
      for (const root of grouped.roots) {
        const match = root.projects.find(
          (p) => path.resolve(p.path) === check.path,
        );
        if (match) {
          convertedPath =
            match.legacy?.convertedPath || match.flags?.convertedPath || null;
          break;
        }
      }
      const details = inspectProject(check.path, {
        root: check.root,
        convertedPath,
      });
      return details;
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle("adv:list-runtimes", (_evt, payload) => {
    try {
      const projectPath = payload?.path;
      if (!projectPath) return { ok: false, error: "Project path required" };
      const check = validateProjectPath(projectPath);
      if (!check.ok) return check;
      return { ok: true, ...getRuntimesState(check.path) };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle("adv:set-project-runtime", (_evt, payload) => {
    try {
      const projectPath = payload?.path;
      const runtimeId = payload?.runtimeId;
      if (!projectPath || !runtimeId) {
        return { ok: false, error: "path and runtimeId required" };
      }
      const check = validateProjectPath(projectPath);
      if (!check.ok) return check;
      return setProjectRuntime(check.path, runtimeId);
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle("adv:reveal-in-explorer", async (_evt, payload) => {
    try {
      const check = resolveRevealPath(payload || {});
      if (!check.ok) return check;
      const mode = payload?.mode || (payload?.absPath ? "select" : "folder");
      return await revealInFilesystem(check.path, mode);
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle("adv:open-project-output", async (_evt, payload) => {
    try {
      const projectPath = payload?.path;
      if (!projectPath) return { ok: false, error: "Project path required" };
      const check = validateProjectPath(projectPath);
      if (!check.ok) return check;
      const outputPath = resolveOutputHtmlPath(check.path);
      if (!outputPath) {
        return { ok: false, error: "No build output found" };
      }
      await shell.openExternal(pathToFileURL(outputPath).href);
      return { ok: true, path: outputPath };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle("adv:open-legacy-browser", async (_evt, payload) => {
    try {
      const projectPath = payload?.path;
      if (!projectPath) return { ok: false, error: "Project path required" };
      const check = validateProjectPath(projectPath);
      if (!check.ok) return check;
      const legacyPath = resolveLegacyBrowserPath(check.path);
      if (!legacyPath) {
        return { ok: false, error: "No legacy HTML found" };
      }
      const err = await shell.openPath(legacyPath);
      if (err) return { ok: false, error: err };
      return { ok: true, path: legacyPath };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle("adv:pin-project", (_evt, payload) => {
    try {
      const projectPath = payload?.path;
      const name = payload?.name;
      if (!projectPath) return { ok: false, error: "Project path required" };
      const check = validateProjectPath(projectPath);
      if (!check.ok) return check;
      const ws = getWorkspace();
      const result = pinProject(ws, {
        name: name || path.basename(check.path),
        path: check.path,
        rootId: payload?.rootId || check.root.id,
      });
      if (!result.ok) return result;
      persistWorkspace(ws);
      return { ok: true, ...result, workspace: ws };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle("adv:unpin-project", (_evt, payload) => {
    try {
      const projectPath = payload?.path;
      if (!projectPath) return { ok: false, error: "Project path required" };
      const check = validateProjectPath(projectPath);
      if (!check.ok) return check;
      const ws = getWorkspace();
      const result = unpinProject(ws, {
        path: check.path,
        rootId: payload?.rootId || check.root.id,
      });
      persistWorkspace(ws);
      return { ok: true, ...result, workspace: ws };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle("adv:show-context-menu", async (evt, payload) => {
    try {
      return await showContextMenuForSender(evt.sender, payload || {});
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle("adv:add-workspace-root", (_evt, payload) => {
    try {
      const folderPath = payload?.path;
      if (!folderPath) return { ok: false, error: "Folder path required" };
      const ws = getWorkspace();
      const result = addWorkspaceRoot(ws, folderPath, {
        id: payload?.id,
        label: payload?.label,
        readOnly: payload?.readOnly,
      });
      if (!result.ok) return result;
      if (payload?.setExpanded) ws.expandedRootId = result.root.id;
      const normalized = normalizeWorkspace(ws, getConstruct2Dir(), workspaceLoadOpts());
      persistWorkspace(normalized);
      return { ok: true, root: result.root, workspace: normalized };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle("adv:import-project-folder", (_evt, payload) => {
    try {
      const sourcePath = payload?.sourcePath || payload?.path;
      const rootId = payload?.rootId;
      if (!sourcePath) return { ok: false, error: "Source path required" };
      if (!rootId) return { ok: false, error: "Target root required" };
      const ws = getWorkspace();
      const result = importProjectFolderToRoot(ws, sourcePath, rootId, {
        onCollision: payload?.onCollision,
      });
      return result;
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle("adv:duplicate-project", (_evt, payload) => {
    try {
      const sourcePath = payload?.sourcePath || payload?.path;
      if (!sourcePath) return { ok: false, error: "Source path required" };
      const ws = getWorkspace();
      return duplicateProjectToWritableRoot(ws, sourcePath, {
        rootId: payload?.rootId,
      });
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle("adv:probe-drop-folder", (_evt, payload) => {
    try {
      const folderPath = payload?.path;
      if (!folderPath) return { ok: false, error: "Path required" };
      const resolved = path.resolve(folderPath);
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        return { ok: false, valid: false, error: "Not a directory" };
      }
      const name = path.basename(resolved);
      const isProject =
        isConstruct2ProjectDir(resolved, name) ||
        isLegacyProjectDir(resolved, name);
      return { ok: true, valid: isProject, path: resolved, name };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle("adv:remove-workspace-root", (_evt, payload) => {
    try {
      const rootId = payload?.rootId;
      if (!rootId) return { ok: false, error: "Root id required" };
      if (rootId === DEMOS_ROOT_ID) {
        return { ok: false, error: "Bundled Demos cannot be removed" };
      }
      const ws = getWorkspace();
      const before = (ws.roots || []).length;
      ws.roots = (ws.roots || []).filter((r) => r.id !== rootId);
      if (ws.roots.length === before) {
        return { ok: false, error: "Root not found" };
      }
      if (ws.expandedRootId === rootId) ws.expandedRootId = null;
      const normalized = normalizeWorkspace(ws, getConstruct2Dir(), workspaceLoadOpts());
      persistWorkspace(normalized);
      return { ok: true, workspace: normalized };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle("adv:enable-root-write", (_evt, payload) => {
    try {
      const rootId = payload?.rootId;
      if (!rootId) return { ok: false, error: "Root id required" };
      if (rootId === DEMOS_ROOT_ID) {
        return { ok: false, error: "Bundled Demos stay read-only" };
      }
      const ws = getWorkspace();
      const root = (ws.roots || []).find((r) => r.id === rootId);
      if (!root) return { ok: false, error: "Root not found" };
      root.readOnly = false;
      const normalized = normalizeWorkspace(ws, getConstruct2Dir(), workspaceLoadOpts());
      persistWorkspace(normalized);
      return { ok: true, workspace: normalized, root };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle("adv:reconvert-legacy-project", (_evt, payload) => {
    try {
      const projectPath = payload?.path;
      if (!projectPath) return { ok: false, error: "Project path required" };
      const check = validateProjectPath(projectPath);
      if (!check.ok) return check;
      const ws = getWorkspace();
      const root = findRootForProject(ws, check.path);
      if (root?.readOnly) {
        return { ok: false, error: "Root is read-only", code: "READ_ONLY_ROOT" };
      }
      if (!isLegacyProject(check.path) && !findLegacyDataFileInDir(check.path)) {
        return { ok: false, error: "No legacy data file found for re-convert" };
      }
      const report = reconvertLegacyProject(check.path, {
        forceCollections: payload?.forceCollections !== false,
      });
      return { ok: true, report };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle("adv:convert-all-legacy-in-root", (_evt, payload) => {
    try {
      const rootId = payload?.rootId;
      if (!rootId) return { ok: false, error: "Root id required" };
      const ws = getWorkspace();
      const root = (ws.roots || []).find((r) => r.id === rootId);
      if (!root) return { ok: false, error: "Root not found" };
      if (root.readOnly) {
        return { ok: false, error: "Root is read-only", code: "READ_ONLY_ROOT" };
      }
      const grouped = listProjectsGrouped(ws);
      const rootData = grouped.roots.find((r) => r.id === rootId);
      const legacy = (rootData?.projects || []).filter(
        (p) => p.kind === "legacy" || p.flags?.legacy,
      );
      let converted = 0;
      let failed = 0;
      const errors = [];
      for (const p of legacy) {
        try {
          upgradeLegacyProject(p.path, { inPlace: true, force: true });
          converted += 1;
        } catch (e) {
          failed += 1;
          errors.push({ path: p.path, error: String(e.message || e) });
        }
      }
      persistWorkspace(ws);
      return {
        ok: failed === 0,
        converted,
        failed,
        total: legacy.length,
        errors,
      };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle("adv:reveal-root-in-explorer", async (_evt, payload) => {
    try {
      const rootId = payload?.rootId;
      if (!rootId) return { ok: false, error: "Root id required" };
      const ws = getWorkspace();
      const root = (ws.roots || []).find((r) => r.id === rootId);
      if (!root) return { ok: false, error: "Root not found" };
      const err = await shell.openPath(root.path);
      if (err) return { ok: false, error: err };
      return { ok: true, path: root.path };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle("adv:is-electron", () => true);

  ipcMain.handle("adv:store-secret", async (_evt, payload) => {
    const name = payload && payload.name;
    if (typeof name !== "string" || !name.trim()) {
      return { ok: false, error: "Invalid secret name" };
    }
    try {
      await ensureUserDataDirs();
      await storeSecretFile(name, payload.value);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle("adv:load-secret", async (_evt, payload) => {
    const name = payload && payload.name;
    if (typeof name !== "string" || !name.trim()) {
      return { ok: false, error: "Invalid secret name" };
    }
    try {
      const value = await loadSecretFile(name);
      return { ok: true, value };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });
}

function isDevServerUrl(url) {
  if (typeof url !== "string" || !url) return false;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host !== BUILDER_HOST && host !== "localhost" && host !== "127.0.0.1") {
      return false;
    }
    return String(u.port || (u.protocol === "https:" ? "443" : "80")) === String(BUILDER_PORT);
  } catch (_) {
    return false;
  }
}

function configureDevMediaPermissions() {
  const ses = session.defaultSession;
  const allowMedia = (url) => isDevServerUrl(url);

  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const url = (details && details.requestingUrl) || webContents.getURL();
    if (
      allowMedia(url) &&
      (permission === "media" ||
        permission === "microphone" ||
        permission === "audioCapture")
    ) {
      callback(true);
      return;
    }
    callback(false);
  });

  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    if (
      allowMedia(requestingOrigin) &&
      (permission === "media" ||
        permission === "microphone" ||
        permission === "audioCapture")
    ) {
      return true;
    }
    return false;
  });
}

function setDevWindowTitle(projectPath) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!projectPath) {
    mainWindow.setTitle("Construct²");
    return;
  }
  const ws = getWorkspace();
  const root = findRootForProject(ws, projectPath);
  const label = String(root?.label || root?.id || "")
    .replace(/\/$/, "")
    .trim();
  const name = path.basename(projectPath);
  mainWindow.setTitle(
    label ? `Construct² - ${label}/${name}` : `Construct² - ${name}`,
  );
}

function createWindow() {
  const saved = validatedWindowState(loadWindowState());
  cachedWindowState = saved;
  const bounds = saved?.bounds;
  const useSaved = bounds && boundsVisibleOnSomeDisplay(bounds);

  mainWindow = new BrowserWindow({
    show: false,
    width: useSaved ? bounds.width : DEFAULT_WINDOW_BOUNDS.width,
    height: useSaved ? bounds.height : DEFAULT_WINDOW_BOUNDS.height,
    x: useSaved ? bounds.x : undefined,
    y: useSaved ? bounds.y : undefined,
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (useSaved && saved && !saved.isMaximized && !saved.isFullScreen) {
      restoreWindowBounds(mainWindow, saved);
      if (isNormalWindow(mainWindow)) {
        const display = screen.getDisplayMatching(mainWindow.getBounds());
        const clamped = clampBoundsToWorkArea(mainWindow.getBounds(), display);
        try {
          mainWindow.setBounds(clamped);
        } catch {
          /* ignore */
        }
      }
    }
    if (saved?.isMaximized) {
      mainWindow.maximize();
    }
    if (saved?.isFullScreen) {
      mainWindow.setFullScreen(true);
    }
    if (isNormalWindow(mainWindow)) {
      cachedWindowState = syncWindowState(mainWindow);
      persistWindowState(cachedWindowState);
    }
    mainWindow.show();
  });

  mainWindow.on("resize", scheduleSaveWindowState);
  mainWindow.on("move", scheduleSaveWindowState);
  mainWindow.on("maximize", scheduleSaveWindowState);
  mainWindow.on("unmaximize", scheduleSaveWindowState);
  mainWindow.on("close", () => {
    clearTimeout(windowStateSaveTimer);
    saveWindowState(mainWindow);
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(async () => {
  await ensureUserDataDirs();
  configureDevMediaPermissions();
  registerIpc();
  installApplicationMenu();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("before-quit", async () => {
  saveWindowState(mainWindow);
  await stopBuilderServer();
});
