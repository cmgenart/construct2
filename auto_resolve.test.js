const assert = require("assert");
const {
  resolvePrompt,
  extractPromptDependencies,
  detectValueAutoCycles,
  buildPeerExamplesBlock,
} = require("./auto_resolve.js");

const ctx = {
  values: { name: "Quiet Harbor", theme_overview: "Night gardens" },
  properties: { Theme: "Calm", Mode: "Bright" },
  collection: { brief: "Night gardens", name: "Demo 01" },
  piece: { num: "0003", displayName: "0003: Quiet Harbor" },
  examples: { description: "0001: poetic; 0002: sharp" },
};

const r1 = resolvePrompt(
  "Name for [properties.Theme] — [collection.brief]",
  ctx,
);
assert.strictEqual(r1.text, "Name for Calm — Night gardens");
assert.deepStrictEqual(r1.unknownTokens, []);

const r2 = resolvePrompt("[values.name] / [values.missing]", ctx);
assert.strictEqual(r2.text, "Quiet Harbor / [values.missing]");
assert.strictEqual(r2.unknownTokens.length, 1);

const deps = extractPromptDependencies(
  "Max 200. Primer for [values.name]. Match [examples.description]. Theme: [collection.brief]",
);
assert.deepStrictEqual(deps.values, ["name"]);
assert.strictEqual(deps.properties.length, 0);

const cycle = detectValueAutoCycles({
  name: { prompt: "x [values.description]" },
  description: { prompt: "y [values.name]" },
});
assert.ok(Array.isArray(cycle) && cycle.length >= 2);

const block = buildPeerExamplesBlock(
  [
    {
      num: "0001",
      values: {
        num: "0001",
        name: "Quiet Harbor",
        description: "a layered field of light",
      },
      properties: { Theme: "Calm", Mode: "Bright" },
    },
  ],
  "description",
);
assert.ok(block.includes("0001"));
assert.ok(block.includes("Quiet Harbor"));
assert.ok(block.includes("num: 0001"));
assert.ok(block.includes("description: a layered field of light"));
assert.ok(!block.includes("alignment:"));
assert.ok(!block.includes("(Align:"));

const customBlock = buildPeerExamplesBlock(
  [
    {
      num: "0002",
      values: { name: "Mirror", craft: "handmade" },
      properties: {},
    },
  ],
  "name",
  { template: "[piece.num] [values.name] / [values.craft]" },
);
assert.strictEqual(customBlock.includes("0002 Mirror / handmade"), true);
assert.ok(!customBlock.includes("Align"));

console.log("auto_resolve tests OK");
