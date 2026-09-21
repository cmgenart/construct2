"use strict";
const assert = require("assert");
const {
  stripEphemeralParamValues,
  stripDeprecatedParamValues,
  stripPersistedParamValues,
  ephemeralParamKeys,
  deprecatedParamKeys,
} = require("./param_persist.js");

const schema = [
  { name: "go", type: "PARAM-BUTTON" },
  { name: "vol", type: "PARAM-FLOAT" },
];

assert.deepStrictEqual(ephemeralParamKeys(schema), ["go"]);

const stripped = stripEphemeralParamValues({ go: 3, vol: 0.5, extra: 1 }, schema);
assert.strictEqual(stripped.go, undefined);
assert.strictEqual(stripped.vol, 0.5);
assert.strictEqual(stripped.extra, 1);

const depErrors = [
  {
    message: "PARAM-COLOR is deprecated",
    deprecatedType: "PARAM-COLOR",
    deprecatedName: "legacy_tint",
  },
];
assert.deepStrictEqual(deprecatedParamKeys(depErrors), ["legacy_tint"]);
const depStripped = stripDeprecatedParamValues(
  { legacy_tint: "#aabbcc", vol: 0.5 },
  depErrors,
);
assert.strictEqual(depStripped.legacy_tint, undefined);
assert.strictEqual(depStripped.vol, 0.5);

const both = stripPersistedParamValues(
  { go: 2, legacy_tint: "#fff", vol: 0.25 },
  schema,
  depErrors,
);
assert.strictEqual(both.go, undefined);
assert.strictEqual(both.legacy_tint, undefined);
assert.strictEqual(both.vol, 0.25);

console.log("param_persist tests OK");
