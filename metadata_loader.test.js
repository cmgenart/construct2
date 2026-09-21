"use strict";

const assert = require("assert");
const {
  normalizeCreateMetadataResult,
  processMetadataOutputs,
  isMetadataOutputFilename,
  PRIMARY_METADATA_FILE,
} = require("./metadata_loader.js");

const legacyRoot = {
  721: {
    policy: {
      asset00001: { name: "test" },
    },
  },
};

const multi = {
  "metadata.json": legacyRoot,
  "metadata.readable.json": {
    721: {
      policy: {
        asset00001: { name: "raw" },
      },
    },
  },
};

assert.strictEqual(
  normalizeCreateMetadataResult(legacyRoot).ok,
  true,
);
assert.deepStrictEqual(
  normalizeCreateMetadataResult(legacyRoot).files,
  { [PRIMARY_METADATA_FILE]: legacyRoot },
);

assert.strictEqual(normalizeCreateMetadataResult(multi).ok, true);
assert.strictEqual(
  Object.keys(normalizeCreateMetadataResult(multi).files).length,
  2,
);

assert.strictEqual(
  normalizeCreateMetadataResult({ bad: "x" }).ok,
  false,
);

const utf8link = "data:text/html,hello";
const processed = processMetadataOutputs(
  normalizeCreateMetadataResult(multi).files,
  utf8link,
  false,
);
assert.ok(processed["metadata.json"].min);
assert.ok(processed["metadata.readable.json"].min);
assert.deepStrictEqual(
  processed["metadata.json"].object["721"],
  legacyRoot["721"],
);

assert.strictEqual(isMetadataOutputFilename("metadata.json"), true);
assert.strictEqual(isMetadataOutputFilename("metadata.readable.json"), true);
assert.strictEqual(isMetadataOutputFilename("values.json"), false);

console.log("metadata_loader.test.js: ok");
