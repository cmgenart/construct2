"use strict";
const assert = require("assert");
const { coerceParamValue, snapToStep } = require("./param_coerce.js");

const vol = {
  name: "vol",
  type: "PARAM-FLOAT",
  low: 0,
  high: 1,
  step: 0.01,
  default: 0,
};

assert.strictEqual(coerceParamValue(vol, 1), 1);
assert.strictEqual(coerceParamValue(vol, 1.5), 1);
assert.strictEqual(coerceParamValue(vol, "0.25"), 0.25);
assert.strictEqual(coerceParamValue(vol, "nope"), null);

const eye = { name: "eyex", type: "PARAM-FLOAT", low: -1, high: 1, step: 0.01, default: 0 };
assert.strictEqual(coerceParamValue(eye, 2), 1);

const hold = { name: "hold", type: "PARAM-STRING", default: null };
assert.strictEqual(coerceParamValue(hold, "hello"), "hello");
assert.strictEqual(coerceParamValue(hold, null), null);

const min = { name: "min", type: "PARAM-BOOLEAN", default: 0 };
assert.strictEqual(coerceParamValue(min, 1), 1);
assert.strictEqual(coerceParamValue(min, true), 1);
assert.strictEqual(coerceParamValue(min, 2), null);

const choice = {
  name: "c",
  type: "PARAM-CHOICE",
  choices: ["red", "green"],
  default: "red",
};
assert.strictEqual(coerceParamValue(choice, "green"), "green");
assert.strictEqual(coerceParamValue(choice, "blue"), null);

assert.ok(Math.abs(snapToStep(0.37, 0, 1, 0.05) - 0.35) < 1e-9);

const look = {
  name: "look",
  type: "PARAM-VEC2",
  min: { x: -1, y: -1 },
  max: { x: 1, y: 1 },
  step: 0.01,
  default: { x: 0, y: 0 },
};
const vLook = coerceParamValue(look, { x: 0.5, y: -0.2 });
assert.strictEqual(vLook[0], 0.5);
assert.ok(Math.abs(vLook[1] - -0.2) < 1e-9);
const vArr = coerceParamValue(look, [0.5, -0.2]);
assert.strictEqual(vArr[0], 0.5);
assert.ok(Math.abs(vArr[1] - -0.2) < 1e-9);
assert.deepStrictEqual(coerceParamValue(look, { x: 2, y: 0 }), [1, 0]);
assert.strictEqual(coerceParamValue(look, "bad"), null);

console.log("param_coerce tests OK");
