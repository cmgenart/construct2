const assert = require("assert");
const path = require("path");
const {
  CANONICAL_SOURCE_NAMES,
  BUILDER_SOURCE_NAMES,
  listInspectableSourceFiles,
  discoverAllSourceEntries,
  getEffectiveCanonicalSources,
} = require("./source_inventory.js");
const { SOURCE_FILE_NAMES, discoverImportGraph } = require("./import_resolve.js");

const MINIMAL = path.resolve(__dirname, "templates", "projects", "cc-v3-minimal");

assert.deepStrictEqual(SOURCE_FILE_NAMES, CANONICAL_SOURCE_NAMES);
assert.ok(BUILDER_SOURCE_NAMES.includes("collection.js"));
assert.ok(CANONICAL_SOURCE_NAMES.includes("cert.js"));

const sources = listInspectableSourceFiles(MINIMAL);
const paths = sources.filter((f) => f.exists).map((f) => f.path);
assert.ok(paths.includes("setup.js"), "setup.js listed for template");
assert.ok(!paths.includes("dev.json"), "dev.json not in source list");

const effective = getEffectiveCanonicalSources(MINIMAL);
const graph = discoverImportGraph(MINIMAL, effective);
assert.ok(graph.size >= 0, "import graph runs on template");

const entries = discoverAllSourceEntries(MINIMAL, effective);
const canonical = entries.filter((e) => e.kind === "canonical").map((e) => e.path);
assert.deepStrictEqual(canonical, CANONICAL_SOURCE_NAMES);

console.log("source_inventory.test.js: ok");
