const fs = require("fs");
const path = require("path");
const {
  CANONICAL_SOURCE_NAMES,
  BUILDER_EXTRA_NAMES,
} = require("./source_inventory.js");

const IMPORT_TAG_RX = /\/\/import<(.*?)>/gm;
const IMPORT_TAG_EXTRACT = /\/\/import<(.*?)>/;
const LIB_DIR = path.join(__dirname, "lib");

const SOURCE_FILE_NAMES = CANONICAL_SOURCE_NAMES;

function importGraphSeedNames(files) {
  const names = [...SOURCE_FILE_NAMES];
  for (const extra of BUILDER_EXTRA_NAMES) {
    if (files && files[extra] != null) names.push(extra);
  }
  return names;
}

function discoverImportPaths(content) {
  const paths = [];
  if (!content || typeof content !== "string") return paths;
  const rx = new RegExp(IMPORT_TAG_RX.source, IMPORT_TAG_RX.flags);
  let m;
  while ((m = rx.exec(content)) !== null) {
    const rel = (m[1] || "").trim();
    if (rel && !paths.includes(rel)) paths.push(rel);
  }
  return paths;
}

function normalizeImportRel(relPath) {
  return (relPath || "").replace(/\\/g, "/").trim();
}

function isImportFile(absPath) {
  try {
    return fs.existsSync(absPath) && fs.statSync(absPath).isFile();
  } catch (_) {
    return false;
  }
}

function resolveImportPath(projectPath, relPath) {
  const normalized = normalizeImportRel(relPath);
  if (!normalized) return { ok: false, error: "Empty import path" };
  if (path.isAbsolute(normalized)) {
    return { ok: false, error: `Import path must be relative to project root: ${normalized}` };
  }
  const segments = normalized.split("/");
  if (segments.some((s) => s === "..")) {
    return { ok: false, error: `Import path may not contain '..': ${normalized}` };
  }
  const projectRoot = path.resolve(projectPath);
  const projectAbs = path.resolve(projectRoot, normalized);
  if (!projectAbs.startsWith(projectRoot + path.sep) && projectAbs !== projectRoot) {
    return { ok: false, error: `Import path escapes project root: ${normalized}` };
  }
  if (isImportFile(projectAbs)) {
    return { ok: true, abs: projectAbs, rel: normalized, source: "project" };
  }
  const libRoot = path.resolve(LIB_DIR);
  const libAbs = path.resolve(libRoot, normalized);
  if (!libAbs.startsWith(libRoot + path.sep) && libAbs !== libRoot) {
    return { ok: false, error: `Import path escapes lib root: ${normalized}` };
  }
  if (isImportFile(libAbs)) {
    return { ok: true, abs: libAbs, rel: normalized, source: "lib" };
  }
  return { ok: true, abs: projectAbs, rel: normalized, source: "project" };
}

function loadImportFile(absPath) {
  try {
    if (!fs.existsSync(absPath)) {
      return { ok: false, error: `Import file not found: ${absPath}` };
    }
    const stat = fs.statSync(absPath);
    if (!stat.isFile()) {
      return { ok: false, error: `Import path is not a file: ${absPath}` };
    }
    return { ok: true, content: fs.readFileSync(absPath, "utf8") };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

function expandImports(content, projectPath, errors = [], stack = []) {
  let code = content == null ? "" : String(content);
  let matchFound = true;
  while (matchFound) {
    matchFound = false;
    const rx = new RegExp(IMPORT_TAG_RX.source, IMPORT_TAG_RX.flags);
    const matches = code.match(rx) || [];
    for (const tag of matches) {
      const rel = tag.match(IMPORT_TAG_EXTRACT)[1].trim();
      const resolved = resolveImportPath(projectPath, rel);
      if (!resolved.ok) {
        errors.push({ info: `Import: ${rel}`, error: resolved.error });
        code = code.replace(tag, `/* IMPORT ERROR: ${resolved.error} */`);
        matchFound = true;
        continue;
      }
      const { abs } = resolved;
      if (stack.includes(abs)) {
        errors.push({
          info: `Import: ${rel}`,
          error: `Circular import detected: ${rel}`,
        });
        code = code.replace(tag, `/* IMPORT ERROR: circular import ${rel} */`);
        matchFound = true;
        continue;
      }
      const loaded = loadImportFile(abs);
      if (!loaded.ok) {
        errors.push({ info: `Import: ${rel}`, error: loaded.error });
        code = code.replace(tag, `/* IMPORT ERROR: ${loaded.error} */`);
        matchFound = true;
        continue;
      }
      const expanded = expandImports(
        loaded.content,
        projectPath,
        errors,
        [...stack, abs],
      );
      code = code.replace(tag, () => expanded);
      matchFound = true;
    }
  }
  return code;
}

function discoverImportGraph(projectPath, files) {
  const graph = new Map();
  const queue = [];
  const seenRel = new Set();

  for (const name of importGraphSeedNames(files)) {
    const content = files && files[name] != null ? files[name] : "";
    for (const rel of discoverImportPaths(content)) {
      if (!seenRel.has(rel)) {
        seenRel.add(rel);
        queue.push(rel);
      }
    }
  }

  while (queue.length) {
    const rel = queue.shift();
    const resolved = resolveImportPath(projectPath, rel);
    if (!resolved.ok) continue;
    const loaded = loadImportFile(resolved.abs);
    if (!loaded.ok) {
      graph.set(resolved.abs, { rel, content: "", error: loaded.error });
      continue;
    }
    graph.set(resolved.abs, { rel, content: loaded.content, error: null });
    for (const nested of discoverImportPaths(loaded.content)) {
      if (!seenRel.has(nested)) {
        seenRel.add(nested);
        queue.push(nested);
      }
    }
  }

  return graph;
}

function collectSourceBundles(projectPath, files) {
  const bundles = SOURCE_FILE_NAMES.map((f) => ({
    file: f,
    content: files[f] || "",
  }));
  const graph = discoverImportGraph(projectPath, files);
  for (const [abs, entry] of [...graph.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    bundles.push({
      file: entry.rel,
      content: entry.content || "",
      importPath: abs,
    });
  }
  return bundles;
}

function hashImportFiles(projectPath, files) {
  const graph = discoverImportGraph(projectPath, files);
  const parts = [];
  for (const [abs, entry] of [...graph.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    parts.push(entry.rel);
    parts.push("\0");
    parts.push(entry.content || "");
    parts.push("\0");
  }
  return parts.join("");
}

function expandProjectSources(projectPath, canvas, codeblocks, errors = []) {
  const expandedCanvas = expandImports(canvas, projectPath, errors, []);
  const expandedBlocks = codeblocks.map((block) => ({
    ...block,
    content: expandImports(block.content, projectPath, errors, []),
  }));
  return { canvas: expandedCanvas, codeblocks: expandedBlocks };
}

module.exports = {
  IMPORT_TAG_RX,
  SOURCE_FILE_NAMES,
  LIB_DIR,
  discoverImportPaths,
  resolveImportPath,
  loadImportFile,
  expandImports,
  discoverImportGraph,
  collectSourceBundles,
  hashImportFiles,
  expandProjectSources,
};
