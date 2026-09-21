const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  resolveLegacyProjectPath,
  reconvertLegacyProject,
  upgradeLegacyProject,
  mergeDevJsonForReconvert,
  getDataFileMtime,
} = require("./legacy_import.js");
const {
  findRootForProject,
  getDefaultWritableRoot,
  getLegacyConversion,
  setLegacyConversion,
} = require("./workspace.js");
const {
  SAMPLE_NAME,
  writeLegacyProject,
  makeTempLegacyRoot,
} = require("./legacy_test_fixture.js");

const tmpRoot = makeTempLegacyRoot("legacy-readonly-");

const legacyRoot = path.join(tmpRoot, "legacy-root");
const writableRoot = path.join(tmpRoot, "writable-root");
fs.mkdirSync(legacyRoot, { recursive: true });
fs.mkdirSync(writableRoot, { recursive: true });
writeLegacyProject(path.join(legacyRoot, SAMPLE_NAME));

const workspace = {
  roots: [
    { id: "legacy", path: legacyRoot, label: "legacy/", enabled: true, readOnly: true },
    { id: "art", path: writableRoot, label: "art/", enabled: true, readOnly: false },
  ],
  legacyConversions: {},
};

const workspaceApi = {
  findRootForProject,
  getDefaultWritableRoot,
  getLegacyConversion,
  setLegacyConversion,
};

const legacyPath = path.join(legacyRoot, SAMPLE_NAME);
const blocked = resolveLegacyProjectPath(legacyPath, workspace, workspaceApi);
assert.strictEqual(blocked.ok, false);
assert.strictEqual(blocked.code, "READ_ONLY_LEGACY");
assert.strictEqual(blocked.rootId, "legacy");
assert.ok(blocked.path, "legacy path returned");

const writableDest = path.join(tmpRoot, "writable-inplace");
writeLegacyProject(path.join(writableDest, SAMPLE_NAME));
const writableProject = path.join(writableDest, SAMPLE_NAME);
const writableWorkspace = {
  roots: [
    {
      id: "art",
      path: writableDest,
      label: "art/",
      enabled: true,
      readOnly: false,
    },
  ],
};
const allowed = resolveLegacyProjectPath(writableProject, writableWorkspace, workspaceApi);
assert.strictEqual(allowed.ok, true);
assert.strictEqual(allowed.inPlace, true);

const outsideDir = path.join(tmpRoot, "outside");
writeLegacyProject(path.join(outsideDir, SAMPLE_NAME));
const outsidePath = path.join(outsideDir, SAMPLE_NAME);
const outsideWs = {
  roots: [
    {
      id: "art",
      path: writableRoot,
      label: "art/",
      enabled: true,
      readOnly: false,
    },
  ],
};
const noOwningRoot = resolveLegacyProjectPath(outsidePath, outsideWs, workspaceApi);
assert.strictEqual(noOwningRoot.ok, false);
assert.strictEqual(noOwningRoot.code, "LEGACY_NO_WRITABLE_ROOT");
assert.ok(noOwningRoot.path);

const reconvertDir = path.join(tmpRoot, "reconvert");
writeLegacyProject(path.join(reconvertDir, SAMPLE_NAME));
const reconvertPath = path.join(reconvertDir, SAMPLE_NAME);
upgradeLegacyProject(reconvertPath, { inPlace: true, force: true });

const devPath = path.join(reconvertPath, "dev.json");
const dev = JSON.parse(fs.readFileSync(devPath, "utf8"));
dev.buildValueLevels.default.custom_keep = { value: "saved", use: true };
dev.propertyLevels.viewer.tone = { value: 3, use: true };
dev.paramValues.alpha = 0.5;
fs.writeFileSync(devPath, JSON.stringify(dev, null, 2), "utf8");

const merged = mergeDevJsonForReconvert(
  {
    seed: "99",
    buildValueLevels: { default: { seed: { value: "99", use: true } }, collection: {} },
    propertyLevels: { viewer: {}, collection: {}, piece: {}, override: {} },
    paramValues: {},
    settings: {
      legacyImport: {
        typeid: "test",
        dataFile: "/tmp/foo_data.json",
        upgradedAt: new Date().toISOString(),
      },
    },
  },
  dev,
);
assert.strictEqual(merged.buildValueLevels.default.custom_keep.value, "saved");
assert.strictEqual(merged.propertyLevels.viewer.tone.value, 3);
assert.strictEqual(merged.paramValues.alpha, 0.5);

const report = reconvertLegacyProject(reconvertPath);
assert.strictEqual(report.reconverted, true);
assert.ok(report.dataFileMtime, "dataFileMtime recorded");

const devAfter = JSON.parse(fs.readFileSync(devPath, "utf8"));
assert.strictEqual(devAfter.buildValueLevels.default.custom_keep.value, "saved");
assert.strictEqual(devAfter.propertyLevels.viewer.tone.value, 3);
assert.strictEqual(devAfter.paramValues.alpha, 0.5);
assert.ok(devAfter.settings.legacyImport.dataFileMtime);
assert.ok(getDataFileMtime(report.dataFile));

const upgradedDev = JSON.parse(fs.readFileSync(devPath, "utf8"));
assert.ok(upgradedDev.settings?.legacyImport?.dataFile || upgradedDev.settings?.legacyImport?.typeid);

fs.rmSync(tmpRoot, { recursive: true, force: true });

console.log("legacy_readonly_policy.test.js: ok");
