const fs = require("fs");
const path = require("path");

const HELP_ROOTS = [
  { prefix: "docs/", onlyExt: [".md", ".txt"] },
  { prefix: "runtimes/", onlyExt: [".md"] },
  { prefix: "lib/", onlyExt: [".md"] },
];

const ROOT_HELP_FILES = ["README.md", "STAGING.md"];

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
  const isRootHelp = ROOT_HELP_FILES.includes(s);
  const match = HELP_ROOTS.find((r) => s.startsWith(r.prefix));
  if (!match && !isRootHelp) return null;
  const abs = path.resolve(root, s);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  const ext = path.extname(abs).toLowerCase();
  if (isRootHelp) {
    if (ext !== ".md") return null;
  } else if (!match.onlyExt.includes(ext)) return null;
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
  if (ROOT_HELP_FILES.includes(s)) return "/" + s;
  if (s.startsWith("docs/")) return "/docs/" + s.slice("docs/".length);
  if (s.startsWith("runtimes/") || s.startsWith("lib/")) return "/" + s;
  return "/docs/" + s;
}

/**
 * Join `href` onto the directory of `currentRel`, resolving `.` / `..`.
 * Returns null if the result escapes the tree.
 */
function joinHelpRel(currentRel, href) {
  const hrefNorm = String(href || "").replace(/\\/g, "/");
  const hashAt = hrefNorm.indexOf("#");
  const pathOnly = hashAt >= 0 ? hrefNorm.slice(0, hashAt) : hrefNorm;
  if (!pathOnly) return currentRel ? normalizeHelpRel(currentRel) : null;
  const current = String(currentRel || "").replace(/\\/g, "/");
  const baseParts = current ? current.split("/").slice(0, -1) : [];
  const start = pathOnly.startsWith("/") ? [] : baseParts;
  const parts = [];
  for (const p of [...start, ...pathOnly.replace(/^\/+/, "").split("/")]) {
    if (p === "" || p === ".") continue;
    if (p === "..") {
      if (!parts.length) return null;
      parts.pop();
      continue;
    }
    parts.push(p);
  }
  return normalizeHelpRel(parts.join("/"));
}

/**
 * Resolve a viewer href the same way the in-app doc viewer should.
 * @returns {{ kind: string, rel?: string, url?: string } | null}
 */
function resolveHelpHref(currentRel, href) {
  if (href == null) return null;
  const trimmed = String(href).trim();
  if (!trimmed || trimmed.startsWith("#")) return { kind: "hash" };
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) {
    return { kind: "external", url: trimmed };
  }

  const hashAt = trimmed.indexOf("#");
  const pathOnly = (hashAt >= 0 ? trimmed.slice(0, hashAt) : trimmed).replace(/\\/g, "/");
  if (!pathOnly) return { kind: "hash" };

  let rel = null;
  if (pathOnly.startsWith("/docs/")) {
    rel = normalizeHelpRel("docs/" + pathOnly.slice("/docs/".length));
  } else if (
    pathOnly.startsWith("/runtimes/") ||
    pathOnly.startsWith("/lib/") ||
    pathOnly === "/README.md" ||
    pathOnly === "/STAGING.md"
  ) {
    rel = normalizeHelpRel(pathOnly.slice(1));
  } else if (
    pathOnly.startsWith("docs/") ||
    pathOnly.startsWith("runtimes/") ||
    pathOnly.startsWith("lib/") ||
    ROOT_HELP_FILES.includes(pathOnly)
  ) {
    rel = normalizeHelpRel(pathOnly);
  } else {
    rel = joinHelpRel(currentRel, pathOnly);
  }
  if (!rel) return null;
  const url = urlForHelpRel(rel);
  if (!url) return null;
  return { kind: "doc", rel, url };
}

module.exports = {
  HELP_ROOTS,
  ROOT_HELP_FILES,
  normalizeHelpRel,
  resolveHelpFile,
  readHelpFile,
  urlForHelpRel,
  joinHelpRel,
  resolveHelpHref,
};
