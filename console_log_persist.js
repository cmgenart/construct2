"use strict";

const fs = require("fs");
const path = require("path");

const IDLE_MS = 2000;
const MAX_MS = 10000;

const BUILD_LOG_NAME = "output.build.log";
const ART_LOG_NAME = "output.art.log";

function buildLogFilePath(projectPath) {
  return path.join(projectPath, BUILD_LOG_NAME);
}

function artLogFilePath(projectPath) {
  return path.join(projectPath, ART_LOG_NAME);
}

function formatLogLine(entry) {
  const d = new Date(entry.ts || Date.now());
  const t = d.toTimeString().slice(0, 8);
  const level = entry.level || "info";
  const text = String(entry.text ?? "").replace(/\r?\n/g, " ");
  return `[${t}] ${level}  ${text}\n`;
}

function parseLogLine(line) {
  const m = String(line).match(/^\[(\d{2}:\d{2}:\d{2})\]\s+(\S+)\s{2}(.*)$/);
  if (!m) return null;
  const [, timeStr, level, text] = m;
  const parts = timeStr.split(":").map((n) => parseInt(n, 10));
  const d = new Date();
  d.setHours(parts[0] || 0, parts[1] || 0, parts[2] || 0, 0);
  return { ts: d.getTime(), level, text };
}

function readLogTail(filePath, maxLines = 100) {
  if (!fs.existsSync(filePath)) return [];
  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return [];
  }
  if (!content) return [];
  const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
  return lines
    .slice(-maxLines)
    .map(parseLogLine)
    .filter(Boolean);
}

function createDebouncedLogAppender(filePath) {
  const pending = [];
  let idleTimer = null;
  let maxTimer = null;
  let lastSaveAt = Date.now();

  function clearTimers() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (maxTimer) {
      clearTimeout(maxTimer);
      maxTimer = null;
    }
  }

  function flush() {
    clearTimers();
    if (!pending.length) return;
    const chunk = pending.map(formatLogLine).join("");
    pending.length = 0;
    try {
      fs.appendFileSync(filePath, chunk, "utf8");
    } catch (e) {
      console.error(`console log append failed (${filePath}):`, e.message || e);
    }
    lastSaveAt = Date.now();
  }

  function clear() {
    clearTimers();
    pending.length = 0;
    try {
      fs.writeFileSync(filePath, "", "utf8");
    } catch (e) {
      console.error(`console log clear failed (${filePath}):`, e.message || e);
    }
    lastSaveAt = Date.now();
  }

  function scheduleMaxTimer() {
    if (maxTimer) return;
    const elapsed = Date.now() - lastSaveAt;
    const wait = Math.max(0, MAX_MS - elapsed);
    maxTimer = setTimeout(() => {
      maxTimer = null;
      flush();
    }, wait);
  }

  function append(entry) {
    pending.push(entry);
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(flush, IDLE_MS);
    scheduleMaxTimer();
  }

  function appendMany(entries) {
    if (!Array.isArray(entries) || !entries.length) return;
    for (const entry of entries) pending.push(entry);
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(flush, IDLE_MS);
    scheduleMaxTimer();
  }

  return { append, appendMany, flush, clear };
}

module.exports = {
  IDLE_MS,
  MAX_MS,
  BUILD_LOG_NAME,
  ART_LOG_NAME,
  buildLogFilePath,
  artLogFilePath,
  formatLogLine,
  parseLogLine,
  readLogTail,
  createDebouncedLogAppender,
};
