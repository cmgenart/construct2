const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { renameUserProject, readInitialProjectName } = require("./project_rename.js");
const { retargetProjectPath } = require("./workspace.js");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "c2-rename-"));
const src = path.join(root, "quiet-harbor");
fs.mkdirSync(src);
const pieceName = { value: "Piece title", use: true };
const dev = {
  seed: "9",
  buildValueLevels: {
    default: {
      name: { value: "Quiet Harbor", use: true },
      collection_name: { value: "quiet-harbor", use: true },
      artist: { value: "Ada", use: true },
    },
    collection: {
      name: { value: "Collection flavour", use: false },
    },
    piece: {
      name: pieceName,
    },
  },
  propertyLevels: { piece: { theme: "ink" } },
};
fs.writeFileSync(path.join(src, "dev.json"), JSON.stringify(dev, null, 2), "utf8");
fs.writeFileSync(path.join(src, "setup.js"), "// setup\n", "utf8");

assert.strictEqual(readInitialProjectName(src).displayName, "Quiet Harbor");

const renamed = renameUserProject(src, "Sharp Echo");
assert.strictEqual(renamed.ok, true);
assert.strictEqual(renamed.name, "sharp-echo");
assert.strictEqual(renamed.displayName, "Sharp Echo");
assert.strictEqual(fs.existsSync(src), false);
const next = JSON.parse(fs.readFileSync(path.join(renamed.path, "dev.json"), "utf8"));
assert.strictEqual(next.buildValueLevels.default.name.value, "Sharp Echo");
assert.strictEqual(next.buildValueLevels.default.collection_name.value, "sharp-echo");
assert.strictEqual(next.buildValueLevels.default.artist.value, "Ada");
assert.strictEqual(next.buildValueLevels.collection.name.value, "Collection flavour");
assert.strictEqual(next.buildValueLevels.collection.name.use, false);
assert.deepStrictEqual(next.buildValueLevels.piece.name, { value: "Piece title", use: true });
assert.deepStrictEqual(next.propertyLevels, { piece: { theme: "ink" } });
assert.strictEqual(next.seed, "9");

const same = renameUserProject(renamed.path, "Sharp Echo");
assert.strictEqual(same.ok, true);
assert.strictEqual(same.path, renamed.path);

const clashDir = path.join(root, "taken");
fs.mkdirSync(clashDir);
const clash = renameUserProject(renamed.path, "Taken");
assert.strictEqual(clash.ok, false);
assert.strictEqual(fs.existsSync(renamed.path), true);

const ws = {
  lastSelected: { name: "quiet-harbor", path: src, rootId: "user" },
  recentProjects: [
    { name: "quiet-harbor", path: src, rootId: "user" },
    { name: "other", path: path.join(root, "other"), rootId: "user" },
  ],
  pinnedProjects: {
    user: [{ name: "quiet-harbor", path: src }],
  },
  legacyConversions: {
    [path.join(root, "old-legacy")]: { path: src, convertedAt: "t" },
  },
};
retargetProjectPath(ws, src, renamed.path, renamed.name);
assert.strictEqual(ws.lastSelected.path, renamed.path);
assert.strictEqual(ws.lastSelected.name, "sharp-echo");
assert.strictEqual(ws.recentProjects[0].path, renamed.path);
assert.strictEqual(ws.recentProjects[1].name, "other");
assert.strictEqual(ws.pinnedProjects.user[0].name, "sharp-echo");
assert.strictEqual(ws.legacyConversions[path.join(root, "old-legacy")].path, renamed.path);

console.log("project_rename.test.js: ok");
