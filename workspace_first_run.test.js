const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  USER_PROJECTS_ROOT_ID,
  DEMOS_ROOT_ID,
  ensureWritableUserRoot,
  ensureDemosRoot,
  getUserProjectsRoot,
  getBundledDemosRoot,
  loadWorkspace,
} = require("./workspace.js");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ws-first-run-"));
const userProjects = path.join(tmp, "Documents", "Construct2", "projects");

const empty = { version: 1, roots: [] };
const added = ensureWritableUserRoot(empty, { userProjectsRoot: userProjects });
assert.strictEqual(added.created, true);
assert.ok(fs.existsSync(userProjects));
assert.strictEqual(empty.roots.length, 1);
assert.strictEqual(empty.roots[0].id, USER_PROJECTS_ROOT_ID);
assert.strictEqual(empty.roots[0].readOnly, false);

const again = ensureWritableUserRoot(empty, { userProjectsRoot: userProjects });
assert.strictEqual(again.created, false);
assert.strictEqual(empty.roots.length, 1);

const art = path.join(tmp, "art");
fs.mkdirSync(art);
const withArt = {
  version: 1,
  roots: [{ id: "art", path: art, label: "art/", enabled: true, readOnly: false }],
};
const skipped = ensureWritableUserRoot(withArt, { userProjectsRoot: userProjects });
assert.strictEqual(skipped.created, false);
assert.strictEqual(withArt.roots.length, 1);

const userData = path.join(tmp, "userData");
const isolatedC2 = path.join(tmp, "no-sibling-art", "construct2");
fs.mkdirSync(isolatedC2, { recursive: true });
const loaded = loadWorkspace(userData, isolatedC2, {
  userProjectsRoot: userProjects,
});
assert.ok(loaded.roots.some((r) => r.enabled && !r.readOnly));
assert.ok(fs.existsSync(path.join(userData, "workspace.json")));

assert.strictEqual(
  getUserProjectsRoot("/home/tester"),
  path.join("/home/tester", "Documents", "Construct2", "projects"),
);

const demosDir = path.join(tmp, "bundled-demos");
fs.mkdirSync(path.join(demosDir, "op-art"), { recursive: true });
fs.writeFileSync(path.join(demosDir, "op-art", "setup.js"), "Canvas(1000,1000,0)\n");

const packagedUser = path.join(tmp, "packaged-user");
const packagedC2 = path.join(tmp, "packaged-app", "construct2");
fs.mkdirSync(packagedC2, { recursive: true });
const siblingArt = path.join(tmp, "packaged-app", "art");
fs.mkdirSync(siblingArt);
const packaged = loadWorkspace(packagedUser, packagedC2, {
  userProjectsRoot: userProjects,
  isPackaged: true,
  demosRoot: demosDir,
});
assert.ok(
  !packaged.roots.some((r) => r.id === "art"),
  "packaged first-run must not pick sibling art/",
);
assert.strictEqual(packaged.roots[0].id, DEMOS_ROOT_ID);
assert.strictEqual(packaged.roots[0].readOnly, true);
assert.strictEqual(path.resolve(packaged.roots[0].path), path.resolve(demosDir));
assert.ok(packaged.roots.some((r) => r.id === USER_PROJECTS_ROOT_ID && !r.readOnly));

const noDemosPackaged = loadWorkspace(
  path.join(tmp, "packaged-user-2"),
  path.join(tmp, "packaged-app-2", "construct2"),
  {
    userProjectsRoot: path.join(tmp, "Documents2", "Construct2", "projects"),
    isPackaged: true,
    demosRoot: path.join(tmp, "missing-demos"),
  },
);
assert.ok(!noDemosPackaged.roots.some((r) => r.id === DEMOS_ROOT_ID));
assert.ok(noDemosPackaged.roots.some((r) => r.id === USER_PROJECTS_ROOT_ID));

const existing = {
  version: 1,
  roots: [{ id: "art", path: art, label: "art/", enabled: true, readOnly: false }],
};
const attached = ensureDemosRoot(existing, { demosRoot: demosDir });
assert.strictEqual(attached.created, true);
assert.strictEqual(existing.roots[0].id, DEMOS_ROOT_ID);
assert.strictEqual(existing.roots[1].id, "art");

const stale = {
  version: 1,
  roots: [
    {
      id: DEMOS_ROOT_ID,
      path: path.join(tmp, "old-demos"),
      label: "Demos/",
      enabled: true,
      readOnly: false,
    },
  ],
};
const refreshed = ensureDemosRoot(stale, { demosRoot: demosDir });
assert.strictEqual(refreshed.updated, true);
assert.strictEqual(path.resolve(stale.roots[0].path), path.resolve(demosDir));
assert.strictEqual(stale.roots[0].readOnly, true);

assert.strictEqual(
  getBundledDemosRoot(packagedC2, { isPackaged: true, demosRoot: demosDir }),
  path.resolve(demosDir),
);
assert.strictEqual(
  getBundledDemosRoot(packagedC2, { isPackaged: true, resourcesPath: path.join(tmp, "no-res") }),
  null,
);

const fallbackLayout = path.join(tmp, "install-root");
const appDir = path.join(fallbackLayout, "resources", "app");
const demosBesideApp = path.join(fallbackLayout, "resources", "demos");
fs.mkdirSync(path.join(demosBesideApp, "rain"), { recursive: true });
fs.mkdirSync(appDir, { recursive: true });
assert.strictEqual(
  getBundledDemosRoot(appDir, {
    isPackaged: true,
    resourcesPath: path.join(tmp, "wrong-resources"),
  }),
  path.resolve(demosBesideApp),
  "packaged demos resolve next to resources/app when resourcesPath is wrong",
);

const appsLayout = path.join(tmp, "genart-apps");
const appsC2 = path.join(appsLayout, "apps", "construct2");
const appsDemos = path.join(appsLayout, "construct-demos", "construct");
const appsArt = path.join(appsLayout, "art");
fs.mkdirSync(path.join(appsDemos, "rain"), { recursive: true });
fs.mkdirSync(appsArt, { recursive: true });
fs.mkdirSync(appsC2, { recursive: true });
assert.strictEqual(
  getBundledDemosRoot(appsC2),
  path.resolve(appsDemos),
  "dev demos resolve from apps/construct2 via ../../construct-demos",
);
const appsWs = loadWorkspace(path.join(tmp, "apps-user"), appsC2, {
  userProjectsRoot: path.join(tmp, "Documents3", "Construct2", "projects"),
});
assert.ok(
  appsWs.roots.some((r) => r.id === "art" && path.resolve(r.path) === path.resolve(appsArt)),
  "dev art/ root resolves from apps/construct2",
);

console.log("workspace_first_run.test.js: ok");
