const fs = require("fs");
const path = require("path");

const DEV_SUFFIX = "-dev";

/**
 * Packaged installs keep the default Electron userData folder.
 * `npm start` uses a sibling `-dev` folder so workspace, window state,
 * and secrets never mix with the installed app.
 * @param {string} baseUserData
 * @param {{ isPackaged?: boolean }} [opts]
 */
function resolveUserDataDir(baseUserData, opts = {}) {
  const base = String(baseUserData || "").replace(/[\\/]+$/, "");
  if (!base) return base;
  if (opts.isPackaged) return base;
  if (base.endsWith(DEV_SUFFIX)) return base;
  return base + DEV_SUFFIX;
}

/**
 * First unpackaged launch: copy an existing release profile into the
 * new `-dev` folder so the current workspace is not lost.
 * @param {string} releaseDir
 * @param {string} devDir
 */
function seedDevUserDataFromRelease(releaseDir, devDir) {
  if (!releaseDir || !devDir || releaseDir === devDir) {
    return { copied: false };
  }
  if (fs.existsSync(path.join(devDir, "workspace.json"))) {
    return { copied: false, reason: "dev-already" };
  }
  if (!fs.existsSync(path.join(releaseDir, "workspace.json"))) {
    return { copied: false, reason: "no-release-workspace" };
  }
  fs.mkdirSync(devDir, { recursive: true });
  fs.cpSync(releaseDir, devDir, { recursive: true, force: false });
  return { copied: true };
}

/**
 * @param {import("electron").App} electronApp
 * @param {{ isPackaged?: boolean, fs?: typeof fs }} [opts]
 */
function applyUserDataProfile(electronApp, opts = {}) {
  const isPackaged =
    opts.isPackaged != null ? !!opts.isPackaged : !!electronApp.isPackaged;
  const releaseDir = electronApp.getPath("userData");
  const target = resolveUserDataDir(releaseDir, { isPackaged });
  if (!isPackaged && target !== releaseDir) {
    seedDevUserDataFromRelease(releaseDir, target);
    electronApp.setPath("userData", target);
  }
  try {
    electronApp.setAppUserModelId(
      isPackaged ? "com.cmgenart.construct2" : "com.cmgenart.construct2.dev",
    );
  } catch (_) {
    /* non-Windows */
  }
  return {
    isPackaged,
    profile: isPackaged ? "release" : "dev",
    userData: electronApp.getPath("userData"),
  };
}

module.exports = {
  DEV_SUFFIX,
  resolveUserDataDir,
  seedDevUserDataFromRelease,
  applyUserDataProfile,
};
