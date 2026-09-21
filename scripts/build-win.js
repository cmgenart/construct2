#!/usr/bin/env node
/**
 * Windows NSIS packaging.
 *
 * electron-builder 26.15.3–26.15.5 compress ARM64 PE files with 7-Zip's
 * ARM64 filter. The NSIS extractor cannot decode that filter, so install
 * succeeds with no Construct2.exe and no DLLs. 26.15.6+ pins NSIS to BCJ.
 * Keep the env var anyway so a downgrade cannot ship a hollow ARM installer.
 *
 * https://github.com/electron-userland/electron-builder/issues/9983
 */
process.env.ELECTRON_BUILDER_7Z_FILTER = "BCJ";

const { spawnSync } = require("child_process");
const r = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["electron-builder", ...process.argv.slice(2)],
  { stdio: "inherit", shell: true },
);
process.exit(r.status == null ? 1 : r.status);
