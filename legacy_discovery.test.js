const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  isLegacyProjectDir,
  listAllProjectsInRoot,
} = require("./project_discovery.js");
const { summarizeLegacyProject, isLegacyProject } = require("./legacy_import.js");
const { listProjectsGrouped, normalizeWorkspace } = require("./workspace.js");
const {
  SAMPLE_NAME,
  SAMPLE_TYPEID,
  writeLegacyProject,
  makeTempLegacyRoot,
} = require("./legacy_test_fixture.js");

const tmpRoot = makeTempLegacyRoot("legacy-disc-");
const fixture = path.join(tmpRoot, SAMPLE_NAME);
const extra = path.join(tmpRoot, "Other Legacy");
writeLegacyProject(fixture);
writeLegacyProject(extra, { name: "Other Legacy" });

assert.ok(isLegacyProjectDir(fixture, SAMPLE_NAME), "synthetic folder is legacy");
assert.ok(isLegacyProject(fixture), "isLegacyProject");

const summary = summarizeLegacyProject(fixture);
assert.strictEqual(summary.typeid, SAMPLE_TYPEID);
assert.strictEqual(summary.runtimeId, "project-core");
assert.strictEqual(summary.runtimeLabel, "Project core");

const projects = listAllProjectsInRoot(tmpRoot, {
  summarizeLegacy: summarizeLegacyProject,
});
assert.ok(projects.length >= 1, "legacy root lists projects");
const pe = projects.find((p) => p.path === fixture);
assert.ok(pe, "synthetic fixture in list");
assert.strictEqual(pe.kind, "legacy");
assert.strictEqual(pe.flags.legacy, true);

const artRoot = path.join(tmpRoot, "art");
fs.mkdirSync(artRoot);

const ws = normalizeWorkspace(
  {
    roots: [
      {
        id: "legacy",
        path: tmpRoot,
        label: "legacy/",
        enabled: true,
        readOnly: true,
      },
      {
        id: "art",
        path: artRoot,
        label: "art/",
        enabled: true,
        readOnly: false,
      },
    ],
    legacyConversions: {},
  },
  tmpRoot,
);
const grouped = listProjectsGrouped(ws);
const legacyRoot = grouped.roots.find((r) => r.id === "legacy");
assert.ok(legacyRoot, "legacy root grouped");
assert.ok(
  legacyRoot.projects.some((p) => p.kind === "legacy"),
  "legacy projects in grouped list",
);

fs.rmSync(tmpRoot, { recursive: true, force: true });

console.log("legacy_discovery.test.js: ok");
