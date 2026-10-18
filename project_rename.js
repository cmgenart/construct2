const fs = require("fs");
const path = require("path");
const { isConstruct2ProjectDir, slugifyProjectName } = require("./project_discovery.js");

function sameProjectPath(a, b) {
  const left = path.resolve(a);
  const right = path.resolve(b);
  if (process.platform === "win32") return left.toLowerCase() === right.toLowerCase();
  return left === right;
}

function setLevelValue(level, key, value) {
  const cur = level[key];
  if (cur && typeof cur === "object" && !Array.isArray(cur)) {
    cur.value = value;
    return;
  }
  level[key] = { value, use: true };
}

/**
 * Set the same default name fields scaffoldProject writes for a new project.
 * Collection, piece, and other levels are left untouched.
 */
function applyInitialProjectName(dev, displayName, slug) {
  if (
    !dev.buildValueLevels ||
    typeof dev.buildValueLevels !== "object" ||
    Array.isArray(dev.buildValueLevels)
  ) {
    dev.buildValueLevels = {};
  }
  const levels = dev.buildValueLevels;
  if (!levels.default || typeof levels.default !== "object" || Array.isArray(levels.default)) {
    levels.default = {};
  }
  setLevelValue(levels.default, "name", displayName);
  setLevelValue(levels.default, "collection_name", slug);
  return dev;
}

function readInitialProjectName(projectPath) {
  const src = path.resolve(projectPath);
  const fallback = path.basename(src);
  try {
    const dev = JSON.parse(fs.readFileSync(path.join(src, "dev.json"), "utf8"));
    const value = dev?.buildValueLevels?.default?.name?.value;
    if (typeof value === "string" && value.trim()) {
      return { ok: true, displayName: value };
    }
  } catch {
    /* fall through */
  }
  return { ok: true, displayName: fallback };
}

function renameUserProject(projectPath, displayName) {
  const display = String(displayName || "").trim();
  if (!display) return { ok: false, error: "Project name required" };
  const src = path.resolve(projectPath);
  const base = path.basename(src);
  if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) {
    return { ok: false, error: "Project folder not found" };
  }
  if (!isConstruct2ProjectDir(src, base)) {
    return { ok: false, error: "Not a Construct² project" };
  }
  const devPath = path.join(src, "dev.json");
  if (!fs.existsSync(devPath)) {
    return { ok: false, error: "Project has no dev.json" };
  }
  let dev;
  try {
    dev = JSON.parse(fs.readFileSync(devPath, "utf8"));
  } catch {
    return { ok: false, error: "Could not read dev.json" };
  }
  if (!dev || typeof dev !== "object" || Array.isArray(dev)) {
    return { ok: false, error: "Could not read dev.json" };
  }

  const slug = slugifyProjectName(display);
  const dest = path.join(path.dirname(src), slug);
  if (!sameProjectPath(src, dest) && fs.existsSync(dest)) {
    return { ok: false, error: "A project named " + slug + " already exists" };
  }

  applyInitialProjectName(dev, display, slug);
  let finalDir = src;
  if (!sameProjectPath(src, dest)) {
    try {
      fs.renameSync(src, dest);
    } catch (e) {
      return { ok: false, error: e.message || "Could not rename the project folder" };
    }
    finalDir = dest;
  }
  try {
    fs.writeFileSync(
      path.join(finalDir, "dev.json"),
      JSON.stringify(dev, null, 2) + "\n",
      "utf8",
    );
  } catch (e) {
    if (!sameProjectPath(finalDir, src)) {
      try {
        fs.renameSync(finalDir, src);
      } catch {
        /* leave the renamed folder if the rollback fails */
      }
    }
    return { ok: false, error: e.message || "Could not update the project name" };
  }
  return {
    ok: true,
    path: finalDir,
    name: path.basename(finalDir),
    displayName: display,
    slug,
  };
}

module.exports = {
  applyInitialProjectName,
  readInitialProjectName,
  renameUserProject,
};
