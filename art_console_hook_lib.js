"use strict";

const BUFFER_MAX = 50;

function formatArg(a) {
  if (a == null) return String(a);
  if (typeof a === "string") return a;
  if (a instanceof Error) {
    return a.stack || a.message || String(a);
  }
  try {
    return JSON.stringify(a);
  } catch (_) {
    return String(a);
  }
}

function formatArgs(args) {
  return Array.prototype.map.call(args, formatArg).join(" ");
}

function formatErrorEvent(ev) {
  if (!ev) return "Unknown error";
  const msg = ev.message || (ev.error && formatArg(ev.error)) || "Script error";
  const file = ev.filename || ev.sourceURL || "";
  const line = ev.lineno != null ? ev.lineno : ev.line;
  const col = ev.colno != null ? ev.colno : ev.column;
  if (file && line != null) {
    const loc = col != null ? `${file}:${line}:${col}` : `${file}:${line}`;
    return `${msg} at ${loc}`;
  }
  return msg;
}

function formatRejectionEvent(ev) {
  if (!ev) return "Unhandled promise rejection";
  const reason = ev.reason;
  if (reason instanceof Error) return reason.stack || reason.message || String(reason);
  return formatArg(reason);
}

function createPendingBuffer(maxLines) {
  const max = maxLines || BUFFER_MAX;
  const queue = [];
  return {
    push(entry) {
      queue.push(entry);
      while (queue.length > max) queue.shift();
    },
    flush() {
      const out = queue.slice();
      queue.length = 0;
      return out;
    },
    discard() {
      queue.length = 0;
    },
    size() {
      return queue.length;
    },
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    BUFFER_MAX,
    formatArg,
    formatArgs,
    formatErrorEvent,
    formatRejectionEvent,
    createPendingBuffer,
  };
}

if (typeof window !== "undefined") {
  window.__advArtConsoleLib = {
    BUFFER_MAX,
    formatArg,
    formatArgs,
    formatErrorEvent,
    formatRejectionEvent,
    createPendingBuffer,
  };
}
