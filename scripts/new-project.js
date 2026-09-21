#!/usr/bin/env node
const path = require("path");
const { slugifyProjectName } = require("../project_discovery.js");
const { scaffoldProject } = require("../project_scaffold.js");

function usage() {
  console.log(`Usage:
  node scripts/new-project.js <name> --root <art-root> [--template cc-v3-minimal]

Example:
  node scripts/new-project.js MyPiece --root ../../art --template cc-v3-minimal
`);
}

const args = process.argv.slice(2);
const nameArg = args.find((a) => !a.startsWith("--"));
const rootIdx = args.indexOf("--root");
const tplIdx = args.indexOf("--template");
const rootArg = rootIdx >= 0 ? args[rootIdx + 1] : null;
const templateArg = tplIdx >= 0 ? args[tplIdx + 1] : "cc-v3-minimal";

if (!nameArg || !rootArg) {
  usage();
  process.exit(1);
}

const slug = slugifyProjectName(nameArg);
const targetDir = path.resolve(process.cwd(), rootArg, slug);
const construct2Dir = path.resolve(__dirname, "..");

try {
  const result = scaffoldProject(templateArg, targetDir, {
    displayName: nameArg,
  });
  console.log(`Created Construct² project "${result.name}"`);
  console.log(`  Template: ${result.templateId}`);
  console.log(`  Runtime:  ${result.runtime}`);
  console.log(`  Path:     ${result.path}`);
} catch (e) {
  console.error(String(e.message || e));
  process.exit(1);
}
