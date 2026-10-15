const assert = require("assert");
const { inkDecode } = require("./lib/inkoder_decode.js");
const { inkEncode } = require("./lib/inkoder_encode.js");

const sample = "l0_4RcR5Mcs6Ncz_w0gg_s0a0";
const lines = inkDecode(sample);
assert.strictEqual(lines.length, 1);
assert.strictEqual(lines[0].t, "l");
assert.strictEqual(lines[0].length, 3);
assert.deepStrictEqual(
  lines[0].map((p) => [p.x, p.y, p.w, p.s]),
  [
    [301, 797, 0, 0],
    [358, 772, 16, 10],
    [421, 779, 16, 0],
  ],
);
assert.strictEqual(inkEncode(lines), sample);

const made = [
  Object.assign([{ x: 100, y: 200, w: 0, s: 18 }, { x: 400, y: 220, w: 32, s: 8 }], { t: "l" }),
  Object.assign([{ x: 10.4, y: 20.6, w: 10, s: 10 }], { t: "l" }),
];
const encoded = inkEncode(made);
const back = inkDecode(encoded);
assert.strictEqual(back.length, 2);
assert.strictEqual(back[0].length, 2);
assert.strictEqual(back[0][0].w, 0);
assert.strictEqual(back[0][1].w, 32);
assert.strictEqual(back[1][0].x, 10);
assert.strictEqual(back[1][0].y, 21);
assert.strictEqual(inkEncode(back), encoded);

const fill = inkDecode("f0_00a0_c5_d3_s2");
assert.strictEqual(fill[0].t, "f");
assert.strictEqual(fill[0][0].c, 5);
assert.strictEqual(fill[0][0].d, 3);
assert.strictEqual(fill[0][0].s, 2);
assert.strictEqual(inkEncode(fill), "f0_00a0_c5_d3_s2");

assert.throws(() => inkDecode("l0_zz"));
assert.throws(() => inkDecode("nope"));
assert.deepStrictEqual(inkDecode(""), []);
assert.deepStrictEqual(inkDecode("   "), []);

console.log("inkoder_codec.test.js: ok");
