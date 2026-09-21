const assert = require("assert");
const { applyDerivedBuildValues, parsePieceNum } = require("./build_value_derived.js");
const { COMPUTED_KEYS } = require("./build_value_scan.js");

assert.strictEqual(parsePieceNum({ num: "0001" }), 1);
assert.strictEqual(parsePieceNum({ num: "42" }), 42);

const derived = applyDerivedBuildValues({ num: "1", name: "Test" });
assert.strictEqual(derived.num_pad2, "01");
assert.strictEqual(derived.num_pad3, "001");
assert.strictEqual(derived.num_pad4, "0001");
assert.strictEqual(derived.name, "Test");

assert.ok(COMPUTED_KEYS.has("num_pad3"));
assert.ok(COMPUTED_KEYS.has("property_names"));

console.log("build_value_derived.test.js: ok");
