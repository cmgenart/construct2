const OWNER = "cmgenart";
const REPO = "construct2";
const ISSUES_NEW = `https://github.com/${OWNER}/${REPO}/issues/new`;

/**
 * @param {{ title: string, body: string }} payload
 */
function buildBugReportIssueUrl({ title, body }) {
  const params = new URLSearchParams();
  params.set("title", String(title || "").slice(0, 200));
  params.set("body", String(body || ""));
  return `${ISSUES_NEW}?${params.toString()}`;
}

/**
 * @param {string} description
 */
function bugReportTitle(description) {
  const first = String(description || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find(Boolean) || "Untitled";
  const clipped = first.length > 80 ? `${first.slice(0, 77)}...` : first;
  return `[Bug] ${clipped}`;
}

module.exports = {
  OWNER,
  REPO,
  ISSUES_NEW,
  buildBugReportIssueUrl,
  bugReportTitle,
};
