"use strict";

const assert = require("assert");
const {
  splitFixed64,
  splitFixedBytes,
  splitWordAwareToArray,
  byteLength,
  applyCardanoMetadataSplit,
  MAX_BYTES,
} = require("./cardano_metadata_split.js");

function assertChunksWithinByteLimit(chunks, maxBytes = MAX_BYTES) {
  for (const chunk of chunks) {
    assert.ok(
      byteLength(chunk) <= maxBytes,
      `chunk exceeds ${maxBytes} bytes: ${byteLength(chunk)} "${chunk}"`,
    );
  }
}

// ASCII: 64 chars = 64 bytes (one chunk), 65 chars = two chunks
{
  const ascii64 = "a".repeat(64);
  const ascii65 = "a".repeat(65);
  assert.strictEqual(splitFixed64(ascii64).length, 1);
  assert.strictEqual(splitFixed64(ascii65).length, 2);
  assertChunksWithinByteLimit(splitFixed64(ascii65));
}

// 2-byte glyphs: 32 chars = 64 bytes
{
  const glyph = "Ĩ";
  assert.strictEqual(byteLength(glyph), 2);
  const s32 = glyph.repeat(32);
  const s33 = glyph.repeat(33);
  assert.strictEqual(byteLength(s32), 64);
  assert.strictEqual(splitFixed64(s32).length, 1);
  assert.strictEqual(splitFixed64(s33).length, 2);
  assertChunksWithinByteLimit(splitFixed64(s33));
}

// Capital prefix: Δ (2 bytes) + letter (2 bytes) = 4 bytes per capital glyph pair
{
  const capWord = "Δ" + "Ĩ".repeat(31);
  assert.strictEqual(byteLength(capWord), 64);
  assert.strictEqual(splitFixed64(capWord).length, 1);
  const over = capWord + "Ĩ";
  assert.strictEqual(splitFixed64(over).length, 2);
  assertChunksWithinByteLimit(splitFixed64(over));
}

// Word-aware split of a long unicode primer
{
  const longPrimer = "Ĩ".repeat(80) + " precise poetic guidance across many words here.";
  assert.ok(byteLength(longPrimer) > MAX_BYTES);
  const parts = splitWordAwareToArray(longPrimer);
  assert.ok(Array.isArray(parts));
  assert.ok(parts.length > 1);
  assertChunksWithinByteLimit(parts);
}

// applyCardanoMetadataSplit on metadata with a long primer
{
  const longName = "Ĩ".repeat(40);
  const meta = {
    721: {
      policy123: {
        Piece00001: {
          name: longName,
          primer: splitWordAwareToArray(
            "a layered field of light and motion across a quiet garden. It offers precise geometric guidance that reveals the most meaningful path forward. " +
              "Ĩ".repeat(40),
          ),
          files: [{ mediaType: "text/html", name: "00001", src: "x".repeat(200) }],
        },
      },
    },
  };
  const out = applyCardanoMetadataSplit(meta);
  const primer = out["721"].policy123.Piece00001.primer;
  assert.ok(Array.isArray(primer));
  for (const chunk of primer) {
    assert.ok(byteLength(chunk) <= MAX_BYTES);
  }
}

console.log("cardano_metadata_split.test.js OK");
