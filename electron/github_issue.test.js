const assert = require("assert");
const {
  OWNER,
  REPO,
  buildBugReportIssueUrl,
  bugReportTitle,
} = require("./github_issue.js");

assert.strictEqual(OWNER, "cmgenart");
assert.strictEqual(REPO, "construct2");
assert.strictEqual(bugReportTitle("line one\nline two"), "[Bug] line one");
assert.ok(bugReportTitle("x".repeat(90)).length <= 90);
assert.ok(bugReportTitle("x".repeat(90)).startsWith("[Bug] "));

const url = buildBugReportIssueUrl({
  title: "[Bug] preview blank",
  body: "## Description\nbroke",
});
assert.ok(url.startsWith("https://github.com/cmgenart/construct2/issues/new?"));
assert.ok(url.includes("title="));
assert.ok(url.includes("body="));

console.log("github_issue.test.js: ok");
