const assert = require("assert");
const path = require("path");
const fs = require("fs");
const {
  migrateDriverStoreFromParameters,
  resolveDriverStoreFilePath,
  listLegacyMemoryFiles,
  userDataDriverStoreDir,
} = require("./driver_store.js");
const { readDriverStoreJson, writeDriverStoreJson } = require("./param_drivers.js");

const tmpProject = path.join(__dirname, "_test_driver_store_project");
const tmpUserData = path.join(__dirname, "_test_driver_store_userdata");

function rmDir(d) {
  if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
}

function withEnv(env, fn) {
  const prev = {
    ADVBUILDER_USER_DATA: process.env.ADVBUILDER_USER_DATA,
    ADVBUILDER_PROJECT_NAME: process.env.ADVBUILDER_PROJECT_NAME,
  };
  Object.assign(process.env, env);
  try {
    return fn();
  } finally {
    if (prev.ADVBUILDER_USER_DATA == null) delete process.env.ADVBUILDER_USER_DATA;
    else process.env.ADVBUILDER_USER_DATA = prev.ADVBUILDER_USER_DATA;
    if (prev.ADVBUILDER_PROJECT_NAME == null) delete process.env.ADVBUILDER_PROJECT_NAME;
    else process.env.ADVBUILDER_PROJECT_NAME = prev.ADVBUILDER_PROJECT_NAME;
  }
}

rmDir(tmpProject);
rmDir(tmpUserData);
fs.mkdirSync(path.join(tmpProject, "parameters"), { recursive: true });

fs.writeFileSync(
  path.join(tmpProject, "parameters", "xaiChat.memory.json"),
  JSON.stringify(
    {
      version: 4,
      entries: [{ slug: "alpha", name: "Alpha", alignment: "Stable-Balanced" }],
    },
    null,
    2,
  ) + "\n",
);
fs.writeFileSync(
  path.join(tmpProject, "parameters", "xaiChat.alpha.memory.json"),
  JSON.stringify(
    { version: 1, slug: "alpha", name: "Alpha", launchCount: 2, condensedHistory: "hello" },
    null,
    2,
  ) + "\n",
);

assert.deepStrictEqual(listLegacyMemoryFiles(tmpProject, "xaiChat").sort(), [
  "xaiChat.alpha.memory.json",
  "xaiChat.memory.json",
]);

const migrated = withEnv(
  { ADVBUILDER_USER_DATA: tmpUserData, ADVBUILDER_PROJECT_NAME: "TestProj" },
  () => migrateDriverStoreFromParameters(tmpProject, "xaiChat"),
);
assert.strictEqual(migrated.ok, true);
assert.strictEqual(migrated.migrated, true);
assert.strictEqual(migrated.filesCopied.length, 2);
assert.strictEqual(fs.existsSync(path.join(tmpProject, "parameters", "xaiChat.memory.json")), false);

const env = { userDataRoot: tmpUserData, projectName: "TestProj" };
const storeDir = userDataDriverStoreDir(env, "xaiChat");
assert(fs.existsSync(path.join(storeDir, "xaiChat.memory.json")));
assert(fs.existsSync(path.join(storeDir, ".migration.json")));

const readViaParam = withEnv(
  { ADVBUILDER_USER_DATA: tmpUserData, ADVBUILDER_PROJECT_NAME: "TestProj" },
  () => readDriverStoreJson(tmpProject, "xaiChat", "xaiChat.alpha.memory.json"),
);
assert.strictEqual(readViaParam.ok, true);
assert.strictEqual(readViaParam.data.launchCount, 2);

const fp = withEnv(
  { ADVBUILDER_USER_DATA: tmpUserData, ADVBUILDER_PROJECT_NAME: "TestProj" },
  () => resolveDriverStoreFilePath(tmpProject, "xaiChat", "xaiChat.memory.json"),
);
assert(fp && fp.includes("driver-stores"));

const idempotent = withEnv(
  { ADVBUILDER_USER_DATA: tmpUserData, ADVBUILDER_PROJECT_NAME: "TestProj" },
  () => migrateDriverStoreFromParameters(tmpProject, "xaiChat"),
);
assert.strictEqual(idempotent.migrated, false);

rmDir(tmpProject);
rmDir(tmpUserData);
delete process.env.ADVBUILDER_USER_DATA;
delete process.env.ADVBUILDER_PROJECT_NAME;

console.log("driver_store tests OK");
