const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { LIB_DIR } = require("./import_resolve.js");
const { copySourceSnapshot } = require("./collection_runtime.js");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "coll-source-"));
const projectPath = path.join(tmpRoot, "proj");
const pad2 = "01";
fs.mkdirSync(projectPath, { recursive: true });

const libProbe = path.join(LIB_DIR, "_test_coll_snapshot_lib.js");
fs.writeFileSync(libProbe, "let collLib = 1;\n", "utf8");

const files = {
  "core.html": "<html></html>",
  "setup.js": "//import<_test_coll_snapshot_lib.js>\n",
  "defs.js": "",
  "functions.js": "",
  "draw.js": "",
};

try {
  copySourceSnapshot(projectPath, pad2, files);
  const sourceDir = path.join(projectPath, "collections", pad2, "_source");
  assert.ok(fs.existsSync(path.join(sourceDir, "setup.js")));
  assert.ok(
    fs.existsSync(path.join(sourceDir, "_test_coll_snapshot_lib.js")),
    "lib-resolved import copied into _source",
  );
  const libBody = fs.readFileSync(
    path.join(sourceDir, "_test_coll_snapshot_lib.js"),
    "utf8",
  );
  assert.ok(libBody.includes("collLib"));

  const stalePath = path.join(sourceDir, "_stale_orphan.js");
  fs.writeFileSync(stalePath, "orphan\n", "utf8");
  copySourceSnapshot(projectPath, pad2, files);
  assert.ok(
    !fs.existsSync(stalePath),
    "stale _source file removed on rewrite",
  );
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  try {
    fs.unlinkSync(libProbe);
  } catch (_) {}
}

console.log("collection_source_snapshot.test.js: ok");
