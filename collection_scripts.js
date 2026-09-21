/**
 * Run project collection.js scripts — replace pieceRecords on open collection.
 * @see docs/COLLECTION-SCRIPTS.md
 */
const fs = require("fs");
const path = require("path");
const CollectionFs = require("./collection_fs.js");
const { loadCollectionScripts } = require("./collection_loader.js");

function capitalizeWord(s) {
  const str = String(s ?? "");
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * @param {string} projectPath
 * @param {string} pad2
 */
function buildScriptContext(projectPath, pad2) {
  const absProject = path.resolve(__dirname, projectPath);
  return {
    projectPath: absProject,
    pad2,
    readJson(relativePath) {
      const fp = path.join(absProject, relativePath);
      const raw = fs.readFileSync(fp, "utf8");
      return JSON.parse(raw);
    },
    capitalize: capitalizeWord,
    randomSeed(salt = 0) {
      return CollectionFs.randomPieceSeed(salt);
    },
    newPieceRecord(num, opts) {
      return CollectionFs.newPieceRecord(num, opts);
    },
  };
}

/**
 * @param {object[]} stubs
 * @param {object} ctx
 */
function normalizePieceStubs(stubs, ctx) {
  return stubs.map((stub, i) => {
    const num = i + 1;
    const seed =
      stub && stub.seed != null
        ? stub.seed
        : ctx.randomSeed(i);
    return ctx.newPieceRecord(num, {
      displayName: stub?.displayName,
      values: stub?.values || {},
      properties: stub?.properties || {},
      overrideProperties: stub?.overrideProperties || {},
      fixedProperties: stub?.fixedProperties || {},
      seed,
      buildStatus: "unbuilt",
    });
  });
}

function applyCollectionPatch(coll, patch) {
  if (!patch || typeof patch !== "object") return;
  if (patch.name != null) coll.name = patch.name;
  if (patch.values && typeof patch.values === "object") {
    coll.values = { ...(coll.values || {}), ...patch.values };
  }
  if (patch.propertyOverrides && typeof patch.propertyOverrides === "object") {
    coll.propertyOverrides = {
      ...(coll.propertyOverrides || {}),
      ...patch.propertyOverrides,
    };
  }
  if (patch.fixedProperties && typeof patch.fixedProperties === "object") {
    coll.fixedProperties = {
      ...(coll.fixedProperties || {}),
      ...patch.fixedProperties,
    };
  }
  if (patch.mint && typeof patch.mint === "object") {
    coll.mint = { ...(coll.mint || {}), ...patch.mint };
  }
  if (patch.autoBrief != null) coll.autoBrief = patch.autoBrief;
}

/**
 * @param {string} projectPath
 * @param {string} pad2
 * @param {string} scriptName
 */
function runCollectionScript(projectPath, pad2, scriptName) {
  const name = String(scriptName || "").trim();
  if (!name) return { ok: false, error: "scriptName required" };

  const coll = CollectionFs.readCollection(projectPath, pad2);
  if (!coll) return { ok: false, error: "Collection not found" };
  if (coll.frozen) return { ok: false, error: "Collection is frozen" };

  const scripts = loadCollectionScripts(projectPath);
  if (!scripts) return { ok: false, error: "No collection.js with CollectionScripts" };
  const fn = scripts[name];
  if (typeof fn !== "function") {
    return { ok: false, error: `Unknown script: ${name}` };
  }

  const ctx = buildScriptContext(projectPath, pad2);
  let result;
  try {
    result = fn(coll.pieceRecords || [], coll, ctx);
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }

  let stubs;
  let collectionPatch;
  if (Array.isArray(result)) {
    stubs = result;
  } else if (
    result &&
    typeof result === "object" &&
    Array.isArray(result.pieceRecords)
  ) {
    stubs = result.pieceRecords;
    collectionPatch = result.collectionPatch;
  } else {
    return {
      ok: false,
      error: "Script must return PieceStub[] or { pieceRecords, collectionPatch? }",
    };
  }

  if (stubs.length > CollectionFs.MAX_PIECES) {
    return {
      ok: false,
      error: `Too many pieces (${stubs.length}, max ${CollectionFs.MAX_PIECES})`,
    };
  }

  const pieceRecords = normalizePieceStubs(stubs, ctx);
  CollectionFs.deleteBuildTree(projectPath, pad2);
  applyCollectionPatch(coll, collectionPatch);
  coll.pieceRecords = pieceRecords;
  CollectionFs.writeCollection(projectPath, coll);
  CollectionFs.enrichCollectionForClient(projectPath, pad2, coll);

  return {
    ok: true,
    collection: coll,
    pieceCount: pieceRecords.length,
    scriptName: name,
  };
}

module.exports = {
  buildScriptContext,
  normalizePieceStubs,
  runCollectionScript,
  applyCollectionPatch,
};
