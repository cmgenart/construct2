"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  createDebouncedLogAppender,
  parseLogLine,
  readLogTail,
} = require("./console_log_persist.js");

function test(name, fn) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e);
    process.exitCode = 1;
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "c2-log-"));
const logPath = path.join(tmp, "output.build.log");

test("appends log lines after idle debounce", () => {
  const appender = createDebouncedLogAppender(logPath);
  appender.append({ level: "info", text: "hello", ts: Date.now() });
  if (fs.existsSync(logPath)) {
    throw new Error("expected no file before flush");
  }
  appender.flush();
  const body = fs.readFileSync(logPath, "utf8");
  if (!body.includes("hello")) {
    throw new Error(`expected hello in log, got ${body}`);
  }
});

test("clear empties log file", () => {
  const appender = createDebouncedLogAppender(logPath);
  appender.append({ level: "info", text: "remove-me", ts: Date.now() });
  appender.flush();
  appender.clear();
  const body = fs.readFileSync(logPath, "utf8");
  if (body.length !== 0) {
    throw new Error(`expected empty file, got ${body}`);
  }
});

test("parseLogLine and readLogTail return last lines", () => {
  const appender = createDebouncedLogAppender(logPath);
  for (let i = 0; i < 5; i++) {
    appender.append({ level: "info", text: `line-${i}`, ts: Date.now() });
  }
  appender.flush();
  const parsed = parseLogLine("[12:00:01] info  hello");
  if (!parsed || parsed.text !== "hello") {
    throw new Error("parseLogLine failed");
  }
  const tail = readLogTail(logPath, 2);
  if (tail.length !== 2 || !tail[1].text.includes("line-4")) {
    throw new Error(`readLogTail failed: ${JSON.stringify(tail)}`);
  }
});

fs.rmSync(tmp, { recursive: true, force: true });
