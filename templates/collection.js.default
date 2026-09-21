/**
 * Collection build scripts — see construct2/docs/COLLECTION-SCRIPTS.md
 *
 * Each script receives (pieceRecords, collection, ctx) and returns a new
 * piece list that replaces the open collection's pieceRecords[].
 */

const CollectionScripts = {
  ShufflePieces(pieceRecords) {
    const out = [...(pieceRecords || [])];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out.map((pr) => ({
      displayName: pr.displayName,
      values: pr.values,
      properties: pr.properties,
      overrideProperties: pr.overrideProperties,
      fixedProperties: pr.fixedProperties,
      seed: pr.seed,
    }));
  },
};

module.exports = { CollectionScripts };
