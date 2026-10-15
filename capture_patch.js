"use strict";

const fs = require("fs");
const path = require("path");

let clientScriptCache = null;

function getCaptureClientScript() {
  if (clientScriptCache == null) {
    clientScriptCache = fs.readFileSync(path.join(__dirname, "capture_client.js"), "utf8");
  }
  return clientScriptCache;
}

/**
 * Inject the preview recorder (serve-time only; not persisted in build output).
 * @param {string} html
 */
function patchCaptureClient(html) {
  if (!html || typeof html !== "string") return html;
  if (html.includes("__advCaptureClient")) return html;
  const script = "<script>" + getCaptureClientScript() + "</script>";
  const idx = html.lastIndexOf("</body>");
  if (idx === -1) return html + script;
  return html.slice(0, idx) + script + html.slice(idx);
}

module.exports = {
  patchCaptureClient,
  getCaptureClientScript,
};
