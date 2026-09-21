/**
 * Headless AsciiCore builds for engine size comparison (Phase 5).
 * Usage: node build-ascii-profiles.js
 */
const path = require("path");
const fs = require("fs");
const PMasterV1 = require("./builder.pmaster.v1");
const PMaster = PMasterV1.PMaster;
const PMasterV2 = require("./builder.pmaster.v2");
const PMasterProcess = require("./builder.pmaster_process.js");
const Terser = require("./builder.terser.min");
const Glslx = require("./builder.glslx.min");

const projectName = "AsciiCore";
const projectPath = path.join("..", "art", projectName);
const projectRoot = path.resolve(__dirname, projectPath);

const SOURCE = [
  "core.html",
  "setup.js",
  "defs.js",
  "functions.js",
  "draw.js",
  "cert.js",
  "metadata.js",
];

function loadFile(name) {
  return fs.readFileSync(path.join(projectRoot, name), "utf8");
}

function loadCreateMetadata(root) {
  try {
    const mod = require(path.join(root, "metadata.js"));
    return mod.CreateMetadata || mod.createMetadata || null;
  } catch (_) {
    return null;
  }
}

function buildProfile(props) {
  const errors = [];
  const files = {};
  for (const n of SOURCE) files[n] = loadFile(n);
  const codeblocks = ["setup", "defs", "functions", "draw", "cert"].map((name) => ({
    name,
    content: files[`${name}.js`],
    enabled: true,
  }));
  const project = {
    name: projectName,
    path: projectPath,
    codeblocks,
    canvas: files["core.html"],
    applyrandomseed: true,
    createMetadata: loadCreateMetadata(projectRoot),
    cardanoMetadataSplit: false,
  };
  const values = {
    num: 1,
    seed: 4242,
    collection: {
      name: "AsciiCore",
      size: 1,
      description: "dev",
      policy: "00000000000000000000000000000000000000000000000000000000",
    },
    piece: { num: 1, seed: 4242, tag: "PG-00-001" },
    artist: { name: "dev" },
    properties: props,
  };
  const onMinify = (c) => PMasterProcess.minimizeJS(Terser, c);
  const onMinifyGL = (c) => PMasterProcess.minimizeGLSL(Glslx, c);
  const output = PMasterProcess.ArtBuilder(
    PMaster,
    PMasterV2.Node,
    onMinify,
    onMinifyGL,
    project,
    values,
    [],
    true,
  );
  return { output, errors };
}

const profiles = [
  { label: "density", props: { engine: "density", directional: "off" } },
  { label: "edge-off", props: { engine: "edge", directional: "off" } },
  { label: "edge-on", props: { engine: "edge", directional: "on" } },
  { label: "bias", props: { engine: "bias", directional: "off" } },
];

console.log("AsciiCore engine profile sizes\n");
for (const { label, props } of profiles) {
  const { output } = buildProfile(props);
  const errCount = output?.errors?.length || 0;
  const full = output?.output?.length || 0;
  const min = output?.output_min?.length || 0;
  const active = output?.activeprops || {};
  console.log(
    `${label.padEnd(10)} engine=${active.engine} dir=${active.directional}  full=${full}  min=${min}  errors=${errCount}`,
  );
  if (errCount) {
    output.errors.slice(0, 2).forEach((e) => console.log("  ", e.info || e.error));
  }
}
