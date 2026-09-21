const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  resolveUserDataDir,
  seedDevUserDataFromRelease,
} = require("./user_data_profile.js");

const base = path.join("C:", "Users", "test", "AppData", "Roaming", "Construct²");
assert.strictEqual(resolveUserDataDir(base, { isPackaged: true }), base);
assert.strictEqual(
  resolveUserDataDir(base, { isPackaged: false }),
  base + "-dev",
);
assert.strictEqual(
  resolveUserDataDir(base + "-dev", { isPackaged: false }),
  base + "-dev",
);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "c2-userdata-"));
const release = path.join(tmp, "Construct2");
const dev = path.join(tmp, "Construct2-dev");
fs.mkdirSync(release);
fs.writeFileSync(path.join(release, "workspace.json"), '{"roots":[]}', "utf8");
fs.writeFileSync(path.join(release, "window-state.json"), "{}", "utf8");

const first = seedDevUserDataFromRelease(release, dev);
assert.strictEqual(first.copied, true);
assert.ok(fs.existsSync(path.join(dev, "workspace.json")));
assert.ok(fs.existsSync(path.join(dev, "window-state.json")));

const second = seedDevUserDataFromRelease(release, dev);
assert.strictEqual(second.copied, false);
assert.strictEqual(second.reason, "dev-already");

fs.rmSync(tmp, { recursive: true, force: true });
console.log("user_data_profile.test.js: ok");
