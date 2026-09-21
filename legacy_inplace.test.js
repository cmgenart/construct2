const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  upgradeLegacyProject,
  isLegacyProject,
} = require("./legacy_import.js");
const { isConstruct2ProjectDir } = require("./project_discovery.js");
const {
  SAMPLE_NAME,
  writeLegacyProject,
  makeTempLegacyRoot,
} = require("./legacy_test_fixture.js");

const tmpRoot = makeTempLegacyRoot("legacy-inplace-");
const dest = path.join(tmpRoot, SAMPLE_NAME);
writeLegacyProject(dest);

assert.ok(isLegacyProject(dest), "fixture copy is legacy");

const report = upgradeLegacyProject(dest, { inPlace: true, force: true });
assert.strictEqual(report.path, dest);
assert.ok(fs.existsSync(path.join(dest, `${SAMPLE_NAME}_data.json`)), "legacy data kept");
assert.ok(fs.existsSync(path.join(dest, "dev.json")), "dev.json written");
assert.ok(fs.existsSync(path.join(dest, "setup.js")), "setup.js written");
assert.ok(isConstruct2ProjectDir(dest, SAMPLE_NAME), "now construct2");
assert.ok(!isLegacyProject(dest), "no longer legacy-only after upgrade");

const again = upgradeLegacyProject(dest, { inPlace: true });
assert.ok(again.skipped, "second open skips re-upgrade");

fs.rmSync(tmpRoot, { recursive: true, force: true });

console.log("legacy_inplace.test.js: ok");
