"use strict";
const assert = require("assert");
const {
  fromNative,
  toNative,
  formatReadout,
  hsvaEqual,
  rgbToHsv,
  hsvToRgb,
  parseHexString,
  parseClipboardHsva,
  formatClipboardHsva,
  toCssColor,
  migrateColorWireValue,
  migrateParamValues,
} = require("./param_color.js");
const { scanParamSources } = require("./param_scan.js");

// --- RGB <-> HSV round-trip ---
const rgb = { r: 255, g: 128, b: 64, a: 1 };
const hsva = fromNative("PARAM-RGB", rgb);
assert.ok(hsva);
const back = toNative("PARAM-RGB", hsva);
assert.strictEqual(back.r, rgb.r);
assert.strictEqual(back.g, rgb.g);
assert.strictEqual(back.b, rgb.b);

// --- HSV wire ---
const hsv = { h: 200, s: 0.5, v: 0.9, a: 1 };
assert.deepStrictEqual(toNative("PARAM-HSV", fromNative("PARAM-HSV", hsv)), {
  h: 200,
  s: 0.5,
  v: 0.9,
  a: 1,
});

// --- HSL wire (picker uses HSVA; round-trip preserves colour, not exact S/L) ---
const hsl = { h: 180, s: 0.4, l: 0.6, a: 1 };
const hslHsva = fromNative("PARAM-HSL", hsl);
assert.ok(hslHsva);
const hslBack = toNative("PARAM-HSL", hslHsva);
assert.ok(hsvaEqual(hslHsva, fromNative("PARAM-HSL", hslBack)));
assert.ok(formatReadout("PARAM-HSL", hsl).includes("0.4"));
assert.ok(toCssColor("PARAM-HSL", hsl).startsWith("rgb"));

// --- HEX ---
const hex = "#336699";
const fromHex = fromNative("PARAM-HEX", hex);
assert.ok(fromHex);
assert.strictEqual(toNative("PARAM-HEX", fromHex), "#336699");

assert.ok(parseHexString("aabbcc"));
assert.strictEqual(parseHexString("not-a-color"), null);

// --- Readout ---
assert.ok(formatReadout("PARAM-HSV", hsv).includes("0.5"));
assert.ok(formatReadout("PARAM-RGB", rgb).includes("255"));

// --- Clipboard HSVA ---
const clip = formatClipboardHsva({ h: 10, s: 0.25, v: 0.75, a: 0.5 });
const parsed = parseClipboardHsva(clip);
assert.ok(parsed && hsvaEqual(parsed, { h: 10, s: 0.25, v: 0.75, a: 0.5 }));

// --- CSS swatch ---
assert.ok(toCssColor("PARAM-RGB", rgb).startsWith("rgb"));

// --- param_scan HSV + deprecated COLOR ---
let r = scanParamSources([
  {
    file: "d.js",
    content: '//PARAM-HSV:["qa_hsv", 200, 0.5, 0.9, 1]\n',
  },
]);
assert.strictEqual(r.errors.length, 0);
assert.deepStrictEqual(r.schema[0].default, { h: 200, s: 0.5, v: 0.9, a: 1 });
assert.strictEqual(r.schema[0].h, 200);

r = scanParamSources([
  { file: "d.js", content: '//PARAM-COLOR:["x", "#ff00aa"]\n' },
]);
assert.strictEqual(r.schema.length, 0);
assert.strictEqual(r.errors.length, 1);
assert.strictEqual(r.errors[0].deprecatedName, "x");
assert.ok(r.errors[0].message.includes("deprecated"));

r = scanParamSources([
  { file: "d.js", content: '//PARAM-HSL:["qa_hsl", 180, 0.4, 0.6, 1]\n' },
]);
assert.strictEqual(r.errors.length, 0);
assert.deepStrictEqual(r.schema[0].default, { h: 180, s: 0.4, l: 0.6, a: 1 });

// --- legacy HSV stored as RGB components ---
const legacyRgb = { r: 255, g: 128, b: 64, a: 1 };
const migrated = migrateColorWireValue("PARAM-HSV", legacyRgb, { h: 0, s: 0, v: 0.5, a: 1 });
assert.ok(migrated && typeof migrated.h === "number" && "v" in migrated && !("r" in migrated));
const migBatch = migrateParamValues(
  { qa_hsv: legacyRgb },
  [{ name: "qa_hsv", type: "PARAM-HSV", default: { h: 0, s: 0, v: 0.5, a: 1 } }],
);
assert.strictEqual(migBatch.changed, true);
assert.ok(!("r" in migBatch.values.qa_hsv));

console.log("param_color tests OK");
