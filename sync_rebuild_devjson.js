#!/usr/bin/env node
/**
 * One-shot: sync project source files from disk, rebuild, write output.* + dev.json.
 * Usage: node sync_rebuild_devjson.js <project-path>
 */
const fs = require("fs");
const path = require("path");
const PMasterV1 = require("./builder.pmaster.v1");
const PMaster = PMasterV1.PMaster;
const PMasterV2 = require("./builder.pmaster.v2");
const PMasterProcess = require("./builder.pmaster_process.js");
const Terser = require("./builder.terser.min");
const Glslx = require("./builder.glslx.min");
const { BUILDER_SOURCE_NAMES } = require("./source_inventory.js");
const { loadCreateMetadata } = require("./metadata_loader.js");

const projectPath = path.resolve(process.argv[2] || "");
if (!projectPath || !fs.existsSync(projectPath)) {
  console.error("Usage: node sync_rebuild_devjson.js <project-path>");
  process.exit(1);
}

const devJsonPath = path.join(projectPath, "dev.json");
const read = (name) => {
  const fp = path.join(projectPath, name);
  return fs.existsSync(fp) ? fs.readFileSync(fp, "utf8") : "";
};

let state = fs.existsSync(devJsonPath)
  ? JSON.parse(fs.readFileSync(devJsonPath, "utf8"))
  : { project: { name: path.basename(projectPath), path: projectPath }, files: {}, lastBuild: null };

if (!state.files) state.files = {};
for (const name of BUILDER_SOURCE_NAMES) {
  state.files[name] = read(name);
}

const codeblocks = ["setup", "defs", "functions", "draw", "cert"]
  .filter((n) => state.files[n + ".js"])
  .map((n) => ({ name: n, content: state.files[n + ".js"], enabled: true }));

const project = {
  name: path.basename(projectPath),
  path: projectPath,
  codeblocks,
  canvas: state.files["core.html"] || "",
  applyrandomseed: true,
  createMetadata: loadCreateMetadata(projectPath),
  cardanoMetadataSplit: state.settings?.cardanoMetadataSplit !== false,
};

const seed = state.seed ?? 859;
const values = {
  num: 1,
  seed,
  collection: {
    name: path.basename(projectPath),
    size: 1,
    description: "",
    policy: "00000000000000000000000000000000000000000000000000000000",
  },
  piece: { num: 1, seed, tag: "PG-00-001" },
  artist: { name: "" },
  properties: { cert: "off", canvas_input: "on" },
};

const output = PMasterProcess.ArtBuilder(
  PMaster,
  PMasterV2.Node,
  (c) => PMasterProcess.minimizeJS(Terser, c),
  (c) => PMasterProcess.minimizeGLSL(Glslx, c),
  project,
  values,
  [],
  true,
);

if (output?.errors?.length) {
  console.error("Build errors:", output.errors);
  process.exit(1);
}

const saves = [
  ["metadata", "json"],
  ["metadata_min", "json"],
  ["output", "html"],
  ["output_min", "html"],
  ["utf8link", "txt"],
  ["errors", "json"],
];
for (const [name, ext] of saves) {
  let data = output[name];
  if (data == null) continue;
  if (ext === "json" && typeof data !== "string") data = JSON.stringify(data, null, 2);
  fs.writeFileSync(path.join(projectPath, `output.${name}.${ext}`), data);
}

state.lastBuild = output;
state.project = { name: path.basename(projectPath), path: projectPath };
fs.writeFileSync(devJsonPath, JSON.stringify(state, null, 2));
console.log("Synced + rebuilt:", path.basename(projectPath), "#errors:", output.errors?.length || 0);
console.log("dev.json updated with fresh source + lastBuild");
