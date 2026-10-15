const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  extractMarkdownLinks,
  listHelpFiles,
  verifyHelpLinks,
} = require("./help_links.js");

for (const rel of ["electron/renderer/index.html", "dev-ui.html"]) {
  const html = fs.readFileSync(path.join(__dirname, rel), "utf8");
  const mermaidAt = html.indexOf("mermaid.min.js");
  const viewerAt = html.indexOf("doc_viewer.js");
  assert.ok(mermaidAt >= 0, `${rel} must load mermaid before the doc viewer`);
  assert.ok(viewerAt > mermaidAt, `${rel} must load mermaid before doc_viewer.js`);
}

const links = extractMarkdownLinks(
  "See [A](./GETTING-STARTED.md) and [B](../CORE.md) plus ![skip](./x.png) and [out](https://example.com).",
);
assert.deepStrictEqual(links, ["./GETTING-STARTED.md", "../CORE.md", "https://example.com"]);

const files = listHelpFiles(__dirname);
assert.ok(files.includes("docs/user/README.md"));
assert.ok(files.includes("runtimes/cc-v3.23.getting-started.md"));

const report = verifyHelpLinks(__dirname);
if (!report.ok) {
  const lines = report.broken.map(
    (b) => `  ${b.from} → ${b.href} (${b.reason}${b.rel ? " => " + b.rel : ""})`,
  );
  assert.fail(
    `Help links failed (${report.broken.length}):\n${lines.join("\n")}`,
  );
}
assert.ok(report.checked > 0, "expected to check some in-app help links");

console.log(
  `help_links.test.js: ok (${report.files} files, ${report.checked} links)`,
);
