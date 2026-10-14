/**
 * In-app help link check.
 *
 * Run: `npm run test:help-links`
 * Crawls every served markdown file plus Help menu / picker / section-? entries.
 * Markdown links to other .md/.txt help pages must resolve and exist.
 * http(s), hash, and source-file links are ignored (the viewer does not open them).
 */
const fs = require("fs");
const path = require("path");
const {
  HELP_ROOTS,
  ROOT_HELP_FILES,
  resolveHelpFile,
  readHelpFile,
  resolveHelpHref,
} = require("./help_paths.js");

const MD_LINK_RE = /(!?)\[(?:[^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;

const ENTRY_RELS = [
  "docs/user/README.md",
  "docs/user/GETTING-STARTED.md",
  "docs/README.md",
  "runtimes/cc-v3.23.getting-started.md",
  "lib/AsciiCore.getting-started.md",
];

function extractMarkdownLinks(text) {
  const hrefs = [];
  const src = String(text || "");
  MD_LINK_RE.lastIndex = 0;
  let m;
  while ((m = MD_LINK_RE.exec(src))) {
    if (m[1] === "!") continue;
    hrefs.push(m[2]);
  }
  return hrefs;
}

function walkHelpFiles(construct2Dir, dir, prefix, exts, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const rel = prefix + ent.name;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walkHelpFiles(construct2Dir, abs, rel + "/", exts, out);
      continue;
    }
    if (!ent.isFile()) continue;
    const ext = path.extname(ent.name).toLowerCase();
    if (!exts.includes(ext)) continue;
    if (resolveHelpFile(construct2Dir, rel)) out.push(rel.replace(/\\/g, "/"));
  }
}

function listHelpFiles(construct2Dir) {
  const root = path.resolve(construct2Dir);
  const out = [];
  for (const r of HELP_ROOTS) {
    walkHelpFiles(
      root,
      path.join(root, r.prefix.replace(/\/$/, "")),
      r.prefix,
      r.onlyExt,
      out,
    );
  }
  for (const name of ROOT_HELP_FILES) {
    if (resolveHelpFile(construct2Dir, name) && !out.includes(name)) out.push(name);
  }
  return out.sort();
}

function collectChromeEntries(construct2Dir) {
  const root = path.resolve(construct2Dir);
  const extras = [];
  const html = fs.readFileSync(path.join(root, "electron", "renderer", "index.html"), "utf8");
  for (const m of html.matchAll(/data-help-rel="([^"]+)"/g)) extras.push(m[1]);
  const main = fs.readFileSync(path.join(root, "electron", "main.js"), "utf8");
  for (const m of main.matchAll(/showHelpFromMenu\("([^"]+)"\)/g)) extras.push(m[1]);
  const ui = fs.readFileSync(path.join(root, "dev-ui.html"), "utf8");
  for (const m of ui.matchAll(/docLink\('([^']+)'/g)) extras.push("docs/" + m[1]);
  for (const m of ui.matchAll(/href="(\/(?:docs|runtimes|lib)\/[^"]+\.md)"/g)) {
    extras.push(m[1].replace(/^\//, "").replace(/^docs\//, "docs/"));
  }
  return [...new Set(extras.map((s) => s.replace(/\\/g, "/")))];
}

function verifyHelpLinks(construct2Dir) {
  const root = path.resolve(construct2Dir);
  const files = listHelpFiles(root);
  const entries = [...new Set([...ENTRY_RELS, ...collectChromeEntries(root)])];
  const broken = [];
  const checked = [];

  for (const rel of entries) {
    if (!resolveHelpFile(root, rel)) {
      broken.push({ from: "(entry)", href: rel, reason: "entry-missing" });
    }
  }

  for (const from of files) {
    const loaded = readHelpFile(root, from);
    if (!loaded) continue;
    for (const href of extractMarkdownLinks(loaded.text)) {
      const resolved = resolveHelpHref(from, href);
      if (!resolved) {
        const pathOnly = href.split("#")[0].split("?")[0];
        const ext = path.extname(pathOnly).toLowerCase();
        if (ext === ".md" || ext === ".txt") {
          broken.push({ from, href, reason: "unresolvable" });
        }
        continue;
      }
      if (resolved.kind === "external" || resolved.kind === "hash") continue;
      if (resolved.kind !== "doc") {
        broken.push({ from, href, reason: "unresolvable" });
        continue;
      }
      const ext = path.extname(resolved.rel).toLowerCase();
      if (ext !== ".md" && ext !== ".txt") continue;
      checked.push({ from, href, rel: resolved.rel });
      if (!resolveHelpFile(root, resolved.rel)) {
        broken.push({ from, href, rel: resolved.rel, reason: "missing" });
      }
    }
  }

  return {
    ok: broken.length === 0,
    files: files.length,
    checked: checked.length,
    broken,
    entries,
  };
}

module.exports = {
  ENTRY_RELS,
  extractMarkdownLinks,
  listHelpFiles,
  collectChromeEntries,
  verifyHelpLinks,
};
