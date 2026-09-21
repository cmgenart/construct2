/**
 * @param {string} text
 */
function rewriteValueInserts(text) {
  return String(text)
    .replace(/\/\*\[piece\.(\w+)\]\*\//g, "/*[values.$1]*/")
    .replace(/\/\[piece\.(\w+)\]\//g, "/*[values.$1]*/")
    .replace(/\/\[collection\.(\w+)\]\//g, "/*[values.$1]*/")
    .replace(/\/\[artist\.(\w+)\]\//g, "/*[values.$1]*/");
}

/**
 * @param {string} canvasHtml
 */
function normalizeLegacyCanvas(canvasHtml) {
  let html = rewriteValueInserts(String(canvasHtml || ""));
  html = html.replace(/(?<!\/\/)\binsert</g, "//insert<");
  html = html.replace(/(?<!\/\/)\bend</g, "//end<");
  html = html.replace(/\/\/\/insert</g, "//insert<");
  html = html.replace(/\/\/\/end</g, "//end<");
  return html;
}

module.exports = {
  rewriteValueInserts,
  normalizeLegacyCanvas,
};
