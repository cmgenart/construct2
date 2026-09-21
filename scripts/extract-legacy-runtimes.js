#!/usr/bin/env node
const path = require("path");
const {
  writeLegacyRuntimes,
  writeManifestFromSnapshot,
} = require("../legacy_runtime_extract.js");

function parseArgs(argv) {
  const opts = {
    root: path.resolve(__dirname, "..", "..", "art-legacy"),
    writeManifest: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--root" && argv[i + 1]) {
      opts.root = path.resolve(argv[++i]);
    } else if (arg === "--write-manifest") {
      opts.writeManifest = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/extract-legacy-runtimes.js [--root <art-legacy>] [--write-manifest]

Writes construct2/runtimes/legacy/*.html and manifest-snapshot.json.
With --write-manifest, patches construct2/runtimes/manifest.json legacy entries.`);
      process.exit(0);
    }
  }
  return opts;
}

const opts = parseArgs(process.argv);
const result = writeLegacyRuntimes(opts.root);

console.log(`Extracted ${result.shellCount} legacy runtime shells to runtimes/legacy/`);
for (const shell of result.shells) {
  console.log(
    `  ${shell.fileName}  (${shell.projectCount} projects, ${shell.legacyTypeIds.join(", ")})`,
  );
}

if (opts.writeManifest) {
  writeManifestFromSnapshot(result.snapshot);
  console.log("Updated runtimes/manifest.json with legacy entries.");
}
