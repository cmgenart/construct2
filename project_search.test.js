const assert = require("assert");
const path = require("path");

const {
  buildSearchIndex,
  scoreTarget,
  scoreProjects,
  wordBoundaryPrefixScore,
  substringScore,
  subsequenceScore,
  SCORE_FLOOR,
} = require("./project_search.js");

assert.strictEqual(wordBoundaryPrefixScore("demo", "demo-ascii art/"), 1.0);
assert.ok(wordBoundaryPrefixScore("art", "demo-ascii art/") >= 0.98);

assert.ok(substringScore("ascii", "demo-ascii art/") >= 0.8);
assert.strictEqual(substringScore("zzz", "demo-ascii"), 0);

assert.ok(subsequenceScore("dmas", "demo-ascii") >= 0.4);
assert.strictEqual(subsequenceScore("zxq", "demo-ascii"), 0);

assert.ok(scoreTarget("Galaxy", "galaxy art/") >= 0.98);
assert.ok(scoreTarget("prop", "properties example art-legacy/") >= SCORE_FLOOR);
assert.ok(scoreTarget("zzzznotfound", "demo-ascii art/") < SCORE_FLOOR);

const index = buildSearchIndex({
  roots: [
    {
      id: "art",
      label: "art/",
      projects: [
        { name: "Galaxy", path: "/Users/you/Art/galaxy", kind: "construct2" },
        { name: "demo-ascii", path: "/Users/you/Art/demo-ascii", kind: "construct2" },
      ],
    },
    {
      id: "legacy",
      label: "art-legacy/",
      projects: [
        {
          name: "Properties Example",
          path: "/Users/you/ArtLegacy/Properties Example",
          kind: "legacy",
        },
      ],
    },
  ],
});

assert.strictEqual(index.length, 3);

const ranked = scoreProjects("demo", index);
assert.ok(ranked.length >= 1);
assert.ok(ranked[0].score >= ranked[ranked.length - 1].score);
assert.ok(ranked.every((r) => r.project.name.toLowerCase().includes("demo") || r.score >= SCORE_FLOOR));

const empty = scoreProjects("", index);
assert.strictEqual(empty.length, 0);

console.log("project_search.test.js: ok");
