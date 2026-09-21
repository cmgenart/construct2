const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  upgradeLegacyProject,
  ensureLegacyCollectionsImported,
  parseLegacyProject,
  reconvertLegacyProject,
  shouldGroupLegacyRowsByProject,
  groupLegacyCollectionRows,
} = require("./legacy_import.js");
const { listCollectionPad2s, readCollection } = require("./collection_fs.js");
const {
  SAMPLE_NAME,
  writeLegacyProject,
  makeTempLegacyRoot,
} = require("./legacy_test_fixture.js");

const tmpRoot = makeTempLegacyRoot("legacy-coll-");
const dest = path.join(tmpRoot, SAMPLE_NAME);

writeLegacyProject(dest, {
  collectiondata: [
    {
      num: 1,
      seed: 0,
      properties: { type: "master" },
      collection: { name: SAMPLE_NAME },
      piece: { name: "Piece 1" },
    },
  ],
});

const report = upgradeLegacyProject(dest, { inPlace: true, force: true });
assert.strictEqual(report.ok, true);
assert.ok(report.collections?.imported, "collections imported on upgrade");
assert.strictEqual(report.collections.totalPieces, 1);

const list = listCollectionPad2s(dest);
assert.strictEqual(list.length, 1);
assert.strictEqual(list[0].pieceCount, 1);

const coll = readCollection(dest, list[0].pad2);
assert.ok(coll);
assert.strictEqual(coll.pieceRecords.length, 1);
assert.strictEqual(coll.pieceRecords[0].properties.type, "master");
assert.strictEqual(coll.pieceRecords[0].values.seed.value, "00000");

const again = ensureLegacyCollectionsImported(dest);
assert.ok(again.skipped, "does not duplicate collections");

fs.rmSync(tmpRoot, { recursive: true, force: true });

const tmpGroup = makeTempLegacyRoot("legacy-group-");
const groupDest = path.join(tmpGroup, SAMPLE_NAME);
writeLegacyProject(groupDest, {
  collection: [{ key: "name", value: SAMPLE_NAME }, { key: "description", value: "Project notes." }],
  collectiondata: [
    {
      num: 1,
      seed: 1,
      collection: { name: "Alpha Series", description: "First series notes." },
      properties: {},
    },
    {
      num: 2,
      seed: 2,
      collection: { name: "Beta Series", description: "Second series notes." },
      properties: {},
    },
  ],
});

const parsedGroup = parseLegacyProject(groupDest);
const rawGroup = JSON.parse(fs.readFileSync(parsedGroup.sourceFile, "utf8"));
assert.strictEqual(shouldGroupLegacyRowsByProject(rawGroup.collectiondata), true);
const groups = groupLegacyCollectionRows(rawGroup.collectiondata, parsedGroup);
assert.strictEqual(groups.size, 1);
assert.strictEqual(groups.values().next().value.length, rawGroup.collectiondata.length);

const reconvert = reconvertLegacyProject(groupDest);
assert.strictEqual(reconvert.reconverted, true);
assert.ok(reconvert.collections?.imported, "re-convert rebuilds collections");

const cols = listCollectionPad2s(groupDest);
assert.strictEqual(cols.length, 1, "rows collapse to one collection");
assert.strictEqual(cols[0].pieceCount, 2, "all pieces in one collection");
assert.strictEqual(cols[0].name, SAMPLE_NAME);

const groupedColl = readCollection(groupDest, cols[0].pad2);
assert.strictEqual(groupedColl.pieceRecords.length, 2);
assert.strictEqual(groupedColl.values.collection_name.value, SAMPLE_NAME);
assert.strictEqual(
  groupedColl.pieceRecords[0].values.description.value,
  "First series notes.",
);
assert.strictEqual(
  groupedColl.pieceRecords[0].values.collection_name.value,
  "Alpha Series",
);
assert.strictEqual(
  groupedColl.pieceRecords[1].values.collection_name.value,
  "Beta Series",
);
assert.notStrictEqual(
  groupedColl.pieceRecords[0].values.collection_name.value,
  groupedColl.pieceRecords[1].values.collection_name.value,
);

fs.rmSync(tmpGroup, { recursive: true, force: true });

const tmpCert = makeTempLegacyRoot("legacy-cert-");
const certDest = path.join(tmpCert, SAMPLE_NAME);
writeLegacyProject(certDest, {
  codeblocks: [
    { name: "setup", content: "function Setup() {}\n" },
    { name: "draw", content: "function Draw() {}\n" },
    { name: "functions", content: "" },
    { name: "cert", content: "function CERT() { /* certificate */ }\n" },
  ],
  collectiondata: [
    {
      num: 1,
      seed: 3,
      collection: { name: SAMPLE_NAME },
      properties: {},
    },
  ],
});
const parsedCert = parseLegacyProject(certDest);
assert.ok(parsedCert.codeblocks.cert, "cert codeblock in synthetic legacy data");
assert.ok(parsedCert.codeblocks.cert.includes("CERT"), "cert block defines CERT");

reconvertLegacyProject(certDest);
const certJs = fs.readFileSync(path.join(certDest, "cert.js"), "utf8");
assert.ok(certJs.length > 10, "re-convert writes cert.js from legacy cert block");
assert.ok(certJs.includes("CERT"), "cert.js contains certificate draw code");

fs.rmSync(tmpCert, { recursive: true, force: true });

console.log("legacy_collection_import.test.js: ok");
