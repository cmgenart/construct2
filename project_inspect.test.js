const assert = require("assert");
const path = require("path");
const { inspectProject, fileEntry, resolveOutputHtmlPath } = require("./project_inspect.js");

const MINIMAL = path.resolve(__dirname, "templates", "projects", "cc-v3-minimal");

const minimal = inspectProject(MINIMAL);
assert.strictEqual(minimal.ok, true);
assert.strictEqual(minimal.kind, "construct2");
assert.ok(minimal.sourceFiles.some((f) => f.path === "setup.js" && f.exists));
assert.ok(!minimal.sourceFiles.some((f) => f.path === "dev.json"));
assert.ok(Array.isArray(minimal.collections));

const missing = inspectProject(path.resolve(__dirname, "__no_such_project__"));
assert.strictEqual(missing.ok, false);

const setup = fileEntry(MINIMAL, "setup.js");
assert.strictEqual(setup.exists, true);
assert.ok(setup.bytes > 0);

const output = resolveOutputHtmlPath(MINIMAL);
if (output) {
  assert.ok(output.endsWith("output.html"));
}

console.log("project_inspect.test.js: ok");
