const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  normalizeWorkspace,
  pinProject,
  unpinProject,
  sanitizePinnedProjects,
  addWorkspaceRoot,
  importProjectFolderToRoot,
} = require("./workspace.js");
const { writeLegacyProject } = require("./legacy_test_fixture.js");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ws-pins-"));
const art = path.join(tmp, "art");
const legacy = path.join(tmp, "art-legacy");
fs.mkdirSync(art);
fs.mkdirSync(legacy);
const projectA = path.join(art, "alpha");
const projectB = path.join(art, "beta");
fs.mkdirSync(projectA);
fs.mkdirSync(projectB);
fs.writeFileSync(path.join(projectA, "dev.json"), "{}", "utf8");
fs.writeFileSync(path.join(projectB, "setup.js"), "// beta\n", "utf8");

const ws = normalizeWorkspace(
  {
    roots: [
      { id: "art", path: art, label: "Art", enabled: true, readOnly: false },
      {
        id: "legacy",
        path: legacy,
        label: "Legacy",
        enabled: true,
        readOnly: true,
      },
    ],
    pinnedProjects: {
      art: [{ name: "Alpha", path: projectA }],
      legacy: [{ name: "Ghost", path: path.join(legacy, "missing") }],
    },
    expandedRootId: "art",
  },
  tmp,
);

assert.deepStrictEqual(ws.pinnedProjects.art, [
  { name: "Alpha", path: projectA },
]);
assert.strictEqual(ws.pinnedProjects.legacy, undefined, "drops missing pins");
assert.strictEqual(ws.expandedRootId, "art");

const pin = pinProject(ws, { name: "Beta", path: projectB });
assert.strictEqual(pin.ok, true);
assert.strictEqual(ws.pinnedProjects.art.length, 2);

const dup = pinProject(ws, { name: "Beta", path: projectB });
assert.strictEqual(dup.alreadyPinned, true);

const unpin = unpinProject(ws, { path: projectA });
assert.strictEqual(unpin.removed, true);
assert.strictEqual(ws.pinnedProjects.art.length, 1);

const extra = path.join(tmp, "extra");
fs.mkdirSync(extra);
const add = addWorkspaceRoot(ws, extra);
assert.strictEqual(add.ok, true);
assert.ok(ws.roots.some((r) => r.path === path.join(tmp, "extra")));

const dupRoot = addWorkspaceRoot(ws, extra);
assert.strictEqual(dupRoot.ok, false);

const fixture = path.join(tmp, "incoming-legacy");
writeLegacyProject(fixture);
const imported = importProjectFolderToRoot(ws, fixture, "art", {
  onCollision: "rename",
});
assert.strictEqual(imported.ok, true);
assert.ok(fs.existsSync(imported.path), "legacy fixture copied into art root");
assert.ok(imported.kind === "legacy");

const readOnlyImport = importProjectFolderToRoot(ws, fixture, "legacy");
assert.strictEqual(readOnlyImport.code, "READ_ONLY_ROOT");

const cleaned = sanitizePinnedProjects({
  roots: ws.roots,
  pinnedProjects: {
    art: [{ name: "Outside", path: tmp }],
  },
});
assert.strictEqual(cleaned.art, undefined, "drops pins outside root");

fs.rmSync(tmp, { recursive: true, force: true });

console.log("workspace_pins.test.js: ok");
