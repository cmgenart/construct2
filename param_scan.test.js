"use strict";
const assert = require("assert");
const {
  scanParamSources,
  renderParamsMarkdown,
  endIndexOfJsonArray,
} = require("./param_scan.js");

// --- endIndexOfJsonArray ---
assert.strictEqual(
  endIndexOfJsonArray('["a","]"]', 0),
  9,
  "bracket inside string",
);
assert.strictEqual(endIndexOfJsonArray("[1,2,3]", 0), 7);

// --- scanParamSources ---
let r = scanParamSources([
  {
    file: "setup.js",
    content:
      '//PARAM-FLOAT:["x",0,1,0.1]  desc here\n//PARAM-BUTTON:["go"]\n',
  },
]);
assert.strictEqual(r.errors.length, 0);
assert.strictEqual(r.schema.length, 2);
assert.strictEqual(r.schema[0].name, "x");
assert.strictEqual(r.schema[0].type, "PARAM-FLOAT");
assert.strictEqual(r.schema[0].description, "desc here");
assert.strictEqual(r.schema[1].type, "PARAM-BUTTON");

r = scanParamSources([
  { file: "a.js", content: '//PARAM-FLOAT:["x",0,1,0.1]\n' },
  { file: "b.js", content: '//PARAM-CHOICE:["x","a","b"]\n' },
]);
assert.strictEqual(r.errors.length, 1);
assert.ok(r.errors[0].message.includes("Duplicate"));

r = scanParamSources([
  { file: "x.js", content: '// PARAM-FLOAT:["n",0,1,1]\n' },
]);
assert.strictEqual(r.schema.length, 0);

r = scanParamSources([
  { file: "x.js", content: '//PARAM-UNKNOWN:["a"]\n' },
]);
assert.strictEqual(r.errors.length, 1);

r = scanParamSources([
  {
    file: "x.js",
    content: '//PARAM-STRING:["s","hello"]  trailing\n',
  },
]);
assert.strictEqual(r.schema[0].default, "hello");
assert.strictEqual(r.schema[0].description, "trailing");

// --- renderParamsMarkdown ---
const md = renderParamsMarkdown("TestProj", [], []);
assert.ok(md.includes("No `//PARAM-*`"));
const md2 = renderParamsMarkdown(
  "P",
  [{ name: "n", type: "PARAM-NUMBER", default: 3, description: "d", declaredIn: { file: "f", line: 1 } }],
  [],
);
r = scanParamSources([
  {
    file: "d.js",
    content: '//PARAM-FLOAT:["vol",0,0,1,0.01]\n//PARAM-STRING:["hold",null]\n',
  },
]);
assert.strictEqual(r.errors.length, 0, r.errors.map((e) => e.message).join("; "));
assert.strictEqual(r.schema[0].name, "vol");
assert.strictEqual(r.schema[0].low, 0);
assert.strictEqual(r.schema[0].high, 1);
assert.strictEqual(r.schema[0].default, 0);
r = scanParamSources([
  { file: "x.js", content: '//PARAM-DROPDOWN:["d","a","b"]\n' },
]);
assert.strictEqual(r.errors.length, 0);
assert.strictEqual(r.schema[0].type, "PARAM-DROPDOWN");
assert.deepStrictEqual(r.schema[0].choices, ["a", "b"]);

r = scanParamSources([{ file: "b.js", content: '//PARAM-BOOLEAN:["b", true]\n' }]);
assert.strictEqual(r.errors.length, 0);
assert.strictEqual(r.schema[0].default, 1);
r = scanParamSources([{ file: "b.js", content: '//PARAM-BOOLEAN:["b", 0]\n' }]);
assert.strictEqual(r.schema[0].default, 0);

r = scanParamSources([
  {
    file: "c.js",
    content: '//PARAM-RGB:["rgb", 10, 20, 30, 1]\n//PARAM-HSV:["hsv", 180, 0.25, 0.5, 1]\n',
  },
]);
assert.strictEqual(r.errors.length, 0);
assert.deepStrictEqual(r.schema[0].default, { r: 10, g: 20, b: 30, a: 1 });
assert.deepStrictEqual(r.schema[1].default, { h: 180, s: 0.25, v: 0.5, a: 1 });

r = scanParamSources([
  { file: "x.js", content: '//PARAM-COLOR:["old", "#aabbcc"]\n' },
]);
assert.strictEqual(r.schema.length, 0);
assert.strictEqual(r.errors.length, 1);
assert.strictEqual(r.errors[0].deprecatedName, "old");
assert.strictEqual(r.errors[0].deprecatedType, "PARAM-COLOR");
assert.ok(r.errors[0].message.includes("PARAM-RGB"));
assert.ok(r.errors[0].message.includes("PARAM-HEX"));

r = scanParamSources([
  {
    file: "h.js",
    content: '//PARAM-HSL:["qa_hsl", 180, 0.4, 0.6, 1]  hue sat light alpha\n',
  },
]);
assert.strictEqual(r.errors.length, 0);
assert.strictEqual(r.schema[0].type, "PARAM-HSL");
assert.deepStrictEqual(r.schema[0].default, { h: 180, s: 0.4, l: 0.6, a: 1 });
assert.strictEqual(r.schema[0].description, "hue sat light alpha");

r = scanParamSources([
  {
    file: "v.js",
    content: '//PARAM-VEC2:["look", [0,0], [-1,-1], [1,1], 0.01]  2d direction\n',
  },
]);
assert.strictEqual(r.errors.length, 0);
assert.strictEqual(r.schema[0].type, "PARAM-VEC2");
assert.deepStrictEqual(r.schema[0].default, [0, 0]);
assert.deepStrictEqual(r.schema[0].min, { x: -1, y: -1 });
assert.deepStrictEqual(r.schema[0].max, { x: 1, y: 1 });
assert.strictEqual(r.schema[0].step, 0.01);

console.log("param_scan tests OK");
