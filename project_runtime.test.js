const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const {
  PROJECT_CORE_ID,
  getStoredRuntimeId,
  getRuntimesState,
  setProjectRuntime,
  resolveEffectiveCoreContent,
  hashFile,
} = require("./project_runtime.js");
const { resolveRuntimeFile } = require("./project_scaffold.js");
const { copySourceSnapshot } = require("./collection_runtime.js");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "project-runtime-"));
const projectDir = path.join(tmp, "TestProject");
fs.mkdirSync(projectDir, { recursive: true });

const ccV3 = resolveRuntimeFile("cc-v3.23");
assert.strictEqual(path.basename(ccV3), "cc-v3.23.html");
assert.strictEqual(resolveRuntimeFile("cc-v3"), ccV3, "cc-v3 aliases current 3.23");
const ccV3Body = fs.readFileSync(ccV3, "utf8");
const customBody = "<html><!-- custom project core --></html>";

fs.copyFileSync(ccV3, path.join(projectDir, "core.html"));
fs.writeFileSync(
  path.join(projectDir, "project.json"),
  JSON.stringify({ runtime: "cc-v3" }, null, 2),
  "utf8",
);
fs.writeFileSync(path.join(projectDir, "dev.json"), "{}", "utf8");

assert.strictEqual(getStoredRuntimeId(projectDir), "cc-v3.23");
assert.strictEqual(
  resolveEffectiveCoreContent(projectDir, "cc-v3"),
  ccV3Body,
);

fs.writeFileSync(path.join(projectDir, "core.html"), customBody, "utf8");
assert.strictEqual(getRuntimesState(projectDir).projectCore.isCustom, true);
assert.strictEqual(
  resolveEffectiveCoreContent(projectDir, "cc-v3.23"),
  ccV3Body,
  "shared runtime selection uses manifest file, not project core.html",
);
assert.strictEqual(
  fs.readFileSync(path.join(projectDir, "core.html"), "utf8"),
  customBody,
  "project core.html left untouched when shared runtime is selected",
);

const switched = setProjectRuntime(projectDir, "cc-v3.23");
assert.strictEqual(switched.ok, true);
assert.strictEqual(
  fs.readFileSync(path.join(projectDir, "core.html"), "utf8"),
  customBody,
);

const useProjectCore = setProjectRuntime(projectDir, PROJECT_CORE_ID);
assert.strictEqual(useProjectCore.ok, true);
assert.strictEqual(getStoredRuntimeId(projectDir), PROJECT_CORE_ID);
assert.strictEqual(
  resolveEffectiveCoreContent(projectDir),
  customBody,
);

const dev = JSON.parse(fs.readFileSync(path.join(projectDir, "dev.json"), "utf8"));
assert.strictEqual(dev.settings.selectedRuntime.id, PROJECT_CORE_ID);

const effectiveFiles = {
  "core.html": resolveEffectiveCoreContent(projectDir),
  "setup.js": "",
  "defs.js": "",
  "functions.js": "",
  "draw.js": "",
};
copySourceSnapshot(projectDir, "01", effectiveFiles);
const sourceCore = fs.readFileSync(
  path.join(projectDir, "collections", "01", "_source", "core.html"),
  "utf8",
);
assert.strictEqual(sourceCore, customBody, "_source stores the active core");

const backToShared = setProjectRuntime(projectDir, "cc-v3");
assert.strictEqual(backToShared.runtimeId, "cc-v3.23");
assert.strictEqual(backToShared.ok, true);
copySourceSnapshot(projectDir, "02", {
  ...effectiveFiles,
  "core.html": resolveEffectiveCoreContent(projectDir),
});
const sharedSnapshot = fs.readFileSync(
  path.join(projectDir, "collections", "02", "_source", "core.html"),
  "utf8",
);
assert.strictEqual(
  hashFile(path.join(projectDir, "collections", "02", "_source", "core.html")),
  hashFile(ccV3),
);

fs.rmSync(tmp, { recursive: true, force: true });

console.log("project_runtime.test.js: ok");
