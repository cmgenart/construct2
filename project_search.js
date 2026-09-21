/**
 * Tiered fuzzy project search — shared by renderer and Node tests.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ProjectSearch = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SCORE_FLOOR = 0.35;
  const CHUNK_SIZE = 50;

  function folderLabel(root) {
    if (!root) return "folder/";
    if (root.id === "__recent__") return "recent/";
    if (root.id === "art") return "art/";
    if (root.id === "legacy") return "art-legacy/";
    const label = String(root.label || "").trim();
    if (label && !label.endsWith("/")) return label + "/";
    return label || "folder/";
  }

  /**
   * @param {object} listData
   * @param {object} [workspace]
   */
  function buildSearchIndex(listData, workspace = {}) {
    const entries = [];
    const seen = new Set();
    const roots = listData?.roots || [];

    for (const root of roots) {
      const rootLabel = folderLabel(root);
      for (const p of root.projects || []) {
        const key = String(p.path).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push({
          project: p,
          rootId: root.id,
          rootLabel,
          searchText: (p.name + " " + rootLabel).toLowerCase(),
        });
      }
    }

    for (const item of (workspace.recentProjects || []).slice(0, 10)) {
      const key = String(item.path).toLowerCase();
      if (seen.has(key)) continue;
      const root = roots.find((r) => r.id === item.rootId);
      const rootLabel = root ? folderLabel(root) : "recent/";
      seen.add(key);
      entries.push({
        project: {
          name: item.name,
          path: item.path,
          kind: item.kind,
          flags: item.flags,
          legacy: item.legacy,
        },
        rootId: item.rootId || null,
        rootLabel,
        searchText: (item.name + " " + rootLabel).toLowerCase(),
      });
    }

    return entries;
  }

  /**
   * @param {string} query
   * @param {string} target
   */
  function wordBoundaryPrefixScore(query, target) {
    if (!query || !target) return 0;
    const words = target.split(/[^a-z0-9]+/).filter(Boolean);
    for (const w of words) {
      if (w.startsWith(query)) return 1.0;
    }
    if (target.startsWith(query)) return 0.98;
    return 0;
  }

  /**
   * @param {string} query
   * @param {string} target
   */
  function substringScore(query, target) {
    const idx = target.indexOf(query);
    if (idx < 0) return 0;
    const offsetPenalty = (idx / Math.max(target.length, 1)) * 0.1;
    const lenBonus = (query.length / Math.max(target.length, 1)) * 0.05;
    return Math.max(0, Math.min(0.95, 0.85 + lenBonus - offsetPenalty));
  }

  /**
   * @param {string} query
   * @param {string} target
   */
  function subsequenceScore(query, target) {
    let qi = 0;
    let matched = 0;
    for (let ti = 0; ti < target.length && qi < query.length; ti++) {
      if (target[ti] === query[qi]) {
        qi += 1;
        matched += 1;
      }
    }
    if (qi !== query.length) return 0;
    const gaps = target.length - matched;
    const tightness = query.length / Math.max(query.length + gaps, 1);
    return 0.4 + tightness * 0.44;
  }

  /**
   * @param {string} rawQuery
   * @param {string} target
   */
  function scoreTarget(rawQuery, target) {
    const query = String(rawQuery || "")
      .trim()
      .toLowerCase();
    if (!query) return 0;
    const t = String(target || "").toLowerCase();
    if (!t) return 0;

    let score = wordBoundaryPrefixScore(query, t);
    const sub = substringScore(query, t);
    if (sub > score) score = sub;
    if (score < 0.85) {
      const seq = subsequenceScore(query, t);
      if (seq > score) score = seq;
    }
    return score;
  }

  /**
   * @param {string} rawQuery
   * @param {object[]} index
   */
  function scoreProjects(rawQuery, index) {
    const query = String(rawQuery || "").trim();
    if (!query) return [];
    const out = [];
    for (const entry of index) {
      const score = scoreTarget(query, entry.searchText);
      if (score >= SCORE_FLOOR) {
        out.push({ ...entry, score });
      }
    }
    out.sort((a, b) => b.score - a.score || a.project.name.localeCompare(b.project.name));
    return out;
  }

  /**
   * @param {string} rawQuery
   * @param {object[]} index
   * @param {object} [opts]
   * @param {(results: object[]) => void} [opts.onPartial]
   * @param {number} [opts.chunkSize]
   */
  function scoreProjectsChunked(rawQuery, index, opts = {}) {
    const query = String(rawQuery || "").trim();
    const chunkSize = opts.chunkSize || CHUNK_SIZE;
    const onPartial = opts.onPartial || (() => {});

    return new Promise((resolve) => {
      if (!query) {
        resolve([]);
        return;
      }

      const acc = [];
      let i = 0;

      const step = () => {
        const end = Math.min(i + chunkSize, index.length);
        for (; i < end; i++) {
          const entry = index[i];
          const score = scoreTarget(query, entry.searchText);
          if (score >= SCORE_FLOOR) acc.push({ ...entry, score });
        }
        acc.sort(
          (a, b) => b.score - a.score || a.project.name.localeCompare(b.project.name),
        );
        onPartial(acc.slice());

        if (i < index.length) {
          if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(step);
          } else {
            setTimeout(step, 0);
          }
        } else {
          resolve(acc);
        }
      };

      step();
    });
  }

  return {
    SCORE_FLOOR,
    CHUNK_SIZE,
    folderLabel,
    buildSearchIndex,
    scoreTarget,
    scoreProjects,
    scoreProjectsChunked,
    wordBoundaryPrefixScore,
    substringScore,
    subsequenceScore,
  };
});
