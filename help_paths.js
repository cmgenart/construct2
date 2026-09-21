const fs = require("fs");
const path = require("path");

const HELP_ROOTS = [
  { prefix: "docs/", onlyExt: [".md", ".txt"] },
  { prefix: "runtimes/", onlyExt: [".md"] },
  { prefix: "lib/", onlyExt: [".md"] },
];

function normalizeHelpRel(rel) {
  if (!rel || typeof rel !== "string") return null;
  let s = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!s || s.includes("..") || path.isAbsolute(s)) return null;
  return s;
}

function resolveHelpFile(construct2Dir, rel) {
  const s = normalizeHelpRel(rel);
  if (!s) return null;
  const root = path.resolve(construct2Dir);
  const match = HELP_ROOTS.find((r) => s.startsWith(r.prefix));
  if (!match) return null;
  const abs = path.resolve(root, s);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  const ext = path.extname(abs).toLowerCase();
  if (!match.onlyExt.includes(ext)) return null;
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
  return abs;
}

function readHelpFile(construct2Dir, rel) {
  const abs = resolveHelpFile(construct2Dir, rel);
  if (!abs) return null;
  return {
    rel: normalizeHelpRel(rel),
    text: fs.readFileSync(abs, "utf8"),
    ext: path.extname(abs).toLowerCase(),
  };
}

function urlForHelpRel(rel) {
  const s = normalizeHelpRel(rel);
  if (!s) return null;
  if (s.startsWith("docs/")) return "/docs/" + s.slice("docs/".length);
  if (s.startsWith("runtimes/") || s.startsWith("lib/")) return "/" + s;
  return "/docs/" + s;
}

module.exports = {
  normalizeHelpRel,
  resolveHelpFile,
  readHelpFile,
  urlForHelpRel,
};
