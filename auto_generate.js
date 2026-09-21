/**
 * Single-field auto generation via xAI chat completions.
 * @see docs/AUTO-GENERATION.md §11
 */

const AUTO_SYSTEM_PROMPT = `You generate a single field for a Construct² art piece.
Return ONLY JSON: { "value": "<string>" }
No markdown. No extra keys.
Respect max length if given in the user message.
For property picks, value MUST be exactly one of the listed choices.`;

const DEFAULT_XAI_MODEL = "grok-3-mini";

const VALUE_MAX_LENGTH = {
  description: 200,
};

/**
 * @param {string} key
 * @returns {number|null}
 */
function valueMaxLengthHint(key) {
  if (Object.prototype.hasOwnProperty.call(VALUE_MAX_LENGTH, key)) {
    return VALUE_MAX_LENGTH[key];
  }
  return null;
}

/**
 * @param {string} text
 * @returns {{ value: string }}
 */
function parseLlmValueJson(text) {
  let s = String(text ?? "").trim();
  if (!s) throw new Error("Empty LLM response");
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) {
    s = s.slice(start, end + 1);
  }
  let obj;
  try {
    obj = JSON.parse(s);
  } catch (e) {
    throw new Error("LLM response is not valid JSON");
  }
  if (!obj || typeof obj.value !== "string") {
    throw new Error('LLM JSON must include string "value"');
  }
  return { value: obj.value.trim() };
}

/**
 * @param {string} value
 * @param {number|null} maxLen
 */
function enforceMaxLength(value, maxLen) {
  const v = String(value ?? "");
  if (maxLen == null || maxLen <= 0) return v;
  if (v.length <= maxLen) return v;
  return v.slice(0, maxLen);
}

/**
 * @param {string} key
 * @param {object} resolved buildResolvedAutoPrompt result
 */
function buildLlmUserMessage(key, resolved) {
  const lines = [];
  lines.push(`Field: values.${key}`);
  const maxLen = valueMaxLengthHint(key);
  if (maxLen) lines.push(`Max length: ${maxLen}`);
  lines.push("");
  lines.push("Context:");
  const ctx = resolved.context || {};
  if (ctx.collection?.brief) {
    lines.push(`- collection.brief: ${ctx.collection.brief}`);
  }
  if (ctx.collection?.name) {
    lines.push(`- collection.name: ${ctx.collection.name}`);
  }
  for (const [k, v] of Object.entries(ctx.values || {})) {
    if (v != null && String(v).trim() !== "") {
      lines.push(`- values.${k}: ${v}`);
    }
  }
  for (const [k, v] of Object.entries(ctx.properties || {})) {
    if (v != null && String(v).trim() !== "") {
      lines.push(`- properties.${k}: ${v}`);
    }
  }
  if (ctx.piece?.num) lines.push(`- piece.num: ${ctx.piece.num}`);
  if (ctx.piece?.displayName) {
    lines.push(`- piece.displayName: ${ctx.piece.displayName}`);
  }
  lines.push("");
  if (resolved.peerBlock) {
    lines.push(resolved.peerBlock);
    lines.push("");
  }
  lines.push("Task:");
  lines.push(resolved.resolvedPrompt || "");
  return lines.join("\n");
}

/**
 * @param {string} apiKey
 * @param {object} opts
 * @param {typeof fetch} [fetchImpl]
 */
async function callXaiChatCompletion(apiKey, opts, fetchImpl = fetch) {
  if (!apiKey) throw new Error("xAI API key not configured");
  const res = await fetchImpl("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model || DEFAULT_XAI_MODEL,
      messages: opts.messages,
      max_tokens: opts.maxTokens ?? 512,
      temperature: opts.temperature ?? 0.7,
    }),
  });
  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(
      `xAI ${res.status}: ${rawText.slice(0, 200).replace(/\s+/g, " ")}`,
    );
  }
  let data;
  try {
    data = JSON.parse(rawText);
  } catch (_) {
    throw new Error("xAI returned non-JSON response");
  }
  const content =
    data?.choices?.[0]?.message?.content != null
      ? String(data.choices[0].message.content)
      : "";
  if (!content.trim()) throw new Error("Empty xAI completion content");
  return { content, raw: data };
}

/**
 * Generate one value field from a resolved auto prompt.
 * @param {object} params
 * @param {string} params.apiKey
 * @param {string} params.key
 * @param {object} params.resolved buildResolvedAutoPrompt output (ok: true)
 * @param {typeof fetch} [params.fetchImpl]
 */
async function generateOneValueField(params) {
  const { apiKey, key, resolved, fetchImpl } = params;
  if (!resolved?.ok) {
    return { ok: false, error: resolved?.error || "Prompt could not be resolved" };
  }
  const userMessage = buildLlmUserMessage(key, resolved);
  let completion;
  try {
    completion = await callXaiChatCompletion(
      apiKey,
      {
        messages: [
          { role: "system", content: AUTO_SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      },
      fetchImpl,
    );
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
  let parsed;
  try {
    parsed = parseLlmValueJson(completion.content);
  } catch (e) {
    return {
      ok: false,
      error: e.message || String(e),
      rawContent: completion.content,
    };
  }
  const maxLen = valueMaxLengthHint(key);
  const value = enforceMaxLength(parsed.value, maxLen);
  if (!value) {
    return { ok: false, error: "Generated value is empty", rawContent: completion.content };
  }
  return {
    ok: true,
    key,
    value,
    userMessage,
    rawContent: completion.content,
    model: DEFAULT_XAI_MODEL,
  };
}

module.exports = {
  AUTO_SYSTEM_PROMPT,
  DEFAULT_XAI_MODEL,
  valueMaxLengthHint,
  parseLlmValueJson,
  enforceMaxLength,
  buildLlmUserMessage,
  callXaiChatCompletion,
  generateOneValueField,
};
