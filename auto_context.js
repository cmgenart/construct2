/**
 * Build auto-generation resolve context from collection + dev state.
 * @see docs/AUTO-GENERATION.md §5.2, §5.4, §8
 */

const CollectionFs = require("./collection_fs.js");
const { normalizeAutoSettings } = require("./collection_fs.js");
const CollectionRuntime = require("./collection_runtime.js");
const {
  resolvePrompt,
  extractPromptDependencies,
  formatInlinePeerExamples,
  buildPeerExamplesBlock,
  detectValueAutoCycles,
} = require("./auto_resolve.js");

const EXAMPLE_INSERT_RE = /\[examples\.([a-zA-Z0-9_]+)\]/g;

/**
 * Effective auto prompt for a value key (collection → default inheritance).
 * @param {string} key
 * @param {{ default?: object, collection?: object }} valueAutoLevels
 * @returns {{ level: string, enabled: boolean, prompt: string }|null}
 */
function getEffectiveValueAutoEntry(key, valueAutoLevels) {
  const levels = valueAutoLevels || {};
  const coll = levels.collection?.[key];
  const def = levels.default?.[key];

  if (coll?.enabled) {
    const prompt = coll.prompt != null ? String(coll.prompt).trim() : "";
    if (prompt) {
      return { level: "collection", enabled: true, prompt };
    }
  }
  if (def?.enabled) {
    const prompt = def.prompt != null ? String(def.prompt).trim() : "";
    if (prompt) {
      return { level: "default", enabled: true, prompt };
    }
  }
  return null;
}

function mergeValueAutoLevels(devLevels, collectionAutoRoot) {
  const fileColl =
    collectionAutoRoot?.collection &&
    typeof collectionAutoRoot.collection === "object"
      ? collectionAutoRoot.collection
      : {};
  return {
    default: { ...(devLevels?.default || {}) },
    collection: {
      ...(devLevels?.collection || {}),
      ...fileColl,
    },
  };
}

function flatMergedValues(devBuildValueLevels, collection, pieceRecord, devSeed) {
  const bags = CollectionRuntime.buildCollectionValueBags(
    devBuildValueLevels,
    collection,
    pieceRecord,
  );
  const seed =
    pieceRecord?.seed != null && !Number.isNaN(Number(pieceRecord.seed))
      ? Number(pieceRecord.seed)
      : devSeed;
  return CollectionRuntime.mergeBuildValueBags(bags, seed);
}

function mergedProperties(devPropertyLevels, collection, pieceRecord) {
  return CollectionRuntime.mergePropertiesForPreview(
    devPropertyLevels,
    collection,
    pieceRecord,
  );
}

function pieceDisplayLabel(pieceRecord) {
  if (!pieceRecord) return "";
  const p4 = CollectionFs.pad4(pieceRecord.num);
  const bag = pieceRecord.values || {};
  let name = "";
  const nameEntry = bag.name;
  if (nameEntry && typeof nameEntry === "object" && nameEntry.value != null) {
    name = String(nameEntry.value);
  } else if (pieceRecord.displayName) {
    name = String(pieceRecord.displayName).replace(/^\d{4}:?\s*/, "");
  }
  if (!name) name = `Piece ${p4}`;
  return `${p4} ${name}`;
}

/**
 * @param {object} params
 * @returns {import("./auto_resolve.js").AutoResolveContext}
 */
function buildAutoResolveContext(params) {
  const {
    devBuildValueLevels,
    devPropertyLevels,
    devSeed,
    collection,
    pieceRecord,
  } = params;
  const values = flatMergedValues(
    devBuildValueLevels,
    collection,
    pieceRecord,
    devSeed,
  );
  const properties = mergedProperties(
    devPropertyLevels,
    collection,
    pieceRecord,
  );
  return {
    values,
    properties,
    collection: {
      brief: collection?.autoBrief != null ? String(collection.autoBrief) : "",
      name: CollectionFs.collectionDisplayName(collection, ""),
    },
    piece: {
      num: CollectionFs.pad4(pieceRecord?.num),
      displayName: pieceDisplayLabel(pieceRecord),
    },
    examples: {},
  };
}

function extractExampleKeys(prompt) {
  const keys = new Set();
  const text = String(prompt ?? "");
  let m;
  while ((m = EXAMPLE_INSERT_RE.exec(text)) !== null) {
    if (m[1]) keys.add(m[1]);
  }
  return [...keys];
}

function peerHasAnyKey(values, keys) {
  return (keys || []).some((k) => {
    const v = values?.[k];
    return v != null && String(v).trim() !== "";
  });
}

function peerHasTargetKey(values, targetKey) {
  const v = values?.[targetKey];
  return v != null && String(v).trim() !== "";
}

/**
 * Collect peer pieces for examples (excludes current piece).
 * @param {object} params
 * @returns {object[]}
 */
function collectAutoPeers(params) {
  const {
    collection,
    pieceRecord,
    devBuildValueLevels,
    devPropertyLevels,
    devSeed,
    targetKey,
    peerExampleKeys,
    maxPeers = 5,
    mode = "single",
  } = params;
  const out = [];
  for (const pr of collection?.pieceRecords || []) {
    if (!pr || (pieceRecord && pr.id === pieceRecord.id)) continue;
    const values = flatMergedValues(
      devBuildValueLevels,
      collection,
      pr,
      pr.seed != null ? pr.seed : devSeed,
    );
    if (mode === "single") {
      if (!peerHasTargetKey(values, targetKey)) continue;
    } else if (!peerHasAnyKey(values, peerExampleKeys)) {
      continue;
    }
    const merged = mergedProperties(devPropertyLevels, collection, pr);
    const properties = {
      ...merged,
      ...(collection?.fixedProperties || {}),
      ...(pr.fixedProperties || {}),
    };
    out.push({
      id: pr.id,
      num: CollectionFs.pad4(pr.num),
      values,
      properties,
    });
  }
  out.sort((a, b) => parseInt(a.num, 10) - parseInt(b.num, 10));
  return out.slice(0, maxPeers);
}

/**
 * Resolve prompt inserts + optional trailing peer block for one value key.
 * @param {object} params
 */
function buildResolvedAutoPrompt(params) {
  const {
    key,
    valueAutoLevels,
    devBuildValueLevels,
    devPropertyLevels,
    devSeed,
    collection,
    pieceRecord,
    autoSettings,
    includePeerBlock = true,
    peerMode = "single",
  } = params;

  const entry = getEffectiveValueAutoEntry(key, valueAutoLevels);
  if (!entry) {
    return { ok: false, error: `No effective auto prompt for key "${key}"` };
  }

  const settings = normalizeAutoSettings(
    autoSettings || collection?.autoSettings,
  );
  const context = buildAutoResolveContext({
    devBuildValueLevels,
    devPropertyLevels,
    devSeed,
    collection,
    pieceRecord,
  });

  const peers =
    settings.includePeerExamples &&
    (includePeerBlock || extractExampleKeys(entry.prompt).length)
      ? collectAutoPeers({
          collection,
          pieceRecord,
          devBuildValueLevels,
          devPropertyLevels,
          devSeed,
          targetKey: key,
          peerExampleKeys: settings.peerExampleKeys,
          maxPeers: settings.peerExampleMax,
          mode: peerMode,
        })
      : [];

  const examples = {};
  for (const ek of extractExampleKeys(entry.prompt)) {
    examples[ek] = formatInlinePeerExamples(
      peers,
      ek,
      settings.peerExampleMax,
    );
  }

  const resolveCtx = { ...context, examples };
  const { text, unknownTokens } = resolvePrompt(entry.prompt, resolveCtx);
  const peerBlock =
    includePeerBlock && settings.includePeerExamples
      ? buildPeerExamplesBlock(peers, key, {
          maxPeers: settings.peerExampleMax,
          peerKeys: settings.peerExampleKeys,
          template: settings.peerExampleTemplate,
          intro: settings.peerExampleIntro,
          outro: settings.peerExampleOutro,
          separator: settings.peerExampleSeparator,
          collection: {
            brief: collection?.autoBrief != null ? String(collection.autoBrief) : "",
            name: CollectionFs.collectionDisplayName(collection, ""),
          },
        })
      : "";

  const fullUserMessage = peerBlock ? `${text}\n\n${peerBlock}` : text;

  return {
    ok: true,
    key,
    level: entry.level,
    promptTemplate: entry.prompt,
    resolvedPrompt: text,
    peerBlock,
    fullUserMessage,
    unknownTokens,
    dependencies: extractPromptDependencies(entry.prompt),
    context: resolveCtx,
    peers: peers.map((p) => ({
      num: p.num,
      values: p.values,
      properties: p.properties,
    })),
    autoSettings: settings,
  };
}

module.exports = {
  getEffectiveValueAutoEntry,
  mergeValueAutoLevels,
  buildAutoResolveContext,
  collectAutoPeers,
  buildResolvedAutoPrompt,
  extractExampleKeys,
  detectValueAutoCycles,
};
