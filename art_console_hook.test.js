"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  formatArg,
  formatArgs,
  formatErrorEvent,
  formatRejectionEvent,
  createPendingBuffer,
  BUFFER_MAX,
} = require("./art_console_hook_lib.js");

describe("art_console_hook_lib", () => {
  it("formats Error with stack", () => {
    const err = new Error("boom");
    assert.match(formatArg(err), /boom/);
  });

  it("formatArgs joins mixed args", () => {
    assert.equal(formatArgs(["a", 1]), "a 1");
  });

  it("formatErrorEvent includes location", () => {
    const text = formatErrorEvent({
      message: "V2 is not defined",
      filename: "https://127.0.0.1:3000/visualise",
      lineno: 29,
      colno: 17,
    });
    assert.match(text, /V2 is not defined/);
    assert.match(text, /visualise:29:17/);
  });

  it("formatRejectionEvent uses Error stack", () => {
    const text = formatRejectionEvent({ reason: new Error("reject") });
    assert.match(text, /reject/);
  });

  it("pending buffer queues and flushes", () => {
    const buf = createPendingBuffer(3);
    buf.push({ level: "error", text: "one", ts: 1 });
    buf.push({ level: "log", text: "two", ts: 2 });
    assert.equal(buf.size(), 2);
    const out = buf.flush();
    assert.equal(out.length, 2);
    assert.equal(out[0].text, "one");
    assert.equal(buf.size(), 0);
  });

  it("pending buffer drops oldest beyond max", () => {
    const buf = createPendingBuffer(2);
    buf.push({ text: "a" });
    buf.push({ text: "b" });
    buf.push({ text: "c" });
    const out = buf.flush();
    assert.equal(out.length, 2);
    assert.equal(out[0].text, "b");
    assert.equal(out[1].text, "c");
  });

  it("BUFFER_MAX default is 50", () => {
    assert.equal(BUFFER_MAX, 50);
  });
});
