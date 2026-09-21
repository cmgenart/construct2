const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  extractLegacyRuntimes,
  findManifestEntryForTypeid,
  parseCanvasLabel,
} = require("./legacy_runtime_extract.js");
const {
  SAMPLE_CANVAS,
  SAMPLE_NAME,
  SAMPLE_TYPEID,
  writeLegacyProject,
  makeTempLegacyRoot,
} = require("./legacy_test_fixture.js");

assert.ok(
  parseCanvasLabel(SAMPLE_CANVAS).includes("Playground Square Canvas"),
  "parses playground label from synthetic canvas",
);

const tmpRoot = makeTempLegacyRoot("legacy-extract-");
writeLegacyProject(path.join(tmpRoot, SAMPLE_NAME));

const result = extractLegacyRuntimes(tmpRoot);
assert.ok(result.shellCount >= 1, "extracts unique canvas shells");

const playground = result.shells.find((s) =>
  s.legacyTypeIds.includes(SAMPLE_TYPEID),
);
assert.ok(playground, "playground square shell");
assert.ok(
  playground.label.includes("Playground Square Canvas"),
  `playground label: ${playground.label}`,
);

const propertiesEntry = findManifestEntryForTypeid(SAMPLE_TYPEID);
assert.strictEqual(
  propertiesEntry,
  null,
  "shipped manifest does not register extracted legacy shells",
);

fs.rmSync(tmpRoot, { recursive: true, force: true });

console.log("legacy_runtime_extract.test.js: ok");
