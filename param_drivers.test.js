const assert = require("assert");
const path = require("path");
const fs = require("fs");
const {
  scanParamDrivers,
  isValidDriverId,
  seedDriversReadme,
  README_NAME,
  isValidDriverStoreBasename,
  readDriverStoreJson,
  writeDriverStoreJson,
  driverHtmlPath,
} = require("./param_drivers.js");

const tmp = path.join(__dirname, "_test_parameters");
const tpl = path.join(__dirname, "templates", "DRIVERS_README.txt");

delete process.env.ADVBUILDER_USER_DATA;
delete process.env.ADVBUILDER_PROJECT_NAME;

function rmDir(d) {
  if (!fs.existsSync(d)) return;
  try {
    fs.rmSync(d, { recursive: true, force: true });
  } catch (_) {
    /* Windows/Dropbox may lock temp dirs briefly */
  }
}

rmDir(tmp);
fs.mkdirSync(path.join(tmp, "parameters"), { recursive: true });
fs.writeFileSync(path.join(tmp, "parameters", "foo.html"), "<html></html>");
fs.writeFileSync(path.join(tmp, "parameters", "bad id.html"), "<html></html>");

assert.deepStrictEqual(scanParamDrivers(tmp), ["spamTester", "foo"]);
assert.strictEqual(isValidDriverId("foo"), true);
assert.strictEqual(isValidDriverId("../x"), false);

seedDriversReadme(tmp, tpl);
assert(fs.existsSync(path.join(tmp, "parameters", README_NAME)));

assert.strictEqual(isValidDriverStoreBasename("xaiChat", "xaiChat.memory.json"), true);
assert.strictEqual(isValidDriverStoreBasename("xaiChat", "xaiChat.demo-alpha.memory.json"), true);
assert.strictEqual(isValidDriverStoreBasename("xaiChat", "other.memory.json"), false);
assert.strictEqual(isValidDriverStoreBasename("xaiChat", "xaiChat.BAD.memory.json"), false);

const empty = readDriverStoreJson(tmp, "xaiChat", "xaiChat.memory.json");
assert.strictEqual(empty.ok, true);
assert.deepStrictEqual(empty.data, {});

const w1 = writeDriverStoreJson(tmp, "xaiChat", "xaiChat.memory.json", {
  version: 4,
  entries: [{ slug: "a", name: "A", alignment: "Stable-Balanced" }],
});
assert.strictEqual(w1.ok, true);
const w2 = writeDriverStoreJson(tmp, "xaiChat", "xaiChat.a.memory.json", {
  launchCount: 1,
  condensedHistory: "hi",
});
assert.strictEqual(w2.ok, true);
assert.strictEqual(w2.data.launchCount, 1);
const r2 = readDriverStoreJson(tmp, "xaiChat", "xaiChat.a.memory.json");
assert.strictEqual(r2.data.condensedHistory, "hi");

fs.writeFileSync(path.join(tmp, "parameters", "projectOnly.html"), "<html></html>");
fs.writeFileSync(path.join(tmp, "parameters", "override.html"), "<html>project</html>");

const merged = scanParamDrivers(tmp);
assert(merged.includes("foo"));
assert(merged.includes("projectOnly"));
assert(merged.includes("override"));
if (fs.existsSync(path.join(__dirname, "parameters", "spamTester.html"))) {
  assert(merged.includes("spamTester"));
  assert(merged.indexOf("spamTester") < merged.indexOf("projectOnly"));
}
assert.match(String(driverHtmlPath(tmp, "override")), /_test_parameters[\\/]parameters[\\/]override\.html$/);

rmDir(tmp);
console.log("param_drivers tests OK");
