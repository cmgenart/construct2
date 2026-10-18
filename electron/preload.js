const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("advBuilder", {
  getProjectsRoot: () => ipcRenderer.invoke("adv:get-projects-root"),

  getWorkspace: () => ipcRenderer.invoke("adv:get-workspace"),

  patchWorkspace: (patch) => ipcRenderer.invoke("adv:patch-workspace", patch),

  pickFolder: () => ipcRenderer.invoke("adv:pick-folder"),

  listProjects: () => ipcRenderer.invoke("adv:list-projects"),

  listTemplates: () => ipcRenderer.invoke("adv:list-templates"),

  createProject: (payload) => ipcRenderer.invoke("adv:create-project", payload),

  projectInitialName: (payload) =>
    ipcRenderer.invoke("adv:project-initial-name", payload),

  renameProject: (payload) => ipcRenderer.invoke("adv:rename-project", payload),

  previewLegacyImport: (payload) =>
    ipcRenderer.invoke("adv:preview-legacy-import", payload),

  importLegacyProject: (payload) =>
    ipcRenderer.invoke("adv:import-legacy-project", payload),

  listLegacyCandidates: (payload) =>
    ipcRenderer.invoke("adv:list-legacy-candidates", payload),

  batchImportLegacy: (payload) =>
    ipcRenderer.invoke("adv:batch-import-legacy", payload),

  convertLegacyProject: (payload) =>
    ipcRenderer.invoke("adv:convert-legacy-project", payload),

  getProjectDetails: (payload) =>
    ipcRenderer.invoke("adv:get-project-details", payload),

  listRuntimes: (payload) =>
    ipcRenderer.invoke("adv:list-runtimes", payload),

  setProjectRuntime: (payload) =>
    ipcRenderer.invoke("adv:set-project-runtime", payload),

  revealInExplorer: (payload) =>
    ipcRenderer.invoke("adv:reveal-in-explorer", payload),

  revealRootInExplorer: (payload) =>
    ipcRenderer.invoke("adv:reveal-root-in-explorer", payload),

  openProjectOutput: (payload) =>
    ipcRenderer.invoke("adv:open-project-output", payload),

  openLegacyBrowser: (payload) =>
    ipcRenderer.invoke("adv:open-legacy-browser", payload),

  pinProject: (payload) => ipcRenderer.invoke("adv:pin-project", payload),

  unpinProject: (payload) => ipcRenderer.invoke("adv:unpin-project", payload),

  showContextMenu: (payload) =>
    ipcRenderer.invoke("adv:show-context-menu", payload),

  addWorkspaceRoot: (payload) =>
    ipcRenderer.invoke("adv:add-workspace-root", payload),

  importProjectFolder: (payload) =>
    ipcRenderer.invoke("adv:import-project-folder", payload),

  duplicateProject: (payload) =>
    ipcRenderer.invoke("adv:duplicate-project", payload),

  probeDropFolder: (payload) =>
    ipcRenderer.invoke("adv:probe-drop-folder", payload),

  removeWorkspaceRoot: (payload) =>
    ipcRenderer.invoke("adv:remove-workspace-root", payload),

  enableRootWrite: (payload) =>
    ipcRenderer.invoke("adv:enable-root-write", payload),

  reconvertLegacyProject: (payload) =>
    ipcRenderer.invoke("adv:reconvert-legacy-project", payload),

  convertAllLegacyInRoot: (payload) =>
    ipcRenderer.invoke("adv:convert-all-legacy-in-root", payload),

  getPathForFile: (file) => {
    const { webUtils } = require("electron");
    return webUtils.getPathForFile(file);
  },

  getSelectedProject: () => ipcRenderer.invoke("adv:get-selected-project"),

  setSelectedProject: (payload) =>
    ipcRenderer.invoke("adv:set-selected-project", payload),

  startDevUi: (payload) => ipcRenderer.invoke("adv:start-dev-ui", payload || {}),

  stopDevUi: () => ipcRenderer.invoke("adv:stop-dev-ui"),

  setWindowTitle: (payload) => ipcRenderer.invoke("adv:set-window-title", payload),

  focusWindow: () => ipcRenderer.invoke("adv:focus-window"),

  getDevServerOrigin: () =>
    ipcRenderer.invoke("adv:get-dev-server-origin"),

  clipboardReadText: () => ipcRenderer.invoke("adv:clipboard-read"),

  clipboardWriteText: (text) =>
    ipcRenderer.invoke("adv:clipboard-write", text),

  openExternal: (url) => ipcRenderer.invoke("adv:open-external", url),

  getAppInfo: () => ipcRenderer.invoke("adv:get-app-info"),

  onShowAbout: (fn) => {
    ipcRenderer.on("adv:show-about", () => {
      try {
        fn();
      } catch {
        /* ignore */
      }
    });
  },

  onShowHelp: (fn) => {
    ipcRenderer.on("adv:show-help", (_evt, rel) => {
      try {
        fn(rel);
      } catch {
        /* ignore */
      }
    });
  },

  onShowBugReport: (fn) => {
    ipcRenderer.on("adv:show-bug-report", () => {
      try {
        fn();
      } catch {
        /* ignore */
      }
    });
  },

  readHelpDoc: (rel) => ipcRenderer.invoke("adv:read-help-doc", rel),

  getBugReportContext: () => ipcRenderer.invoke("adv:get-bug-report-context"),

  openBugReport: (payload) => ipcRenderer.invoke("adv:open-bug-report", payload),

  isElectron: () => ipcRenderer.invoke("adv:is-electron"),

  storeSecret: async (name, value) => {
    const r = await ipcRenderer.invoke("adv:store-secret", { name, value });
    if (!r || !r.ok) throw new Error((r && r.error) || "store failed");
  },

  loadSecret: async (name) => {
    const r = await ipcRenderer.invoke("adv:load-secret", { name });
    if (!r || !r.ok) return null;
    return r.value != null ? r.value : null;
  },
});
