const assert = require("assert");
const path = require("path");
const {
  resolveBuilderHostKind,
  HOST_KINDS,
  sameProjectPath,
  occupantError,
} = require("./builder_host.js");

assert.deepStrictEqual(HOST_KINDS, ["spawn", "utility", "ipc"]);

assert.strictEqual(resolveBuilderHostKind({ isPackaged: false, envHost: "" }), "spawn");
assert.strictEqual(resolveBuilderHostKind({ isPackaged: true, envHost: "" }), "utility");
assert.strictEqual(resolveBuilderHostKind({ isPackaged: true, envHost: "spawn" }), "spawn");
assert.strictEqual(resolveBuilderHostKind({ isPackaged: false, envHost: "utility" }), "utility");
assert.strictEqual(resolveBuilderHostKind({ isPackaged: true, envHost: "ipc" }), "ipc");
assert.strictEqual(resolveBuilderHostKind({ isPackaged: true, envHost: "UTILITYx" }), "utility");

const demoA = "C:\\dev\\genart\\construct-demos\\construct\\jellyfish";
const demoB = "c:/dev/genart/construct-demos/construct/jellyfish";
assert.strictEqual(sameProjectPath(demoA, demoB), true);
assert.strictEqual(sameProjectPath(demoA, "C:\\other\\project"), false);
assert.match(
  occupantError(3100, { projectName: "perlin-ascii" }),
  /perlin-ascii/,
);

console.log("builder_host.test.js: ok");
