const fs = require("fs");
const path = require("path");

function dirHasWorkspaceMarker(dir) {
  if (!dir) return false;
  try {
    return (
      fs.existsSync(path.join(dir, "art")) ||
      fs.existsSync(path.join(dir, "construct-demos")) ||
      fs.existsSync(path.join(dir, "art-legacy"))
    );
  } catch {
    return false;
  }
}

/**
 * genart root that holds `art/`, `construct-demos/`, and `art-legacy/`.
 * Supports `genart/construct2` (old) and `genart/apps/construct2` (current).
 * @param {string} construct2Dir
 */
function getGenartRoot(construct2Dir) {
  if (!construct2Dir) return null;
  const parent = path.resolve(construct2Dir, "..");
  if (dirHasWorkspaceMarker(parent)) return parent;
  if (path.basename(parent).toLowerCase() === "apps") {
    const grand = path.resolve(parent, "..");
    if (dirHasWorkspaceMarker(grand)) return grand;
  }
  return parent;
}

/**
 * @param {string} construct2Dir
 */
function getDevArtRoot(construct2Dir) {
  const root = getGenartRoot(construct2Dir);
  return root
    ? path.join(root, "art")
    : path.resolve(construct2Dir, "..", "art");
}

/**
 * @param {string} construct2Dir
 */
function getDevDemosRoot(construct2Dir) {
  const root = getGenartRoot(construct2Dir);
  return root ? path.join(root, "construct-demos", "construct") : null;
}

module.exports = {
  getGenartRoot,
  getDevArtRoot,
  getDevDemosRoot,
};
