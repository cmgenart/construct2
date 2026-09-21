/**
 * //import tag resolution — see docs/CORE.md
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  discoverImportPaths,
  expandImports,
  discoverImportGraph,
  resolveImportPath,
} = require("./import_resolve.js");

function test(name, fn) {
  try {
    fn();
    console.log("ok:", name);
  } catch (e) {
    console.error("FAIL:", name, e.message);
    process.exitCode = 1;
  }
}

test("discoverImportPaths finds tags", () => {
  const paths = discoverImportPaths("//import<colours/a.js>\n//import<colours/b.js>");
  assert.deepStrictEqual(paths, ["colours/a.js", "colours/b.js"]);
});

test("resolveImportPath rejects parent traversal", () => {
  const root = path.join(os.tmpdir(), "genart-import-test");
  const r = resolveImportPath(root, "../escape.js");
  assert.strictEqual(r.ok, false);
});

test("chained imports expand inline", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "genart-import-"));
  fs.writeFileSync(path.join(root, "leaf.js"), "let leaf = 1;", "utf8");
  fs.writeFileSync(
    path.join(root, "mid.js"),
    "//import<leaf.js>\nlet mid = 2;",
    "utf8",
  );
  const src = "//import<mid.js>\nlet top = 3;";
  const errors = [];
  const out = expandImports(src, root, errors);
  assert.strictEqual(errors.length, 0);
  assert.ok(out.includes("let leaf = 1;"));
  assert.ok(out.includes("let mid = 2;"));
  assert.ok(out.includes("let top = 3;"));
  assert.ok(!out.includes("//import<"));
  fs.rmSync(root, { recursive: true, force: true });
});

test("circular import is reported", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "genart-import-"));
  fs.writeFileSync(path.join(root, "a.js"), "//import<b.js>", "utf8");
  fs.writeFileSync(path.join(root, "b.js"), "//import<a.js>", "utf8");
  const errors = [];
  expandImports("//import<a.js>", root, errors);
  assert.ok(errors.some((e) => /circular/i.test(e.error)));
  fs.rmSync(root, { recursive: true, force: true });
});

test("discoverImportGraph is transitive", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "genart-import-"));
  fs.writeFileSync(path.join(root, "nested.js"), "x=1;", "utf8");
  fs.writeFileSync(path.join(root, "defs.js"), "//import<nested.js>", "utf8");
  const graph = discoverImportGraph(root, { "defs.js": "//import<nested.js>" });
  assert.strictEqual(graph.size, 1);
  assert.ok(graph.has(path.resolve(root, "nested.js")));
  fs.rmSync(root, { recursive: true, force: true });
});

test("resolveImportPath falls back to construct2/lib", () => {
  const { LIB_DIR } = require("./import_resolve.js");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "genart-import-"));
  const libFile = path.join(LIB_DIR, "_test_lib_only.js");
  fs.writeFileSync(libFile, "let fromLib = 1;", "utf8");
  try {
    const r = resolveImportPath(root, "_test_lib_only.js");
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.source, "lib");
    assert.strictEqual(r.abs, libFile);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(libFile, { force: true });
  }
});

test("project import wins over lib fallback", () => {
  const { LIB_DIR } = require("./import_resolve.js");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "genart-import-"));
  const libFile = path.join(LIB_DIR, "_test_lib_precedence.js");
  fs.writeFileSync(libFile, "let fromLib = 1;", "utf8");
  fs.writeFileSync(path.join(root, "_test_lib_precedence.js"), "let fromProject = 1;", "utf8");
  try {
    const r = resolveImportPath(root, "_test_lib_precedence.js");
    assert.strictEqual(r.source, "project");
    assert.strictEqual(r.abs, path.join(root, "_test_lib_precedence.js"));
    const errors = [];
    const out = expandImports("//import<_test_lib_precedence.js>", root, errors);
    assert.strictEqual(errors.length, 0);
    assert.ok(out.includes("fromProject"));
    assert.ok(!out.includes("fromLib"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(libFile, { force: true });
  }
});

test("expandImports resolves chained imports from lib", () => {
  const { LIB_DIR } = require("./import_resolve.js");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "genart-import-"));
  const leaf = path.join(LIB_DIR, "_test_lib_leaf.js");
  const mid = path.join(LIB_DIR, "_test_lib_mid.js");
  fs.writeFileSync(leaf, "let leaf = 9;", "utf8");
  fs.writeFileSync(mid, "//import<_test_lib_leaf.js>\nlet mid = 8;", "utf8");
  try {
    const errors = [];
    const out = expandImports("//import<_test_lib_mid.js>", root, errors);
    assert.strictEqual(errors.length, 0);
    assert.ok(out.includes("let leaf = 9;"));
    assert.ok(out.includes("let mid = 8;"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(leaf, { force: true });
    fs.rmSync(mid, { force: true });
  }
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log("import_resolve.test.js: all passed");
