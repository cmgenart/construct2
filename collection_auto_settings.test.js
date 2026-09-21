const assert = require("assert");
const {
  defaultAutoSettings,
  normalizeAutoSettings,
} = require("./collection_fs.js");

const d = defaultAutoSettings();
assert.strictEqual(d.includePeerExamples, true);
assert.strictEqual(d.peerExampleMax, 5);
assert.deepStrictEqual(d.peerExampleKeys, ["name", "description"]);
assert.ok(d.peerExampleTemplate.includes("[values.name]"));

const n = normalizeAutoSettings({
  includePeerExamples: false,
  peerExampleMax: 99,
  peerExampleKeys: ["name", "description", "craft"],
});
assert.strictEqual(n.includePeerExamples, false);
assert.strictEqual(n.peerExampleMax, 20);
assert.deepStrictEqual(n.peerExampleKeys, ["name", "description", "craft"]);

const emptyKeys = normalizeAutoSettings({ peerExampleKeys: [] });
assert.deepStrictEqual(emptyKeys.peerExampleKeys, ["name", "description"]);

const customTemplate = normalizeAutoSettings({
  peerExampleTemplate: "[piece.num]: [values.name]",
});
assert.strictEqual(customTemplate.peerExampleTemplate, "[piece.num]: [values.name]");

console.log("collection_auto_settings tests OK");
