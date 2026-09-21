const assert = require("assert");
const {
  parseLlmValueJson,
  enforceMaxLength,
  buildLlmUserMessage,
  generateOneValueField,
  valueMaxLengthHint,
} = require("./auto_generate.js");

assert.strictEqual(valueMaxLengthHint("description"), 200);
assert.strictEqual(valueMaxLengthHint("name"), null);

assert.deepStrictEqual(
  parseLlmValueJson('{"value":"Quiet Harbor"}'),
  { value: "Quiet Harbor" },
);
assert.deepStrictEqual(
  parseLlmValueJson('```json\n{"value":"x"}\n```'),
  { value: "x" },
);

assert.strictEqual(enforceMaxLength("hello world", 5), "hello");

const resolved = {
  ok: true,
  resolvedPrompt: "Write a primer for [values.name].",
  peerBlock: "Here are examples…",
  context: {
    collection: { brief: "Warm dusk", name: "Test Collection" },
    values: { name: "Quiet Harbor" },
    properties: { Theme: "Calm", Mode: "Bright" },
    piece: { num: "0003", displayName: "0003 Quiet Harbor" },
  },
};

const userMsg = buildLlmUserMessage("description", resolved);
assert.ok(userMsg.includes("Field: values.description"));
assert.ok(userMsg.includes("Max length: 200"));
assert.ok(userMsg.includes("collection.brief: Warm dusk"));
assert.ok(userMsg.includes("values.name: Quiet Harbor"));
assert.ok(userMsg.includes("Here are examples"));
assert.ok(userMsg.includes("Write a primer"));

(async () => {
  const mockFetch = async () => ({
    ok: true,
    text: async () =>
      JSON.stringify({
        choices: [{ message: { content: '{"value":"Generated name"}' } }],
      }),
  });
  const gen = await generateOneValueField({
    apiKey: "test-key",
    key: "name",
    resolved,
    fetchImpl: mockFetch,
  });
  assert.strictEqual(gen.ok, true);
  assert.strictEqual(gen.value, "Generated name");
  console.log("auto_generate tests OK");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
