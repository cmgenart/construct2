#!/usr/bin/env node
const path = require("path");
const { slugifyProjectName } = require("../project_discovery.js");
const {
  previewLegacyImport,
  importLegacyProject,
  listLegacyCandidates,
  batchImportLegacyProjects,
} = require("../legacy_import.js");

function usage() {
  console.log(`Usage:
  node scripts/import-legacy-project.js <legacy-folder-or-data.json> --root <target-art-root> [--name slug] [--preview]
  node scripts/import-legacy-project.js --batch <legacy-root> --root <target-art-root> [--paths path1,path2] [--stop-on-error]

Examples:
  node scripts/import-legacy-project.js "path/to/legacy-project" --root path/to/projects
  node scripts/import-legacy-project.js --batch path/to/legacy-root --root path/to/projects
`);
}

const args = process.argv.slice(2);
const batchMode = args.includes("--batch");
const rootIdx = args.indexOf("--root");
const nameIdx = args.indexOf("--name");
const pathsIdx = args.indexOf("--paths");
const previewOnly = args.includes("--preview");
const stopOnError = args.includes("--stop-on-error");
const rootArg = rootIdx >= 0 ? args[rootIdx + 1] : null;
const nameArg = nameIdx >= 0 ? args[nameIdx + 1] : null;
const pathsArg = pathsIdx >= 0 ? args[pathsIdx + 1] : null;

if (!rootArg) {
  usage();
  process.exit(1);
}

const targetRoot = path.resolve(process.cwd(), rootArg);

try {
  if (batchMode) {
    const batchIdx = args.indexOf("--batch");
    const legacyRoot = batchIdx >= 0 ? args[batchIdx + 1] : null;
    if (!legacyRoot) {
      usage();
      process.exit(1);
    }
    const legacyPath = path.resolve(process.cwd(), legacyRoot);
    const paths = pathsArg
      ? pathsArg.split(",").map((p) => path.resolve(process.cwd(), p.trim()))
      : undefined;
    if (previewOnly) {
      const candidates = listLegacyCandidates(legacyPath, { targetRoot });
      console.log(JSON.stringify({ ok: true, candidates }, null, 2));
      process.exit(0);
    }
    const report = batchImportLegacyProjects(legacyPath, targetRoot, {
      paths,
      stopOnError,
    });
    console.log(
      `Batch import: ${report.imported} imported, ${report.skipped} skipped, ${report.failed} failed`,
    );
    for (const r of report.results) {
      if (r.ok) console.log(`  ok   ${r.name} → ${r.path}`);
      else if (r.skipped) console.log(`  skip ${r.name || r.path}`);
      else console.log(`  fail ${r.name || r.path}: ${r.error}`);
    }
    process.exit(report.failed > 0 ? 1 : 0);
  }

  const legacyArg = args.find((a) => !a.startsWith("--"));
  if (!legacyArg) {
    usage();
    process.exit(1);
  }
  const legacyPath = path.resolve(process.cwd(), legacyArg);

  if (previewOnly) {
    const report = previewLegacyImport(legacyPath, { projectName: nameArg });
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }
  const slug = nameArg || slugifyProjectName(previewLegacyImport(legacyPath).slug);
  const report = importLegacyProject(legacyPath, targetRoot, { projectName: slug });
  console.log(`Imported legacy project "${report.name}"`);
  console.log(`  typeid: ${report.typeid}`);
  console.log(`  Path:   ${report.path}`);
  if (report.needsReview) console.log(`  Note:   manual review recommended`);
  if (report.warnings?.length) {
    for (const w of report.warnings) console.log(`  Warn:   ${w}`);
  }
} catch (e) {
  console.error(String(e.message || e));
  process.exit(1);
}
