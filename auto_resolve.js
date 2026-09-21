/**
 * Template insert resolution for auto-generation prompts.
 * @see docs/AUTO-GENERATION.md §8
 */

const INSERT_RE = /\[([a-zA-Z0-9_.]+)\]/g;

const DEFAULT_PEER_EXAMPLE_TEMPLATE = `num: [values.num]
name: [values.name]
description: [values.description]`;

const DEFAULT_PEER_EXAMPLE_INTRO =
  "Here are examples from other pieces in this collection (match this tone and style; do not copy verbatim):";

const DEFAULT_PEER_EXAMPLE_OUTRO =
  "Generate a new entry in the same spirit for the current piece.";

const DEFAULT_PEER_EXAMPLE_SEPARATOR = "---";

/**
 * @typedef {object} AutoResolveContext
 * @property {Record<string, string>} [values]
 * @property {Record<string, string>} [properties]
 * @property {{ brief?: string, name?: string }} [collection]
 * @property {{ num?: string, displayName?: string }} [piece]
 * @property {Record<string, string>} [examples]
 */

/**
 * Resolve `[namespace.key]` tokens in a prompt string.
 * @param {string} template
 * @param {AutoResolveContext} ctx
 * @param {{ unknown?: 'keep'|'warn' }} [opts]
 * @returns {{ text: string, unknownTokens: string[] }}
 */
function resolvePrompt(template, ctx, opts = {}) {
  const unknown = [];
  const values = ctx?.values || {};
  const properties = ctx?.properties || {};
  const collection = ctx?.collection || {};
  const piece = ctx?.piece || {};
  const examples = ctx?.examples || {};

  const text = String(template ?? "").replace(INSERT_RE, (match, token) => {
    const resolved = resolveToken(token, {
      values,
      properties,
      collection,
      piece,
      examples,
    });
    if (resolved == null) {
      unknown.push(match);
      if (opts.unknown === "empty") return "";
      return match;
    }
    return resolved;
  });

  return { text, unknownTokens: unknown };
}

/**
 * @param {string} token e.g. values.name
 * @param {object} bags
 * @returns {string|null}
 */
function resolveToken(token, bags) {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const ns = token.slice(0, dot);
  const key = token.slice(dot + 1);
  if (!key) return null;

  if (ns === "values") {
    if (!(key in bags.values)) return null;
    return String(bags.values[key] ?? "");
  }
  if (ns === "properties") {
    if (!(key in bags.properties)) return null;
    return String(bags.properties[key] ?? "");
  }
  if (ns === "collection") {
    if (key === "brief") return String(bags.collection.brief ?? "");
    if (key === "name") return String(bags.collection.name ?? "");
    return null;
  }
  if (ns === "piece") {
    if (key === "num") return String(bags.piece.num ?? "");
    if (key === "displayName") return String(bags.piece.displayName ?? "");
    return null;
  }
  if (ns === "examples") {
    if (!(key in bags.examples)) return null;
    return String(bags.examples[key] ?? "");
  }
  return null;
}

/**
 * Extract `[values.foo]` / `[properties.Bar]` dependency keys from a prompt.
 * @param {string} prompt
 * @returns {{ values: string[], properties: string[] }}
 */
function extractPromptDependencies(prompt) {
  const values = new Set();
  const properties = new Set();
  const text = String(prompt ?? "");
  let m;
  const re = /\[([a-zA-Z0-9_.]+)\]/g;
  while ((m = re.exec(text)) !== null) {
    const token = m[1];
    const dot = token.indexOf(".");
    if (dot <= 0) continue;
    const ns = token.slice(0, dot);
    const key = token.slice(dot + 1);
    if (ns === "values" && key) values.add(key);
    if (ns === "properties" && key) properties.add(key);
  }
  return {
    values: [...values],
    properties: [...properties],
  };
}

/**
 * Detect circular dependencies among auto keys (values.* cross-refs only).
 * @param {Record<string, { prompt?: string }>} autoKeys
 * @returns {string[]|null} cycle path or null
 */
function detectValueAutoCycles(autoKeys) {
  const graph = {};
  for (const [key, entry] of Object.entries(autoKeys || {})) {
    const deps = extractPromptDependencies(entry?.prompt || "").values.filter(
      (d) => d !== key,
    );
    graph[key] = deps;
  }
  const visiting = new Set();
  const visited = new Set();

  /** @param {string} node @param {string[]} path */
  function dfs(node, path) {
    if (visiting.has(node)) {
      const idx = path.indexOf(node);
      return idx >= 0 ? path.slice(idx).concat(node) : [node, node];
    }
    if (visited.has(node)) return null;
    visiting.add(node);
    for (const next of graph[node] || []) {
      if (!(next in graph)) continue;
      const cycle = dfs(next, path.concat(node));
      if (cycle) return cycle;
    }
    visiting.delete(node);
    visited.add(node);
    return null;
  }

  for (const key of Object.keys(graph)) {
    const cycle = dfs(key, []);
    if (cycle) return cycle;
  }
  return null;
}

/**
 * Build trailing peer-examples block for LLM user message (§5.4).
 * Each peer is formatted with the same insert syntax as prompts.
 * @param {object[]} peers
 * @param {string} _targetKey legacy arg (peer selection only)
 * @param {{
 *   maxPeers?: number,
 *   peerKeys?: string[],
 *   template?: string,
 *   intro?: string,
 *   outro?: string,
 *   separator?: string,
 *   collection?: { brief?: string, name?: string },
 * }} [opts]
 */
function buildPeerExamplesBlock(peers, _targetKey, opts = {}) {
  const maxPeers = opts.maxPeers ?? 5;
  const template = opts.template ?? DEFAULT_PEER_EXAMPLE_TEMPLATE;
  const intro = opts.intro ?? DEFAULT_PEER_EXAMPLE_INTRO;
  const outro = opts.outro ?? DEFAULT_PEER_EXAMPLE_OUTRO;
  const separator = opts.separator ?? DEFAULT_PEER_EXAMPLE_SEPARATOR;
  const collection = opts.collection || {};
  const slice = (peers || []).slice(0, maxPeers);
  const blocks = [];

  for (const p of slice) {
    const name = (p.values || {}).name;
    const ctx = {
      values: p.values || {},
      properties: p.properties || {},
      collection: {
        brief: collection.brief != null ? String(collection.brief) : "",
        name: collection.name != null ? String(collection.name) : "",
      },
      piece: {
        num: p.num != null ? String(p.num) : "",
        displayName: name
          ? `${p.num || ""} ${name}`.trim()
          : p.num != null
            ? String(p.num)
            : "",
      },
      examples: {},
    };
    const { text } = resolvePrompt(String(template), ctx, { unknown: "empty" });
    const trimmed = text.trim();
    if (trimmed) blocks.push(trimmed);
  }

  if (!blocks.length) return "";

  let out = "";
  if (String(intro).trim()) out += String(intro).trim() + "\n\n";
  out += blocks.join(`\n${separator}\n`);
  if (String(outro).trim()) out += "\n\n" + String(outro).trim();
  return out;
}

/**
 * Compact inline list for `[examples.key]` token.
 * @param {object[]} peers
 * @param {string} key
 * @param {number} [max]
 */
function formatInlinePeerExamples(peers, key, max = 5) {
  const parts = [];
  for (const p of (peers || []).slice(0, max)) {
    const v = (p.values || {})[key];
    if (!v || !String(v).trim()) continue;
    const label = p.num ? `${p.num}: ` : "";
    parts.push(`${label}${String(v).trim()}`);
  }
  return parts.join("; ");
}

module.exports = {
  resolvePrompt,
  resolveToken,
  extractPromptDependencies,
  detectValueAutoCycles,
  buildPeerExamplesBlock,
  formatInlinePeerExamples,
  INSERT_RE,
  DEFAULT_PEER_EXAMPLE_TEMPLATE,
  DEFAULT_PEER_EXAMPLE_INTRO,
  DEFAULT_PEER_EXAMPLE_OUTRO,
  DEFAULT_PEER_EXAMPLE_SEPARATOR,
};
