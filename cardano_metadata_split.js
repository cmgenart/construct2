"use strict";

/**
 * Post-process CIP-25 metadata for Cardano string limits.
 * See docs/METADATA-BUILDER.md — applied when settings.cardanoMetadataSplit is on (default).
 */

const MAX_BYTES = 64;

function byteLength(str) {
  if (typeof Buffer !== "undefined") return Buffer.byteLength(str, "utf8");
  return new Blob([str]).size;
}

function normalizeQuotes(str) {
  return String(str ?? "").replace(/"/g, "'");
}

/** Coerce build utf8link / legacy chunk array to a single string. */
function normalizeUtf8link(artSrc) {
  if (typeof artSrc === "string") return artSrc;
  if (Array.isArray(artSrc)) return artSrc.join("");
  return "";
}

function isHtmlMediaFile(file) {
  return (
    file &&
    typeof file === "object" &&
    String(file.mediaType || "")
      .toLowerCase()
      .includes("text/html")
  );
}

/**
 * Fill empty text/html `src` from the build utf8link (fallback only).
 * Project metadata.js normally sets `src` from `artSrc` in CreateMetadata.
 * @param {object} metadata
 * @param {string|string[]} utf8link
 * @returns {object}
 */
function injectUtf8ArtSrc(metadata, utf8link) {
  const link = normalizeUtf8link(utf8link);
  if (!link || !metadata || typeof metadata !== "object") return metadata;
  const out = JSON.parse(JSON.stringify(metadata));
  const c721 = out["721"];
  if (!c721 || typeof c721 !== "object") return out;
  for (const policy of Object.keys(c721)) {
    const assets = c721[policy];
    if (!assets || typeof assets !== "object") continue;
    for (const assetKey of Object.keys(assets)) {
      const asset = assets[assetKey];
      if (!asset || typeof asset !== "object" || !Array.isArray(asset.files)) continue;
      for (const file of asset.files) {
        if (!isHtmlMediaFile(file)) continue;
        const src = file.src;
        if (src == null || src === "") file.src = link;
      }
    }
  }
  return out;
}

/**
 * Optional fallback inject for empty `src`, then Cardano string splitting when enabled.
 * @param {object} metadata
 * @param {string|string[]} utf8link
 * @param {boolean} [cardanoSplit=true]
 * @returns {object}
 */
function finalizeMetadataForBuild(metadata, utf8link, cardanoSplit = true) {
  let out = injectUtf8ArtSrc(metadata, utf8link);
  if (cardanoSplit !== false) out = applyCardanoMetadataSplit(out);
  return out;
}

/** Split a string into chunks where each chunk is at most maxBytes UTF-8 bytes. */
function splitFixedBytes(str, maxBytes = MAX_BYTES) {
  const s = normalizeQuotes(str);
  if (!s) return [];
  const chunks = [];
  let current = "";
  let currentBytes = 0;

  for (const ch of s) {
    const chBytes = byteLength(ch);
    if (chBytes > maxBytes) {
      if (current) {
        chunks.push(current);
        current = "";
        currentBytes = 0;
      }
      chunks.push(ch);
      continue;
    }
    if (currentBytes + chBytes > maxBytes) {
      chunks.push(current);
      current = ch;
      currentBytes = chBytes;
    } else {
      current += ch;
      currentBytes += chBytes;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Fixed-size chunks (utf8link / files[].src). Byte-aware — maxBytes is UTF-8, not char count. */
function splitFixed64(str, maxBytes = MAX_BYTES) {
  return splitFixedBytes(str, maxBytes);
}

/** Force every segment to <= maxBytes (Cardano requirement). */
function enforceMaxSegmentLength(parts, maxBytes = MAX_BYTES) {
  const out = [];
  for (const part of parts) {
    const t = String(part ?? "").trim();
    if (!t) continue;
    if (byteLength(t) <= maxBytes) {
      out.push(t);
    } else {
      out.push(...splitFixedBytes(t, maxBytes));
    }
  }
  return out.length ? out : [""];
}

/** Word-aware segments; tokens longer than maxBytes are hard-split by bytes. */
function splitWordAwareToArray(str, maxBytes = MAX_BYTES) {
  const s = normalizeQuotes(str);
  if (!s) return [];
  if (byteLength(s) <= maxBytes) return [s];

  const parts = [];
  let current = "";
  let currentBytes = 0;
  const words = s.match(/\S+\s*|\n+/g) || [];

  for (const word of words) {
    const wBytes = byteLength(word);
    if (wBytes > maxBytes) {
      if (current) {
        parts.push(current);
        current = "";
        currentBytes = 0;
      }
      parts.push(...splitFixedBytes(word, maxBytes));
      continue;
    }
    if (currentBytes + wBytes > maxBytes) {
      if (current) parts.push(current);
      current = word;
      currentBytes = wBytes;
    } else {
      current += word;
      currentBytes = byteLength(current);
    }
  }

  if (current) parts.push(current);
  return parts.length ? parts : splitFixedBytes(s, maxBytes);
}

function processLeafString(str, isArtSrc) {
  const s = normalizeQuotes(str);
  if (isArtSrc) return splitFixed64(s);
  if (byteLength(s) <= MAX_BYTES) return s;
  const parts = splitWordAwareToArray(s);
  return parts.length === 1 ? parts[0] : parts;
}

function processFileEntry(file) {
  if (!file || typeof file !== "object") return file;
  const f = { ...file };
  if (typeof f.src === "string") {
    f.src = processLeafString(f.src, true);
  } else if (Array.isArray(f.src)) {
    f.src = processLeafString(f.src.join(""), true);
  }
  if (typeof f.name === "string") {
    f.name = processLeafString(f.name, false);
  }
  if (typeof f.mediaType === "string" && byteLength(f.mediaType) > MAX_BYTES) {
    f.mediaType = processLeafString(f.mediaType, false);
  }
  return f;
}

function processNestedObject(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") {
      result[k] = processLeafString(v, false);
    } else if (Array.isArray(v)) {
      result[k] = v.map((item) =>
        typeof item === "string" ? processLeafString(item, false) : item,
      );
    } else if (v && typeof v === "object") {
      result[k] = processNestedObject(v);
    } else {
      result[k] = v;
    }
  }
  return result;
}

function processAssetRecord(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    if (key === "files" && Array.isArray(val)) {
      result.files = val.map(processFileEntry);
    } else if (val && typeof val === "object" && !Array.isArray(val)) {
      result[key] = processNestedObject(val);
    } else if (Array.isArray(val)) {
      result[key] = val.map((item) =>
        typeof item === "string" ? processLeafString(item, false) : item,
      );
    } else if (typeof val === "string") {
      result[key] = processLeafString(val, false);
    } else {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Deep-clone and split leaf strings under 721 → policy → asset records.
 * Map keys (policy id, asset name) are never modified.
 * @param {object} metadata — full metadata root from CreateMetadata
 * @returns {object}
 */
function applyCardanoMetadataSplit(metadata) {
  if (!metadata || typeof metadata !== "object") return metadata;
  const out = JSON.parse(JSON.stringify(metadata));
  const c721 = out["721"];
  if (!c721 || typeof c721 !== "object") return out;
  for (const policy of Object.keys(c721)) {
    const assets = c721[policy];
    if (!assets || typeof assets !== "object") continue;
    for (const assetKey of Object.keys(assets)) {
      assets[assetKey] = processAssetRecord(assets[assetKey]);
    }
  }
  return out;
}

module.exports = {
  injectUtf8ArtSrc,
  finalizeMetadataForBuild,
  applyCardanoMetadataSplit,
  normalizeUtf8link,
  splitFixed64,
  splitFixedBytes,
  splitWordAwareToArray,
  byteLength,
  MAX_BYTES,
};
