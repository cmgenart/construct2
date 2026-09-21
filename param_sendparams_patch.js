"use strict";

/**
 * Ensure built artwork posts SendParams to the embedding host, not only to self.
 * @see docs/PARAM-SPEC.md §8.1
 */
function patchSendParamsTarget(html) {
  if (!html || typeof html !== "string") return html;
  const canonical =
    'const SendParams = (data) => WINDOW.parent.postMessage(data, "*")';
  const legacy = [
    /const SendParams\s*=\s*\(data\)\s*=>\s*WINDOW\.postMessage\(data,\s*["']\*["']\)/g,
    /const SendParams\s*=\s*\(data\)\s*=>\s*\(WINDOW\.parent\s*===\s*WINDOW\s*\?\s*WINDOW\s*:\s*WINDOW\.parent\)\.postMessage\(data,\s*["']\*["']\)/g,
  ];
  let out = html;
  for (const re of legacy) out = out.replace(re, canonical);
  return out;
}

module.exports = { patchSendParamsTarget };
