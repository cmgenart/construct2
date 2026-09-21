const assert = require("assert");
const path = require("path");
const { resolveHelpFile, readHelpFile, urlForHelpRel } = require("./help_paths.js");

const root = __dirname;

assert.ok(resolveHelpFile(root, "docs/user/GETTING-STARTED.md"));
assert.ok(resolveHelpFile(root, "runtimes/cc-v3.23.getting-started.md"));
assert.ok(resolveHelpFile(root, "lib/AsciiCore.getting-started.md"));
assert.strictEqual(resolveHelpFile(root, "runtimes/cc-v3.23.html"), null);
assert.strictEqual(resolveHelpFile(root, "../package.json"), null);
assert.strictEqual(resolveHelpFile(root, "docs/../package.json"), null);

const got = readHelpFile(root, "docs/user/README.md");
assert.ok(got && got.text.includes("Construct² help"));
assert.strictEqual(urlForHelpRel("docs/user/README.md"), "/docs/user/README.md");
assert.strictEqual(
  urlForHelpRel("runtimes/cc-v3.23.getting-started.md"),
  "/runtimes/cc-v3.23.getting-started.md",
);

console.log("help_paths.test.js: ok");
