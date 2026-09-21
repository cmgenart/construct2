"use strict";

const fs = require("fs");
const path = require("path");

let clientScriptCache = null;

function getViewNavClientScript() {
  if (clientScriptCache == null) {
    clientScriptCache = fs.readFileSync(
      path.join(__dirname, "view_nav_client.js"),
      "utf8",
    );
  }
  return clientScriptCache;
}

/**
 * Inject dev-only view-nav peek listener (serve-time preview; not persisted in build output).
 * @param {string} html
 */
function patchViewNavClient(html) {
  if (!html || typeof html !== "string") return html;
  if (html.includes("__advViewNavPeek")) return html;
  const script = "<script>" + getViewNavClientScript() + "</script>";
  const idx = html.lastIndexOf("</body>");
  if (idx === -1) return html + script;
  return html.slice(0, idx) + script + html.slice(idx);
}

module.exports = {
  patchViewNavClient,
  getViewNavClientScript,
};
