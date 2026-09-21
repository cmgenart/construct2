const fs = require("fs");
const path = require("path");
const {
  slugifyProjectName,
  isLegacyProjectDir,
  isConstruct2ProjectDir,
  findLegacyDataFileInDir,
} = require("./project_discovery.js");
const { resolveRuntimeFile } = require("./project_scaffold.js");
const { rewriteValueInserts, normalizeLegacyCanvas } = require("./legacy_canvas.js");
const {
  createCollection,
  deleteCollection,
  listCollectionPad2s,
  newPieceRecord,
  writeCollection,
  MAX_PIECES,
} = require("./collection_fs.js");

/** GLSL / manual-review guidance shown in preview UI */
const REVIEW_NOTES = {
  "Playground.Square.GLSL-1.0":
    "Fragment-shader playground — open core.html and confirm GLSL compiles in dev UI.",
  "Playground.Square.GLSL.vertex-1.0":
    "Vertex-shader playground — verify shader stages and canvas boot after import.",
  "shader_wars-1.0":
    "Custom shader_wars runtime — sources imported; manual core review required.",
};

/** @type {Record<string, { needsReview?: boolean }>} */
const TYPEID_OVERRIDES = {
  "Playground.Square.GLSL-1.0": { needsReview: true },
  "Playground.Square.GLSL.vertex-1.0": { needsReview: true },
  "shader_wars-1.0": { needsReview: true },
};

/**
 * Alpha ships current Canvas Core only. Legacy projects keep the canvas
 * already stored in *_data.json and import as project-core.
 * @param {string} typeid
 * @param {string} [projectCanvas]
 */
function resolveTypeidMapping(typeid, projectCanvas) {
  const override = TYPEID_OVERRIDES[typeid] || {};
  const hasCanvas = !!(projectCanvas && String(projectCanvas).trim());
  return {
    runtime: "project-core",
    useEmbeddedCanvas: hasCanvas,
    needsReview: !!override.needsReview,
  };
}

/**
 * @param {string} legacyDirOrJson
 */
function findLegacyDataFile(legacyDirOrJson) {
  const resolved = path.resolve(legacyDirOrJson);
  if (resolved.endsWith(".json") && fs.existsSync(resolved)) {
    return resolved;
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Legacy path not found: ${legacyDirOrJson}`);
  }
  const entries = fs.readdirSync(resolved);
  const dataFile = entries.find((e) => e.endsWith("_data.json"));
  if (!dataFile) {
    throw new Error(`No *_data.json in ${resolved}`);
  }
  return path.join(resolved, dataFile);
}

/**
 * @param {object[]} rows
 */
function dataRowsToValues(rows) {
  const out = {};
  for (const row of rows || []) {
    if (row && row.key != null) out[row.key] = row.value;
  }
  return out;
}

/**
 * @param {string} legacyPath
 */
function isLegacyProject(legacyPath) {
  const resolved = path.resolve(legacyPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return false;
  }
  return isLegacyProjectDir(resolved, path.basename(resolved));
}

/**
 * Lightweight metadata for project list tooltips (no import).
 * @param {string} legacyPath
 */
function summarizeLegacyProject(legacyPath) {
  const dataFile = findLegacyDataFile(legacyPath);
  const raw = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  const typeid = String(raw.typeid || "unknown");
  const mapping = resolveTypeidMapping(typeid, raw.canvas || "");
  const displayName = String(raw.name || path.basename(path.dirname(dataFile)));
  return {
    dataFile,
    displayName,
    folderName: path.basename(path.dirname(dataFile)),
    slug: slugifyProjectName(displayName),
    typeid,
    runtimeId: mapping.runtime,
    runtimeLabel: "Project core",
    ccVersion: "embedded",
    needsReview: !!mapping.needsReview,
    convertedPath: null,
  };
}

/**
 * @param {string} dataFile
 */
function getDataFileMtime(dataFile) {
  try {
    return fs.statSync(dataFile).mtime.toISOString();
  } catch {
    return null;
  }
}

/**
 * @param {string} dest
 */
function readExistingDevJson(dest) {
  const devPath = path.join(dest, "dev.json");
  if (!fs.existsSync(devPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(devPath, "utf8"));
  } catch {
    return null;
  }
}

const DEV_JSON_PRESERVE_KEYS = [
  "buildValueLevels",
  "propertyLevels",
  "paramValues",
  "buildValueKeyOrder",
  "buildValueCustomKeys",
];

/**
 * @param {object} generated
 * @param {object|null} existing
 */
function mergeDevJsonForReconvert(generated, existing) {
  if (!existing) return generated;
  const merged = { ...generated };
  for (const key of DEV_JSON_PRESERVE_KEYS) {
    if (existing[key] != null) merged[key] = existing[key];
  }
  if (existing.seed != null) merged.seed = existing.seed;
  merged.settings = {
    ...(existing.settings || {}),
    ...(generated.settings || {}),
    legacyImport: generated.settings.legacyImport,
  };
  return merged;
}

/**
 * @param {ReturnType<typeof parseLegacyProject>} parsed
 * @param {string} dest
 * @param {object} [opts]
 * @param {boolean} [opts.mergeDevJson]
 */
function resolveCertBlockContent(codeblocks) {
  if (!codeblocks || typeof codeblocks !== "object") return null;
  const raw =
    codeblocks.cert ?? codeblocks.certificate ?? codeblocks.CERT ?? null;
  return raw != null ? String(raw) : null;
}

function writeLegacyUpgradeFiles(parsed, dest, opts = {}) {
  const writeBlock = (fileName, blockName) => {
    const content = parsed.codeblocks[blockName];
    if (content != null) {
      fs.writeFileSync(path.join(dest, fileName), content, "utf8");
    }
  };

  writeBlock("functions.js", "functions");
  writeBlock("setup.js", "setup");
  writeBlock("draw.js", "draw");
  const certContent = resolveCertBlockContent(parsed.codeblocks);
  if (certContent != null) {
    fs.writeFileSync(path.join(dest, "cert.js"), certContent, "utf8");
  }

  if (!parsed.codeblocks.draw) {
    fs.writeFileSync(path.join(dest, "draw.js"), "\nreturn 1;\n", "utf8");
  }
  if (!parsed.codeblocks.setup) {
    fs.writeFileSync(path.join(dest, "setup.js"), "\n// upgraded legacy — add setup\n", "utf8");
  }
  if (!parsed.codeblocks.functions) {
    fs.writeFileSync(path.join(dest, "functions.js"), "\n", "utf8");
  }

  let coreHtml;
  if (parsed.canvas) {
    coreHtml = normalizeLegacyCanvas(parsed.canvas);
  } else {
    const runtimeFile = resolveRuntimeFile("cc-v3");
    coreHtml = fs.readFileSync(runtimeFile, "utf8");
  }
  fs.writeFileSync(path.join(dest, "core.html"), coreHtml, "utf8");

  const projectJsonPath = path.join(dest, "project.json");
  if (!opts.mergeDevJson || !fs.existsSync(projectJsonPath)) {
    fs.writeFileSync(
      projectJsonPath,
      JSON.stringify({ runtime: "project-core", kind: "construct2" }, null, 2),
      "utf8",
    );
  }

  const seed = String(parsed.pieceValues.seed || parsed.collectionValues.master_seed || "1");
  const dataFileMtime = getDataFileMtime(parsed.sourceFile);
  let devJson = {
    seed,
    buildValueLevels: {
      default: {
        name: { value: parsed.pieceValues.token_id || parsed.name, use: true },
        artist: { value: artistName(parsed), use: true },
        description: {
          value: parsed.collectionValues.description || "",
          use: true,
        },
        policy: {
          value: "00000000000000000000000000000000000000000000000000000000",
          use: true,
        },
        num: { value: padNum(parsed.pieceValues.num || "1"), use: true },
        collection_name: {
          value: slugifyProjectName(parsed.collectionValues.name || parsed.name),
          use: true,
        },
        seed: { value: seed, use: true },
      },
      collection: {},
    },
    propertyLevels: { viewer: {}, collection: {}, piece: {}, override: {} },
    paramValues: {},
    settings: {
      legacyImport: {
        typeid: parsed.typeid,
        sourceDir: parsed.sourceDir,
        dataFile: parsed.sourceFile,
        dataFileMtime,
        upgradedAt: new Date().toISOString(),
        needsReview: !!parsed.mapping.needsReview,
        inPlace: path.resolve(dest) === path.resolve(parsed.sourceDir),
      },
    },
  };
  if (opts.mergeDevJson) {
    devJson = mergeDevJsonForReconvert(devJson, readExistingDevJson(dest));
    devJson.settings.legacyImport = {
      ...devJson.settings.legacyImport,
      typeid: parsed.typeid,
      sourceDir: parsed.sourceDir,
      dataFile: parsed.sourceFile,
      dataFileMtime,
      upgradedAt: new Date().toISOString(),
      needsReview: !!parsed.mapping.needsReview,
      inPlace: path.resolve(dest) === path.resolve(parsed.sourceDir),
    };
  }
  fs.writeFileSync(path.join(dest, "dev.json"), JSON.stringify(devJson, null, 2), "utf8");

  fs.writeFileSync(
    path.join(dest, "metadata.js"),
    `/** Legacy upgrade metadata — customize CreateMetadata as needed. */
function PadLeft(str, length, padChar) {
  return String(str ?? "").padStart(length, padChar);
}

function CreateMetadata(values, properties, artSrc) {
  const tokenId =
    (values.collection_name || "legacy") + PadLeft(values.num, 5, "0");
  const file = {
    mediaType: "text/html",
    name: PadLeft(values.num, 5, "0"),
    src: artSrc,
  };
  const inner = {
    name: values.name,
    description: values.description,
    artist: values.artist,
    files: [file],
  };
  return {
    "metadata.json": {
      721: {
        [values.policy]: { [tokenId]: inner },
      },
    },
  };
}

module.exports = { CreateMetadata };
`,
    "utf8",
  );
}

/**
 * @param {string} legacyPath
 * @param {string} dest
 */
function mirrorLegacyFolder(legacyPath, dest) {
  const src = path.resolve(legacyPath);
  const target = path.resolve(dest);
  if (src === target) return target;
  if (!fs.existsSync(target)) {
    fs.cpSync(src, target, { recursive: true, force: false });
    return target;
  }
  if (!findLegacyDataFileInDir(target) && findLegacyDataFileInDir(src)) {
    for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
      const from = path.join(src, ent.name);
      const to = path.join(target, ent.name);
      if (ent.isDirectory()) {
        if (!fs.existsSync(to)) fs.cpSync(from, to, { recursive: true, force: false });
      } else if (!fs.existsSync(to)) {
        fs.copyFileSync(from, to);
      }
    }
  }
  return target;
}

/**
 * @param {string} legacyPath
 * @param {object} [opts]
 * @param {boolean} [opts.inPlace]
 * @param {string} [opts.dest]
 * @param {boolean} [opts.force]
 */
function upgradeLegacyProject(legacyPath, opts = {}) {
  const legacyResolved = path.resolve(legacyPath);
  if (!isLegacyProject(legacyResolved)) {
    if (isConstruct2ProjectDir(legacyResolved, path.basename(legacyResolved))) {
      return {
        ok: true,
        skipped: true,
        path: legacyResolved,
        name: path.basename(legacyResolved),
      };
    }
    throw new Error(`Not a legacy project: ${legacyPath}`);
  }
  const parsed = parseLegacyProject(legacyResolved);
  const dest = opts.inPlace
    ? parsed.sourceDir
    : path.resolve(opts.dest || parsed.sourceDir);
  const folderName = path.basename(dest);

  if (
    !opts.force &&
    isConstruct2ProjectDir(dest, folderName) &&
    !isLegacyProjectDir(dest, folderName)
  ) {
    const raw = JSON.parse(fs.readFileSync(parsed.sourceFile, "utf8"));
    const collections = importLegacyCollectionData(dest, raw, parsed, {
      force: resolveLegacyCollectionForce(opts),
      maxPieces: opts.maxCollectionPieces,
    });
    return {
      ok: true,
      skipped: true,
      path: dest,
      name: folderName,
      typeid: parsed.typeid,
      needsReview: !!parsed.mapping.needsReview,
      warnings: [],
      collections,
    };
  }

  if (!opts.inPlace && !fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  writeLegacyUpgradeFiles(parsed, dest);

  const raw = JSON.parse(fs.readFileSync(parsed.sourceFile, "utf8"));
  const collections = importLegacyCollectionData(dest, raw, parsed, {
    force: resolveLegacyCollectionForce(opts),
    maxPieces: opts.maxCollectionPieces,
  });

  const report = {
    ok: true,
    path: dest,
    name: folderName,
    typeid: parsed.typeid,
    needsReview: !!parsed.mapping.needsReview,
    warnings: previewLegacyImport(legacyResolved).warnings,
    upgraded: true,
    inPlace: path.resolve(dest) === path.resolve(parsed.sourceDir),
    dataFile: parsed.sourceFile,
    dataFileMtime: getDataFileMtime(parsed.sourceFile),
    collections,
  };

  fs.writeFileSync(
    path.join(dest, "legacy-import.report.json"),
    JSON.stringify(report, null, 2),
    "utf8",
  );

  return report;
}

/**
 * Re-import legacy *_data.json into an upgraded project, preserving user dev.json edits.
 * @param {string} projectPath
 * @param {object} [opts]
 * @param {boolean} [opts.forceCollections]
 * @param {number} [opts.maxCollectionPieces]
 */
function reconvertLegacyProject(projectPath, opts = {}) {
  const resolved = path.resolve(projectPath);
  const dataFile = findLegacyDataFileInDir(resolved);
  if (!dataFile) {
    throw new Error(`No legacy data file in ${resolved}`);
  }
  const parsed = parseLegacyProject(path.dirname(dataFile));
  const dest = parsed.sourceDir;

  writeLegacyUpgradeFiles(parsed, dest, { mergeDevJson: true });

  const raw = JSON.parse(fs.readFileSync(parsed.sourceFile, "utf8"));
  const collections = importLegacyCollectionData(dest, raw, parsed, {
    force: resolveLegacyCollectionForce({ ...opts, reconvert: true }),
    maxPieces: opts.maxCollectionPieces,
  });

  const report = {
    ok: true,
    path: dest,
    name: path.basename(dest),
    typeid: parsed.typeid,
    needsReview: !!parsed.mapping.needsReview,
    warnings: previewLegacyImport(resolved).warnings,
    reconverted: true,
    inPlace: true,
    dataFile: parsed.sourceFile,
    dataFileMtime: getDataFileMtime(parsed.sourceFile),
    collections,
  };

  fs.writeFileSync(
    path.join(dest, "legacy-import.report.json"),
    JSON.stringify(report, null, 2),
    "utf8",
  );

  return report;
}

/**
 * @param {string} legacyPath
 * @param {string} targetRoot
 * @param {object} [opts]
 * @param {string} [opts.projectName]
 * @param {boolean} [opts.skipExisting=false]
 */
function convertLegacyProject(legacyPath, targetRoot, opts = {}) {
  const legacyResolved = path.resolve(legacyPath);
  if (!isLegacyProject(legacyResolved)) {
    throw new Error(`Not a legacy project: ${legacyPath}`);
  }
  const folderName = path.basename(legacyResolved);
  const dest = path.resolve(targetRoot, opts.projectName || folderName);
  if (fs.existsSync(dest) && opts.skipExisting) {
    const existing = upgradeLegacyProject(legacyResolved, { dest, force: false });
    if (existing.skipped) return { ...existing, converted: false };
  }
  mirrorLegacyFolder(legacyResolved, dest);
  const report = upgradeLegacyProject(legacyResolved, { dest, force: true });
  return { ...report, converted: !report.skipped };
}

/**
 * @param {string} legacyPath
 * @param {object} workspace
 * @param {object} workspaceApi
 */
function resolveLegacyProjectPath(legacyPath, workspace, workspaceApi) {
  const legacyResolved = path.resolve(legacyPath);
  if (!isLegacyProject(legacyResolved)) {
    const collections = ensureLegacyCollectionsImported(legacyResolved);
    return { ok: true, path: legacyResolved, legacy: false, collections };
  }

  const projectRoot = workspaceApi.findRootForProject
    ? workspaceApi.findRootForProject(workspace, legacyResolved)
    : null;
  const writableInPlace = projectRoot && !projectRoot.readOnly;

  if (writableInPlace) {
    try {
      const report = upgradeLegacyProject(legacyResolved, { inPlace: true, force: false });
      const collections = ensureLegacyCollectionsImported(report.path);
      return {
        ok: true,
        path: report.path,
        legacy: true,
        converted: !report.skipped,
        skipped: !!report.skipped,
        name: report.name,
        typeid: report.typeid,
        needsReview: report.needsReview,
        warnings: report.warnings || [],
        inPlace: true,
        collections: report.collections || collections,
      };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  }

  if (projectRoot?.readOnly) {
    const writableRoot = workspaceApi.getDefaultWritableRoot(workspace);
    const folderName = path.basename(legacyResolved);
    const convertedPath =
      workspaceApi.getLegacyConversion?.(workspace, legacyResolved)?.path ||
      (writableRoot &&
      fs.existsSync(path.join(writableRoot.path, folderName)) &&
      isConstruct2ProjectDir(path.join(writableRoot.path, folderName), folderName) &&
      !isLegacyProjectDir(path.join(writableRoot.path, folderName), folderName)
        ? path.join(writableRoot.path, folderName)
        : null);
    return {
      ok: false,
      code: "READ_ONLY_LEGACY",
      error:
        "This project is in a read-only root. Enable write on the root or copy it to a writable root to upgrade in place.",
      rootId: projectRoot.id,
      path: legacyResolved,
      convertedPath,
    };
  }

  const writableRoot = workspaceApi.getDefaultWritableRoot(workspace);
  if (!writableRoot) {
    return { ok: false, error: "No writable workspace root for legacy conversion" };
  }

  if (!projectRoot) {
    return {
      ok: false,
      code: "LEGACY_NO_WRITABLE_ROOT",
      error:
        "Legacy project is not under a writable workspace root. Enable write on the root, copy to a writable root, or add the folder as a writable root.",
      path: legacyResolved,
    };
  }

  return {
    ok: false,
    error: "Cannot resolve legacy project path for upgrade",
    path: legacyResolved,
  };
}

/**
 * @param {string} legacyPath
 */
function parseLegacyProject(legacyPath) {
  const dataFile = findLegacyDataFile(legacyPath);
  const raw = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  const typeid = String(raw.typeid || "unknown");
  const mapping = resolveTypeidMapping(typeid, raw.canvas || "");

  const codeblocks = {};
  for (const block of raw.codeblocks || []) {
    if (block && block.name) {
      codeblocks[block.name] = rewriteValueInserts(block.content || "");
    }
  }

  const pieceValues = dataRowsToValues(raw.data?.piece);
  const collectionValues = dataRowsToValues(raw.data?.collection);
  const artistValues = dataRowsToValues(raw.data?.artist);

  return {
    sourceFile: dataFile,
    sourceDir: path.dirname(dataFile),
    name: String(raw.name || path.basename(path.dirname(dataFile))),
    typeid,
    mapping,
    codeblocks,
    canvas: raw.canvas || "",
    pieceValues,
    collectionValues,
    artistValues,
    collectiondata: Array.isArray(raw.collectiondata) ? raw.collectiondata : [],
    resolvedmetadata: raw.resolvedmetadata || null,
  };
}

/**
 * @param {string} legacyPath
 * @param {object} [opts]
 * @param {string} [opts.targetRoot]
 * @param {string} [opts.projectName]
 */
function previewLegacyImport(legacyPath, opts = {}) {
  const parsed = parseLegacyProject(legacyPath);
  const slug =
    opts.projectName || slugifyProjectName(parsed.name);
  const warnings = [];
  if (parsed.mapping.hashMismatch) {
    warnings.push("Embedded canvas differs from canonical legacy shell — import uses per-project canvas");
  }
  if (parsed.mapping.needsReview) {
    warnings.push(`typeid ${parsed.typeid} flagged for manual review`);
    const note = REVIEW_NOTES[parsed.typeid];
    if (note) warnings.push(note);
  }
  if (!parsed.codeblocks.setup && !parsed.codeblocks.draw) {
    warnings.push("No setup/draw codeblocks found");
  }
  return {
    ok: true,
    slug,
    typeid: parsed.typeid,
    runtime: parsed.mapping.runtime,
    needsReview: !!parsed.mapping.needsReview,
    warnings,
    sourceDir: parsed.sourceDir,
    pieceKeys: Object.keys(parsed.pieceValues),
  };
}

/**
 * @param {string} legacyPath
 * @param {string} targetRoot
 * @param {object} [opts]
 * @param {string} [opts.projectName]
 */
function importLegacyProject(legacyPath, targetRoot, opts = {}) {
  const parsed = parseLegacyProject(legacyPath);
  const slug = opts.projectName || slugifyProjectName(parsed.name);
  const dest = path.resolve(targetRoot, slug);
  if (fs.existsSync(dest)) {
    throw new Error(`Target already exists: ${dest}`);
  }
  return upgradeLegacyProject(legacyPath, { dest, force: true });
}

function artistName(parsed) {
  return parsed.artistValues?.name || parsed.artistValues?.artist || "";
}

function padNum(n) {
  const s = String(n ?? "1");
  return s.padStart(4, "0");
}

function padSeed(seed) {
  const n = Math.max(0, Math.min(99999, Math.floor(Number(seed) || 0)));
  return String(n).padStart(5, "0");
}

/**
 * Whether legacy collection import should replace existing collections/.
 * Default: refresh on re-convert and full upgrade; skip on lazy backfill unless forced.
 * @param {object} [opts]
 * @param {boolean} [opts.force]
 * @param {boolean} [opts.forceCollections]
 * @param {boolean} [opts.reconvert]
 */
function resolveLegacyCollectionForce(opts = {}) {
  if (opts.forceCollections === false) return false;
  if (opts.forceCollections === true) return true;
  return !!opts.reconvert || !!opts.force;
}

/**
 * Decide whether legacy rows should become one project-level collection.
 * Legacy Construct projects only supported a single collection.
 */
function shouldGroupLegacyRowsByProject(rows) {
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * Group legacy collectiondata rows for import.
 * @param {object[]} rows
 * @param {ReturnType<typeof parseLegacyProject>} parsed
 * @returns {Map<string, object[]>}
 */
function groupLegacyCollectionRows(rows, parsed) {
  const projectName = parsed.name || "Collection";
  const defaultCollName = parsed.collectionValues?.name || projectName;
  return new Map([[defaultCollName, rows]]);
}

/**
 * @param {object} row
 * @param {number} indexNum — 1-based position in collection
 * @param {object} ctx
 */
function legacyRowToPieceRecord(row, indexNum, ctx) {
  const legacyNum = row.num != null ? Number(row.num) : indexNum;
  const seed = row.seed != null ? Number(row.seed) : legacyNum * 1000;
  const tokenId = row.piece?.token_id || row.piece?.name || "";
  const rowTitle = String(row.collection?.name || "").trim();
  const displayName =
    tokenId ||
    rowTitle ||
    (ctx.collectionName
      ? `${ctx.collectionName} ${padNum(legacyNum)}`
      : `Piece ${padNum(legacyNum)}`);

  const values = {
    num: { value: padNum(legacyNum), use: true },
    name: { value: displayName, use: true },
    seed: { value: padSeed(seed), use: true },
  };
  if (ctx.artistName) values.artist = { value: ctx.artistName, use: true };
  const pieceDescription =
    ctx.pieceDescription || String(row.collection?.description || "").trim();
  if (pieceDescription) {
    values.description = { value: pieceDescription, use: true };
  } else if (ctx.collectionDescription) {
    values.description = { value: ctx.collectionDescription, use: true };
  }
  if (ctx.pieceCollectionName) {
    values.collection_name = {
      value: ctx.pieceCollectionName,
      use: true,
    };
  } else if (ctx.projectName) {
    values.collection_name = {
      value: slugifyProjectName(ctx.projectName),
      use: true,
    };
  } else if (ctx.collectionName) {
    values.collection_name = {
      value: slugifyProjectName(ctx.collectionName),
      use: true,
    };
  }

  return newPieceRecord(indexNum, {
    seed,
    displayName,
    values,
    properties: row.properties && typeof row.properties === "object" ? row.properties : {},
  });
}

/**
 * Import legacy `collectiondata[]` rows into collections v2 JSON files.
 * @param {string} projectPath
 * @param {object} raw — full legacy *_data.json
 * @param {ReturnType<typeof parseLegacyProject>} parsed
 * @param {object} [opts]
 * @param {boolean} [opts.force]
 * @param {number} [opts.maxPieces]
 */
function importLegacyCollectionData(projectPath, raw, parsed, opts = {}) {
  const rows = Array.isArray(raw.collectiondata) ? raw.collectiondata : [];
  if (!rows.length) {
    return { ok: true, skipped: true, reason: "no collectiondata" };
  }

  const existing = listCollectionPad2s(projectPath);
  if (existing.length > 0 && !opts.force) {
    return { ok: true, skipped: true, reason: "collections exist" };
  }
  if (existing.length > 0 && opts.force) {
    for (const coll of existing) {
      const del = deleteCollection(projectPath, coll.pad2);
      if (!del.ok) {
        return {
          ok: false,
          error: del.error || `Failed to remove collection ${coll.pad2}`,
        };
      }
    }
  }

  const maxPieces =
    opts.maxPieces != null ? Math.max(1, Number(opts.maxPieces) || 1) : MAX_PIECES;
  const projectName = parsed.name || "Collection";
  const defaultCollName = parsed.collectionValues?.name || projectName;
  const defaultCollDesc = parsed.collectionValues?.description || "";
  const defaultArtist = artistName(parsed);
  const groupByProject = shouldGroupLegacyRowsByProject(rows);

  /** @type {Map<string, object[]>} */
  const groups = groupLegacyCollectionRows(rows, parsed);

  const collections = [];
  let totalPieces = 0;
  let truncated = false;

  for (const [collName, collRows] of groups) {
    if (totalPieces >= maxPieces) {
      truncated = true;
      break;
    }

    const createResult = createCollection(projectPath, collName);
    if (!createResult.ok) {
      return {
        ok: false,
        error: createResult.error || "Failed to create collection",
        collections,
        totalPieces,
        truncated,
      };
    }

    const data = createResult.collection;
    const sorted = [...collRows].sort(
      (a, b) => (Number(a.num) || 0) - (Number(b.num) || 0),
    );
    const firstRow = sorted[0] || {};
    const collDesc = groupByProject
      ? defaultCollDesc
      : firstRow.collection?.description || defaultCollDesc;

    data.values = {
      collection_name: { value: projectName, use: true },
      description: { value: collDesc, use: true },
    };
    if (defaultArtist) {
      data.values.artist = { value: defaultArtist, use: true };
    }
    data.mint = {
      ...data.mint,
      size: sorted.length,
      description: collDesc,
    };

    const pieceRecords = [];
    for (let i = 0; i < sorted.length; i++) {
      if (totalPieces >= maxPieces) {
        truncated = true;
        break;
      }
      const row = sorted[i];
      pieceRecords.push(
        legacyRowToPieceRecord(row, pieceRecords.length + 1, {
          projectName,
          collectionName: collName,
          collectionDescription: collDesc,
          pieceCollectionName: groupByProject
            ? String(row.collection?.name || "").trim()
            : "",
          pieceDescription: groupByProject
            ? String(row.collection?.description || "").trim()
            : "",
          artistName: row.artist?.name || row.artist?.raw || defaultArtist,
        }),
      );
      totalPieces++;
    }

    data.pieceRecords = pieceRecords;
    writeCollection(projectPath, data);
    collections.push({
      pad2: createResult.pad2,
      name: collName,
      pieceCount: pieceRecords.length,
    });
  }

  return {
    ok: true,
    imported: true,
    collections,
    totalPieces,
    truncated,
    sourceRows: rows.length,
  };
}

/**
 * Backfill collections for upgraded projects that still have *_data.json.
 * @param {string} projectPath
 * @param {object} [opts]
 */
function ensureLegacyCollectionsImported(projectPath, opts = {}) {
  const dataFile = findLegacyDataFileInDir(path.resolve(projectPath));
  if (!dataFile) {
    return { ok: true, skipped: true, reason: "no data file" };
  }
  const raw = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  const parsed = parseLegacyProject(path.dirname(dataFile));
  return importLegacyCollectionData(projectPath, raw, parsed, opts);
}

/**
 * @param {string} legacyRoot
 * @param {object} [opts]
 * @param {string} [opts.targetRoot] — when set, mark candidates already present by slug
 */
function listLegacyCandidates(legacyRoot, opts = {}) {
  const root = path.resolve(legacyRoot);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`Legacy root not found: ${legacyRoot}`);
  }
  const targetRoot = opts.targetRoot ? path.resolve(opts.targetRoot) : null;
  const candidates = [];
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (e) {
    throw new Error(`Cannot read legacy root: ${e.message || e}`);
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const dir = path.join(root, ent.name);
    let dataFile;
    try {
      dataFile = findLegacyDataFile(dir);
    } catch {
      continue;
    }
    let preview;
    try {
      preview = previewLegacyImport(dir);
    } catch (e) {
      candidates.push({
        name: ent.name,
        path: dir,
        dataFile,
        ok: false,
        error: String(e.message || e),
      });
      continue;
    }
    const destPath = targetRoot ? path.join(targetRoot, ent.name) : null;
    const slugPath = targetRoot ? path.join(targetRoot, preview.slug) : null;
    const alreadyImported =
      !!(destPath && fs.existsSync(destPath)) || !!(slugPath && fs.existsSync(slugPath));
    candidates.push({
      name: preview.slug,
      displayName: ent.name,
      path: dir,
      dataFile,
      ok: true,
      slug: preview.slug,
      typeid: preview.typeid,
      runtime: preview.runtime,
      needsReview: preview.needsReview,
      warnings: preview.warnings,
      alreadyImported,
      destPath,
    });
  }
  candidates.sort((a, b) => String(a.displayName || a.name).localeCompare(String(b.displayName || b.name)));
  return candidates;
}

/**
 * @param {string} legacyRoot
 * @param {string} targetRoot
 * @param {object} [opts]
 * @param {string[]} [opts.paths] — subset of candidate paths to import
 * @param {boolean} [opts.skipExisting=true]
 * @param {boolean} [opts.stopOnError=false]
 */
function batchImportLegacyProjects(legacyRoot, targetRoot, opts = {}) {
  const skipExisting = opts.skipExisting !== false;
  const stopOnError = !!opts.stopOnError;
  const target = path.resolve(targetRoot);
  const allow = opts.paths ? new Set(opts.paths.map((p) => path.resolve(p))) : null;
  const candidates = listLegacyCandidates(legacyRoot, { targetRoot: target });
  const results = [];
  for (const c of candidates) {
    if (!c.ok) {
      results.push({ ok: false, path: c.path, name: c.displayName, error: c.error || "Preview failed" });
      if (stopOnError) break;
      continue;
    }
    if (allow && !allow.has(path.resolve(c.path))) continue;
    if (skipExisting && c.alreadyImported) {
      results.push({
        ok: false,
        skipped: true,
        path: c.path,
        name: c.slug,
        error: `Already exists: ${c.destPath}`,
      });
      continue;
    }
    try {
      const report = importLegacyProject(c.path, target, { projectName: c.slug });
      results.push({ ok: true, ...report });
    } catch (e) {
      results.push({
        ok: false,
        path: c.path,
        name: c.slug,
        error: String(e.message || e),
      });
      if (stopOnError) break;
    }
  }
  const imported = results.filter((r) => r.ok).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.filter((r) => !r.ok && !r.skipped).length;
  return { ok: failed === 0, imported, skipped, failed, results };
}

module.exports = {
  TYPEID_OVERRIDES,
  REVIEW_NOTES,
  findLegacyDataFile,
  isLegacyProject,
  summarizeLegacyProject,
  upgradeLegacyProject,
  reconvertLegacyProject,
  resolveCertBlockContent,
  convertLegacyProject,
  resolveLegacyProjectPath,
  parseLegacyProject,
  previewLegacyImport,
  importLegacyProject,
  importLegacyCollectionData,
  ensureLegacyCollectionsImported,
  groupLegacyCollectionRows,
  shouldGroupLegacyRowsByProject,
  resolveLegacyCollectionForce,
  legacyRowToPieceRecord,
  listLegacyCandidates,
  batchImportLegacyProjects,
  normalizeLegacyCanvas,
  rewriteValueInserts,
  resolveTypeidMapping,
  mergeDevJsonForReconvert,
  getDataFileMtime,
};
