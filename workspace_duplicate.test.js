const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  normalizeWorkspace,
  importProjectFolderToRoot,
  duplicateProjectToWritableRoot,
} = require("./workspace.js");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ws-dup-"));
const demos = path.join(tmp, "demos");
const projects = path.join(tmp, "projects");
fs.mkdirSync(demos);
fs.mkdirSync(projects);

const source = path.join(demos, "perlin-noise");
fs.mkdirSync(source);
fs.writeFileSync(path.join(source, "setup.js"), "// perlin\n", "utf8");
fs.writeFileSync(
  path.join(source, "dev.json"),
  JSON.stringify({
    buildValueLevels: {
      default: { name: { value: "Perlin Noise", use: true } },
    },
  }),
  "utf8",
);

const ws = normalizeWorkspace(
  {
    roots: [
      {
        id: "demos",
        path: demos,
        label: "Demos/",
        enabled: true,
        readOnly: true,
      },
      {
        id: "user-projects",
        path: projects,
        label: "projects/",
        enabled: true,
        readOnly: false,
      },
    ],
  },
  tmp,
);

const first = duplicateProjectToWritableRoot(ws, source);
assert.strictEqual(first.ok, true);
assert.strictEqual(first.rootId, "user-projects");
assert.strictEqual(first.name, "perlin-noise");
assert.strictEqual(first.path, path.join(projects, "perlin-noise"));
assert.ok(fs.existsSync(path.join(first.path, "setup.js")));
assert.ok(fs.existsSync(path.join(first.path, "dev.json")));

const second = duplicateProjectToWritableRoot(ws, source);
assert.strictEqual(second.ok, true);
assert.strictEqual(second.name, "perlin-noise-2");
assert.ok(fs.existsSync(second.path));

const blocked = importProjectFolderToRoot(ws, source, "demos");
assert.strictEqual(blocked.code, "READ_ONLY_ROOT");

const noWrite = duplicateProjectToWritableRoot(
  {
    roots: [
      { id: "demos", path: demos, label: "Demos/", enabled: true, readOnly: true },
    ],
  },
  source,
);
assert.strictEqual(noWrite.ok, false);
assert.strictEqual(noWrite.code, "NO_WRITABLE_ROOT");

fs.rmSync(tmp, { recursive: true, force: true });
console.log("workspace_duplicate.test.js: ok");
