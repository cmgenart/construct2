const path = require("path");
const fs = require("fs");
const { getDevArtRoot } = require("./workspace_layout.js");

const DEFAULT_PROJECT_NAME = "Untitled";

/**
 * @param {string[]} argv  args after `node builder.js`
 * @param {NodeJS.ProcessEnv} env
 * @param {string} construct2Dir  absolute path to construct2
 */
function resolveProjectContext(argv, env, construct2Dir) {
  const envPath = env.ADVBUILDER_PROJECT_PATH;
  if (envPath && typeof envPath === "string" && envPath.trim()) {
    return contextFromAbsolute(path.resolve(envPath.trim()), construct2Dir);
  }

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--project-path" && argv[i + 1]) {
      return contextFromAbsolute(path.resolve(argv[i + 1]), construct2Dir);
    }
  }

  let rootArg = null;
  let projectArg = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project-path") {
      i++;
      continue;
    }
    if (a === "--root" && argv[i + 1]) {
      rootArg = argv[++i];
      continue;
    }
    if (a === "--project" && argv[i + 1]) {
      projectArg = argv[++i];
      continue;
    }
    if (!a.startsWith("--") && !projectArg) projectArg = a;
  }

  const artRoot =
    (rootArg && path.resolve(rootArg)) ||
    (env.ADVBUILDER_ART_ROOT && path.resolve(env.ADVBUILDER_ART_ROOT)) ||
    getDevArtRoot(construct2Dir);

  const name = projectArg || DEFAULT_PROJECT_NAME;
  const abs = path.resolve(artRoot, name);
  return {
    name: path.basename(abs),
    path: abs,
    artRoot,
    source: "name",
  };
}

/**
 * @param {string} absPath
 * @param {string} construct2Dir
 */
function contextFromAbsolute(absPath, construct2Dir) {
  const resolved = path.resolve(absPath);
  if (!fs.existsSync(resolved)) {
    return {
      name: path.basename(resolved),
      path: resolved,
      artRoot: path.dirname(resolved),
      source: "project-path",
      missing: true,
    };
  }
  const stat = fs.statSync(resolved);
  const projectPath = stat.isDirectory() ? resolved : path.dirname(resolved);
  return {
    name: path.basename(projectPath),
    path: projectPath,
    artRoot: path.dirname(projectPath),
    source: "project-path",
  };
}

module.exports = {
  DEFAULT_PROJECT_NAME,
  resolveProjectContext,
  contextFromAbsolute,
};
