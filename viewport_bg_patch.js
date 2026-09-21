"use strict";

const fs = require("fs");
const path = require("path");

let clientScriptCache = null;

function getViewportBgClientScript() {
  if (clientScriptCache == null) {
    clientScriptCache = fs.readFileSync(
      path.join(__dirname, "viewport_bg_client.js"),
      "utf8",
    );
  }
  return clientScriptCache;
}

/**
 * Inject dev-only viewport background listener (serve-time preview; not persisted in build output).
 * @param {string} html
 */
function patchViewportBgClient(html) {
  if (!html || typeof html !== "string") return html;
  if (html.includes("__advApplyViewportBg")) return html;
  const script = "<script>" + getViewportBgClientScript() + "</script>";
  const idx = html.lastIndexOf("</body>");
  if (idx === -1) return html + script;
  return html.slice(0, idx) + script + html.slice(idx);
}

/**
 * Patch HTML inside a data: URI (utf8 run / metadata src) for dev preview only.
 * @param {string} link
 */
function patchViewportBgInLink(link) {
  if (!link || typeof link !== "string") return link;
  if (link.indexOf("data:") !== 0) {
    if (link.indexOf("<") >= 0 && link.indexOf("html") >= 0) {
      return patchViewportBgClient(link);
    }
    return link;
  }
  const comma = link.indexOf(",");
  if (comma < 0) return link;
  const meta = link.slice(0, comma);
  let body = link.slice(comma + 1);
  try {
    if (/%[0-9A-Fa-f]{2}/.test(body)) body = decodeURIComponent(body);
  } catch (_) {}
  const patched = patchViewportBgClient(body);
  if (patched === body) return link;
  return meta + "," + encodeURIComponent(patched);
}

module.exports = {
  patchViewportBgClient,
  patchViewportBgInLink,
  getViewportBgClientScript,
};
