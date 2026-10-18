"use strict";

const fs = require("fs");
const path = require("path");

const CAPTURE_EXTS = { mp4: "video/mp4", webm: "video/webm", png: "image/png" };
const CAPTURE_MAX_BYTES = 80 * 1024 * 1024;

function captureExtForMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.indexOf("png") >= 0) return "png";
  if (m.indexOf("mp4") >= 0) return "mp4";
  if (m.indexOf("webm") >= 0) return "webm";
  return null;
}

function captureProjectSlug(name) {
  const s = String(name || "project")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return s || "project";
}

function captureStamp(date) {
  const d = date instanceof Date ? date : new Date();
  const p = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    "-" +
    p(d.getHours()) +
    p(d.getMinutes()) +
    p(d.getSeconds())
  );
}

function captureFilename(projectName, ext, date) {
  const safeExt = CAPTURE_EXTS[ext] ? ext : null;
  if (!safeExt) return null;
  return captureProjectSlug(projectName) + "-" + captureStamp(date) + "." + safeExt;
}

function ensureCapturesDir(projectPath) {
  const dir = path.resolve(projectPath, "captures");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function resolveCaptureFile(projectPath, name) {
  const base = path.basename(String(name || "").replace(/\\/g, "/"));
  if (!base || !/^[A-Za-z0-9._-]+$/.test(base)) return null;
  const dir = path.resolve(projectPath, "captures");
  const file = path.resolve(dir, base);
  const rel = path.relative(dir, file);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  try {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
  } catch (_) {
    return null;
  }
  return file;
}

function uniqueCaptureName(dir, filename) {
  const ext = path.extname(filename);
  const base = filename.slice(0, -ext.length);
  let name = filename;
  let n = 2;
  while (fs.existsSync(path.join(dir, name))) {
    name = base + "-" + n + ext;
    n += 1;
  }
  return name;
}

/**
 * Write a capture blob under <project>/captures/.
 * @returns {{ ok: boolean, name?: string, rel?: string, error?: string, status?: number }}
 */
function writeCapture(projectPath, { ext, projectName, bytes, date }) {
  const filename = captureFilename(projectName, ext, date);
  if (!filename) return { ok: false, status: 400, error: "Unsupported capture type" };
  if (!bytes || !bytes.length) return { ok: false, status: 400, error: "Empty capture" };
  if (bytes.length > CAPTURE_MAX_BYTES) {
    return { ok: false, status: 413, error: "Capture is too large" };
  }
  const dir = path.join(projectPath, "captures");
  try {
    fs.mkdirSync(dir, { recursive: true });
    const name = uniqueCaptureName(dir, filename);
    fs.writeFileSync(path.join(dir, name), bytes);
    return { ok: true, name, rel: "captures/" + name };
  } catch (e) {
    const code = e && e.code;
    const readOnly = code === "EPERM" || code === "EACCES" || code === "EROFS";
    return {
      ok: false,
      status: readOnly ? 403 : 500,
      error: readOnly
        ? "Project folder is read-only. Save a copy, then record."
        : e.message || "Could not write capture",
    };
  }
}

module.exports = {
  CAPTURE_EXTS,
  CAPTURE_MAX_BYTES,
  captureExtForMime,
  captureStamp,
  captureProjectSlug,
  captureFilename,
  ensureCapturesDir,
  resolveCaptureFile,
  writeCapture,
};
