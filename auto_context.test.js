const assert = require("assert");
const {
  getEffectiveValueAutoEntry,
  buildAutoResolveContext,
  collectAutoPeers,
  buildResolvedAutoPrompt,
  mergeValueAutoLevels,
} = require("./auto_context.js");

const collection = {
  name: "Test Collection",
  autoBrief: "Night gardens at the edge of the field",
  autoSettings: {
    includePeerExamples: true,
    peerExampleMax: 5,
    peerExampleKeys: ["name", "description"],
  },
  values: {
    collection_name: { value: "DemoCollection", use: true },
  },
  fixedProperties: {},
  pieceRecords: [
    {
      id: "p1",
      num: 1,
      displayName: "Quiet Harbor",
      seed: 100,
      fixedProperties: { Theme: "Calm", Mode: "Bright" },
      values: {
        num: { value: "0001", use: true },
        name: { value: "Quiet Harbor", use: true },
        description: {
          value: "a layered field of light and motion in quiet geometry",
          use: true,
        },
      },
    },
    {
      id: "p2",
      num: 2,
      displayName: "Sharp Echo",
      seed: 200,
      fixedProperties: { Theme: "Warm", Mode: "Cool" },
      values: {
        num: { value: "0002", use: true },
        name: { value: "Sharp Echo", use: true },
        description: {
          value: "a sharp echo across a broken grid of signals",
          use: true,
        },
      },
    },
    {
      id: "p3",
      num: 3,
      displayName: "Piece 0003",
      seed: 300,
      fixedProperties: { Theme: "Calm", Mode: "Bright" },
      values: {
        num: { value: "0003", use: true },
        name: { value: "", use: false },
        description: { value: "", use: false },
      },
    },
  ],
};

const devBuildValueLevels = {
  default: {},
  collection: {},
  piece: {},
  override: {},
};

const devPropertyLevels = {
  viewer: {},
  collection: {},
  piece: {},
  override: {},
};

const valueAutoLevels = mergeValueAutoLevels(
  {
    default: {},
    collection: {
      description: {
        enabled: true,
        prompt:
          "Max 200 chars for [values.name]. Match [examples.description]. Theme: [collection.brief]. Style [properties.Theme] / [properties.Mode].",
      },
    },
  },
  {},
);

const target = collection.pieceRecords[2];

const entry = getEffectiveValueAutoEntry("description", valueAutoLevels);
assert.ok(entry);
assert.strictEqual(entry.level, "collection");

const ctx = buildAutoResolveContext({
  devBuildValueLevels,
  devPropertyLevels,
  devSeed: 42,
  collection,
  pieceRecord: target,
});
assert.strictEqual(ctx.collection.brief, "Night gardens at the edge of the field");
assert.strictEqual(ctx.piece.num, "0003");
assert.strictEqual(ctx.properties.Theme, "Calm");
assert.strictEqual(ctx.properties.Mode, "Bright");

const peers = collectAutoPeers({
  collection,
  pieceRecord: target,
  devBuildValueLevels,
  devPropertyLevels,
  devSeed: 42,
  targetKey: "description",
  peerExampleKeys: ["name", "description"],
  maxPeers: 5,
  mode: "single",
});
assert.strictEqual(peers.length, 2);
assert.strictEqual(peers[0].num, "0001");
assert.ok(peers[0].properties.Theme);

const resolved = buildResolvedAutoPrompt({
  key: "description",
  valueAutoLevels,
  devBuildValueLevels,
  devPropertyLevels,
  devSeed: 42,
  collection,
  pieceRecord: target,
});
assert.strictEqual(resolved.ok, true);
assert.ok(resolved.resolvedPrompt.includes("Night gardens at the edge of the field"));
assert.ok(resolved.resolvedPrompt.includes("0001:"));
assert.ok(resolved.resolvedPrompt.includes("quiet geometry"));
assert.ok(resolved.resolvedPrompt.includes("Calm"));
assert.ok(resolved.peerBlock.includes("0001"));
assert.ok(resolved.peerBlock.includes("Quiet Harbor"));
assert.ok(!resolved.peerBlock.includes("alignment:"));
assert.ok(!resolved.peerBlock.includes("(Align:"));
assert.ok(resolved.fullUserMessage.includes(resolved.peerBlock));

const collEmpty = getEffectiveValueAutoEntry("description", {
  default: { description: { enabled: true, prompt: "Default primer." } },
  collection: { description: { enabled: true, prompt: "" } },
});
assert.ok(collEmpty);
assert.strictEqual(collEmpty.level, "default");
assert.strictEqual(collEmpty.prompt, "Default primer.");

console.log("auto_context tests OK");
