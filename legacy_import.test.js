const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  parseLegacyProject,
  previewLegacyImport,
  listLegacyCandidates,
  normalizeLegacyCanvas,
  rewriteValueInserts,
} = require("./legacy_import.js");
const {
  SAMPLE_NAME,
  SAMPLE_TYPEID,
  writeLegacyProject,
  makeTempLegacyRoot,
} = require("./legacy_test_fixture.js");

const rewritten = rewriteValueInserts("SEED = 0/*[piece.seed]*/");
assert.ok(rewritten.includes("values.seed"), "piece insert rewritten");

const canvas = normalizeLegacyCanvas("insert<setup>\nend<setup>");
assert.ok(canvas.includes("//insert<setup>"), "insert normalized");
assert.ok(canvas.includes("//end<setup>"), "end normalized");

const tmpRoot = makeTempLegacyRoot("legacy-import-");
const fixture = path.join(tmpRoot, SAMPLE_NAME);
writeLegacyProject(fixture);

const parsed = parseLegacyProject(fixture);
assert.strictEqual(parsed.typeid, SAMPLE_TYPEID);
assert.ok(parsed.codeblocks.setup, "setup block");
assert.ok(parsed.codeblocks.draw, "draw block");
assert.ok(parsed.canvas, "embedded canvas");

const preview = previewLegacyImport(fixture);
assert.strictEqual(preview.ok, true);
assert.strictEqual(preview.runtime, "project-core");
assert.ok(preview.slug, "slug generated");

const candidates = listLegacyCandidates(tmpRoot);
assert.ok(candidates.length >= 1, "legacy candidates found");
const fixtureCandidate = candidates.find((c) => c.path === fixture);
assert.ok(fixtureCandidate, "synthetic fixture in candidate list");
assert.strictEqual(fixtureCandidate.typeid, SAMPLE_TYPEID);

fs.rmSync(tmpRoot, { recursive: true, force: true });

console.log("legacy_import.test.js: ok");
