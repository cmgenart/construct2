const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  captureExtForMime,
  captureFilename,
  captureStamp,
  ensureCapturesDir,
  resolveCaptureFile,
  writeCapture,
} = require("./capture_store.js");

assert.strictEqual(captureExtForMime("video/mp4;codecs=avc1.42E01E"), "mp4");
assert.strictEqual(captureExtForMime("video/webm;codecs=vp9"), "webm");
assert.strictEqual(captureExtForMime("image/png"), "png");
assert.strictEqual(captureExtForMime("video/ogg"), null);

const stamp = captureStamp(new Date(2026, 9, 14, 20, 5, 9));
assert.strictEqual(stamp, "20261014-200509");
assert.strictEqual(
  captureFilename("Inkoder", "mp4", new Date(2026, 9, 14, 20, 5, 9)),
  "Inkoder-20261014-200509.mp4",
);
assert.strictEqual(
  captureFilename("Pen pressure", "png", new Date(2026, 9, 14, 20, 5, 9)),
  "Pen_pressure-20261014-200509.png",
);
assert.strictEqual(captureFilename("nope", "gif", new Date()), null);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "c2-cap-"));
const date = new Date(2026, 9, 14, 1, 2, 3);
const a = writeCapture(dir, { ext: "mp4", projectName: "inkoder", bytes: Buffer.from("mp4-bytes"), date });
assert.strictEqual(a.ok, true);
assert.strictEqual(a.rel, "captures/inkoder-20261014-010203.mp4");
assert.strictEqual(fs.readFileSync(path.join(dir, a.rel)).toString(), "mp4-bytes");
const b = writeCapture(dir, { ext: "mp4", projectName: "inkoder", bytes: Buffer.from("second"), date });
assert.strictEqual(b.name, "inkoder-20261014-010203-2.mp4");
const png = writeCapture(dir, { ext: "png", projectName: "inkoder", bytes: Buffer.from("png"), date });
assert.strictEqual(png.rel, "captures/inkoder-20261014-010203.png");
const bad = writeCapture(dir, { ext: "gif", projectName: "inkoder", bytes: Buffer.from("x"), date });
assert.strictEqual(bad.ok, false);
assert.strictEqual(bad.status, 400);
assert.strictEqual(resolveCaptureFile(dir, a.name), path.join(dir, "captures", a.name));
assert.strictEqual(resolveCaptureFile(dir, "../dev.json"), null);
assert.strictEqual(resolveCaptureFile(dir, "missing.mp4"), null);

const empty = fs.mkdtempSync(path.join(os.tmpdir(), "c2-cap-empty-"));
assert.strictEqual(ensureCapturesDir(empty), path.join(empty, "captures"));
assert.strictEqual(fs.statSync(path.join(empty, "captures")).isDirectory(), true);

console.log("capture_store.test.js: ok");
