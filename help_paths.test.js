const assert = require("assert");
const path = require("path");
const {
  resolveHelpFile,
  readHelpFile,
  urlForHelpRel,
  resolveHelpHref,
} = require("./help_paths.js");

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

const fromUser = "docs/user/README.md";
assert.strictEqual(
  resolveHelpHref(fromUser, "./GETTING-STARTED.md").rel,
  "docs/user/GETTING-STARTED.md",
);
assert.strictEqual(resolveHelpHref(fromUser, "../CORE.md").rel, "docs/CORE.md");
assert.strictEqual(
  resolveHelpHref(fromUser, "../../runtimes/cc-v3.23.getting-started.md").rel,
  "runtimes/cc-v3.23.getting-started.md",
);
assert.strictEqual(
  resolveHelpHref(fromUser, "../../lib/AsciiCore.getting-started.md").rel,
  "lib/AsciiCore.getting-started.md",
);
assert.strictEqual(resolveHelpHref(fromUser, "../CORE.md").kind, "doc");
assert.strictEqual(resolveHelpHref(fromUser, "https://example.com").kind, "external");
assert.strictEqual(resolveHelpHref(fromUser, "#anchor").kind, "hash");
assert.ok(resolveHelpFile(root, "STAGING.md"));
assert.strictEqual(urlForHelpRel("STAGING.md"), "/STAGING.md");
assert.strictEqual(resolveHelpHref("docs/CORE.md", "../STAGING.md").rel, "STAGING.md");

console.log("help_paths.test.js: ok");
