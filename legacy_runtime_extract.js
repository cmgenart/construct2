const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { normalizeLegacyCanvas } = require("./legacy_canvas.js");

const RUNTIMES_DIR = path.join(__dirname, "runtimes");
const LEGACY_DIR = path.join(RUNTIMES_DIR, "legacy");

/** @type {Record<string, string>} */
const SHELL_FILES = {
  "59bfc3a8": "playground-square-1.0.html",
  ac79c3d9: "canvas-core-v3.2.html",
  e79bef8b: "curated-square-1.0.html",
  f288fdba: "canvas-core-v3-1.0.html",
  "3110c838": "auth-square-1.0.html",
  "47613eba": "canvas-core-v2-1.0.html",
  ea4726b1: "playground-cjam-square-1.0.html",
  b5412af7: "canvas-core-dev2-1.0.html",
  e6d34df6: "canvas-core-dev-1.0.html",
  "05909f24": "canvas-core-dev-v3-1.0.html",
  "803c27dd": "curated-canvas-v3-dev-1.0.html",
  "0949906c": "playground-square-glsl-1.0.html",
  "619e2d88": "playground-square-glsl-vertex-1.0.html",
  "5ca2cef9": "shader-wars-1.0.html",
};

const REVIEW_TYPEIDS = new Set([
  "Playground.Square.GLSL-1.0",
  "Playground.Square.GLSL.vertex-1.0",
  "shader_wars-1.0",
]);

const STRIP_SLOTS = ["setup", "draw", "functions"];

/**
 * @param {string} text
 */
function sha256(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

/**
 * @param {string} canvasHtml
 */
function parseCanvasLabel(canvasHtml) {
  const text = String(canvasHtml || "");
  const banner = text.match(/BlockGen(?:eration)?\.art\s+([^-\n]+?)\s*--/i);
  if (banner) return banner[1].trim();
  const cc = text.match(/Canvas Core v[\d.]+/i);
  if (cc) return cc[0];
  const square = text.match(/(?:On-Chain\s+)?Playground Square Canvas v[\d.]+/i);
  if (square) return square[0];
  const auth = text.match(/Auth Square Canvas v[\d.]+/i);
  if (auth) return auth[0];
  return "";
}

/**
 * @param {string} label
 */
function parseCcVersion(label) {
  const m = String(label || "").match(/v([\d.]+)/i);
  return m ? m[1] : "";
}

/**
 * @param {string} html
 */
function stripResolvedInserts(html) {
  let out = String(html || "");
  for (const slot of STRIP_SLOTS) {
    const re = new RegExp(`(//insert<${slot}>)[\\s\\S]*?(//end<${slot}>)`, "g");
    out = out.replace(re, `$1\n$2`);
  }
  return out;
}

/**
 * @param {string} canvasHtml
 * @param {string} coreContent
 */
function composeCanvasWithCore(canvasHtml, coreContent) {
  const text = String(canvasHtml || "");
  if (!coreContent || !/insert<core>[\s\S]*?end<core>/i.test(text)) {
    return text;
  }
  let core = normalizeLegacyCanvas(coreContent);
  core = stripResolvedInserts(core);
  return text.replace(/insert<core>[\s\S]*?end<core>/i, `insert<core>\n${core}\nend<core>`);
}

/**
 * @param {string} canvasHtml
 * @param {string} [coreContent]
 */
function buildExtractedCanvas(canvasHtml, coreContent) {
  let html = canvasHtml || "";
  if (coreContent) {
    html = composeCanvasWithCore(html, coreContent);
  }
  html = normalizeLegacyCanvas(html);
  html = stripResolvedInserts(html);
  return html;
}

/**
 * @param {string} legacyRoot
 */
function scanLegacyProjects(legacyRoot) {
  const root = path.resolve(legacyRoot);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`Legacy root not found: ${legacyRoot}`);
  }
  const projects = [];
  for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const dir = path.join(root, ent.name);
    const dataFile = fs.readdirSync(dir).find((e) => e.endsWith("_data.json"));
    if (!dataFile) continue;
    const raw = JSON.parse(fs.readFileSync(path.join(dir, dataFile), "utf8"));
    const coreBlock = (raw.codeblocks || []).find((b) => b && b.name === "core");
    projects.push({
      folder: ent.name,
      dataFile,
      name: String(raw.name || ent.name),
      typeid: String(raw.typeid || "unknown"),
      ts: Number(raw._ts || 0),
      canvas: String(raw.canvas || ""),
      canvasHash: sha256(raw.canvas || ""),
      coreContent: coreBlock ? String(coreBlock.content || "") : "",
    });
  }
  return projects;
}

/**
 * @param {ReturnType<typeof scanLegacyProjects>} projects
 */
function groupProjectsByCanvasHash(projects) {
  /** @type {Map<string, typeof projects>} */
  const groups = new Map();
  for (const project of projects) {
    const key = project.canvasHash;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(project);
  }
  return groups;
}

/**
 * @param {typeof projects[number][]} group
 */
function pickCanonicalProject(group) {
  return [...group].sort((a, b) => b.ts - a.ts || a.folder.localeCompare(b.folder))[0];
}

/**
 * @param {string} canvasHash
 * @param {string[]} typeids
 */
function shellFileName(canvasHash, typeids) {
  const prefix = canvasHash.slice(0, 8);
  if (SHELL_FILES[prefix]) return SHELL_FILES[prefix];
  const primary = [...typeids].sort()[0] || "unknown";
  return `${primary.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.html`;
}

/**
 * @param {string} legacyRoot
 * @param {object} [opts]
 * @param {string} [opts.extractedAt]
 */
function extractLegacyRuntimes(legacyRoot, opts = {}) {
  const projects = scanLegacyProjects(legacyRoot);
  const groups = groupProjectsByCanvasHash(projects);
  const extractedAt = opts.extractedAt || new Date().toISOString();
  const shells = [];

  for (const [canvasHash, group] of groups) {
    const canonical = pickCanonicalProject(group);
    const typeids = [...new Set(group.map((p) => p.typeid))].sort();
    const needsCore = group.some((p) => p.coreContent) || /insert<core>/.test(canonical.canvas);
    const withCore = group.filter((p) => p.coreContent);
    const coreSource =
      needsCore && withCore.length ? pickCanonicalProject(withCore) : null;
    const html = buildExtractedCanvas(canonical.canvas, coreSource?.coreContent || "");
    const label = parseCanvasLabel(html);
    const fileName = shellFileName(canvasHash, typeids);
    const contentHash = sha256(html);
    shells.push({
      fileName,
      file: `legacy/${fileName}`,
      id: `legacy/${fileName.replace(/\.html$/, "")}`,
      canvasHash,
      contentHash,
      legacyTypeIds: typeids,
      label: label || fileName.replace(/\.html$/, ""),
      ccVersion: parseCcVersion(label),
      sourceProject: canonical.folder,
      sourceTs: canonical.ts,
      projectCount: group.length,
      needsReview: typeids.some((t) => REVIEW_TYPEIDS.has(t)),
      html,
    });
  }

  shells.sort((a, b) => a.fileName.localeCompare(b.fileName));

  return {
    extractedAt,
    legacyRoot: path.resolve(legacyRoot),
    shellCount: shells.length,
    shells,
    snapshot: {
      version: 1,
      extractedAt,
      legacyRoot: path.resolve(legacyRoot),
      shells: shells.map((s) => ({
        fileName: s.fileName,
        file: s.file,
        id: s.id,
        canvasHash: s.canvasHash,
        contentHash: s.contentHash,
        legacyTypeIds: s.legacyTypeIds,
        label: s.label,
        ccVersion: s.ccVersion,
        sourceProject: s.sourceProject,
        sourceTs: s.sourceTs,
        projectCount: s.projectCount,
        needsReview: s.needsReview,
      })),
    },
  };
}

/**
 * @param {string} [legacyRoot]
 * @param {object} [opts]
 * @param {string} [opts.outDir]
 */
function writeLegacyRuntimes(legacyRoot, opts = {}) {
  const root =
    legacyRoot || path.resolve(__dirname, "..", "art-legacy");
  const outDir = opts.outDir || LEGACY_DIR;
  const result = extractLegacyRuntimes(root, opts);
  fs.mkdirSync(outDir, { recursive: true });
  for (const shell of result.shells) {
    fs.writeFileSync(path.join(outDir, shell.fileName), shell.html, "utf8");
  }
  fs.writeFileSync(
    path.join(outDir, "manifest-snapshot.json"),
    JSON.stringify(result.snapshot, null, 2),
    "utf8",
  );
  return result;
}

/**
 * @param {object} snapshot
 * @param {object} [opts]
 * @param {string} [opts.manifestPath]
 */
function buildManifestEntriesFromSnapshot(snapshot, opts = {}) {
  const manifestPath = opts.manifestPath || path.join(RUNTIMES_DIR, "manifest.json");
  const existing = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    : { version: 1, runtimes: [] };
  const keep = (existing.runtimes || []).filter(
    (r) => !String(r.file || "").startsWith("legacy/"),
  );
  const legacyEntries = (snapshot.shells || []).map((shell) => ({
    id: shell.id,
    file: shell.file,
    ccVersion: shell.ccVersion || "embedded",
    label: shell.label,
    legacyTypeIds: shell.legacyTypeIds,
    canvasHash: shell.canvasHash,
    sourceProject: shell.sourceProject,
    extractedAt: snapshot.extractedAt,
    needsReview: !!shell.needsReview,
  }));
  return {
    version: existing.version || 1,
    runtimes: [...keep, ...legacyEntries],
  };
}

/**
 * @param {object} snapshot
 * @param {object} [opts]
 */
function writeManifestFromSnapshot(snapshot, opts = {}) {
  const manifestPath = opts.manifestPath || path.join(RUNTIMES_DIR, "manifest.json");
  const manifest = buildManifestEntriesFromSnapshot(snapshot, { manifestPath });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return manifest;
}

/**
 * @param {string} typeid
 * @param {object} [opts]
 * @param {string} [opts.manifestPath]
 */
function findManifestEntryForTypeid(typeid, opts = {}) {
  const manifestPath = opts.manifestPath || path.join(RUNTIMES_DIR, "manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return (
    (manifest.runtimes || []).find((r) => (r.legacyTypeIds || []).includes(typeid)) || null
  );
}

module.exports = {
  SHELL_FILES,
  REVIEW_TYPEIDS,
  sha256,
  parseCanvasLabel,
  parseCcVersion,
  stripResolvedInserts,
  composeCanvasWithCore,
  buildExtractedCanvas,
  scanLegacyProjects,
  groupProjectsByCanvasHash,
  pickCanonicalProject,
  extractLegacyRuntimes,
  writeLegacyRuntimes,
  buildManifestEntriesFromSnapshot,
  writeManifestFromSnapshot,
  findManifestEntryForTypeid,
};
