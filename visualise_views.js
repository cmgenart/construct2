"use strict";

/**
 * HTML shells for dev-ui visualiser modes (UTF8, Metadata, Analysis).
 * Served by builder.js GET /visualise?mode=… — see docs/VISUALISER.md.
 */

const fs = require("fs");
const path = require("path");

const CLIENT_SCRIPT = fs.readFileSync(
  path.join(__dirname, "visualise_metadata_client.js"),
  "utf8",
);
const PARAM_BRIDGE_SCRIPT = fs.readFileSync(
  path.join(__dirname, "visualise_param_bridge.js"),
  "utf8",
);
const VIS_TABS_SCRIPT = fs.readFileSync(
  path.join(__dirname, "visualise_tabs.js"),
  "utf8",
);
const ANALYSIS_CLIENT_SCRIPT = fs.readFileSync(
  path.join(__dirname, "visualise_analysis_client.js"),
  "utf8",
);
const ART_CONSOLE_HOOK_LIB_SCRIPT = fs.readFileSync(
  path.join(__dirname, "art_console_hook_lib.js"),
  "utf8",
);
const ART_CONSOLE_HOOK_SCRIPT = fs.readFileSync(
  path.join(__dirname, "art_console_hook.js"),
  "utf8",
);
const ART_CONSOLE_HOOK_BUNDLE = `${ART_CONSOLE_HOOK_LIB_SCRIPT}\n${ART_CONSOLE_HOOK_SCRIPT}`;

function injectArtConsoleHook(html) {
  if (!html || typeof html !== "string") return html;
  if (html.includes("__advArtConsoleHook")) return html;
  const safe = ART_CONSOLE_HOOK_BUNDLE.replace(/<\//g, "<\\/");
  const tag = `<script>${safe}</script>`;
  if (/<head[\s>]/i.test(html)) {
    return html.replace(/(<head[^>]*>)/i, `$1${tag}`);
  }
  if (/<body[\s>]/i.test(html)) {
    return html.replace(/(<body[^>]*>)/i, `$1${tag}`);
  }
  const scriptIdx = html.search(/<script[\s>]/i);
  if (scriptIdx >= 0) {
    return html.slice(0, scriptIdx) + tag + html.slice(scriptIdx);
  }
  if (html.includes("</head>")) return html.replace("</head>", `${tag}</head>`);
  if (html.includes("</body>")) return html.replace("</body>", `${tag}</body>`);
  return tag + html;
}

const ART_CONSOLE_SHELL_SCRIPT = `${ART_CONSOLE_HOOK_BUNDLE}
function __advInjectArtConsoleHook(html) {
  if (!html || typeof html !== "string" || html.indexOf("__advArtConsoleHook") >= 0) return html;
  var hook = ${JSON.stringify(ART_CONSOLE_HOOK_BUNDLE)};
  var tag = "<script>" + hook + "<" + "/script>";
  if (/<head[\\s>]/i.test(html)) return html.replace(/(<head[^>]*>)/i, "$1" + tag);
  if (/<body[\\s>]/i.test(html)) return html.replace(/(<body[^>]*>)/i, "$1" + tag);
  var scriptIdx = html.search(/<script[\\s>]/i);
  if (scriptIdx >= 0) return html.slice(0, scriptIdx) + tag + html.slice(scriptIdx);
  if (html.indexOf("</head>") >= 0) return html.replace("</head>", tag + "</head>");
  if (html.indexOf("</body>") >= 0) return html.replace("</body>", tag + "</body>");
  return tag + html;
}
`;

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function jsonScript(obj) {
  return `<script type="application/json" id="build-data">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;
}

const THEME_HEAD = `<link rel="stylesheet" href="/ui/tokens-default.css">
<link rel="stylesheet" href="/ui/tokens-nord.css">
<link rel="stylesheet" href="/ui/tokens-nord-variants.css">
<link rel="stylesheet" href="/ui/visualise-shell.css">
<script>
try {
  var t = localStorage.getItem("advBuilder.theme") || "light";
  var p = localStorage.getItem("advBuilder.palette") || "default";
  var palette = p === "nord" || /^nord-\\d+$/.test(p) ? p : "default";
  document.documentElement.dataset.palette = palette;
  document.documentElement.dataset.theme =
    palette !== "default" ? "dark" : (t === "dark" ? "dark" : "light");
} catch (e) {}
</script>`;

const SCROLLBAR_JS = `
(function () {
  document.querySelectorAll(".thin-scroll").forEach(function (el) {
    if (el.dataset.thinScrollBound) return;
    el.dataset.thinScrollBound = "1";
    var scrollTimer = null;
    el.addEventListener(
      "scroll",
      function () {
        el.classList.add("is-scrolling");
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(function () {
          el.classList.remove("is-scrolling");
        }, 700);
      },
      { passive: true },
    );
  });
})();
`;

function viewerShell(title, toolbarHtml, panelsHtml, extraScript) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
${THEME_HEAD}
</head>
<body>
${toolbarHtml}
${panelsHtml}
<script>
${extraScript || ""}
${ART_CONSOLE_SHELL_SCRIPT}
${SCROLLBAR_JS}
${VIS_TABS_SCRIPT}
</script>
</body>
</html>`;
}

const UTF8_RUN_JS = `
(function () {
  var el = document.getElementById("build-data");
  if (!el) return;
  var build;
  try { build = JSON.parse(el.textContent); } catch (e) { return; }

  var frame = document.getElementById("utf8-run-frame");
  var blobUrl = null;

  function revokeBlob() {
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      blobUrl = null;
    }
  }

  function utf8DataUriToBlobUrl(link) {
    if (!link || link.indexOf("data:") !== 0) return link;
    var comma = link.indexOf(",");
    if (comma < 0) return link;
    var meta = link.slice(0, comma);
    var body = link.slice(comma + 1);
    try {
      if (/%[0-9A-Fa-f]{2}/.test(body)) body = decodeURIComponent(body);
    } catch (e) {}
    if (typeof __advInjectArtConsoleHook === "function") {
      body = __advInjectArtConsoleHook(body);
    }
    var mime = "text/html";
    var semi = meta.indexOf(";");
    if (semi > 5) mime = meta.slice(5, semi) || mime;
    blobUrl = URL.createObjectURL(new Blob([body], { type: mime + ";charset=utf-8" }));
    return blobUrl;
  }

  function loadRunFrame() {
    if (!frame || !build.utf8link) return;

    if (frame.dataset.mounted === "1") {
      if (window.__advVisApplyParams && window.__advVisLastParams) {
        var cached = window.__advVisLastParams();
        if (cached) window.__advVisApplyParams(cached);
      }
      return;
    }

    var panel = document.querySelector('.panel[data-panel="run"]');
    if (!panel || !panel.classList.contains("active")) return;

    frame.dataset.mounted = "1";
    revokeBlob();
    var isData = build.utf8link.indexOf("data:") === 0;
    var url;
    try {
      url = utf8DataUriToBlobUrl(build.utf8link);
    } catch (e) {
      url = build.utf8link;
    }
    frame.sandbox = isData
      ? "allow-scripts allow-downloads allow-modals"
      : "allow-scripts allow-downloads allow-modals allow-same-origin";
    frame.src = url;
    frame.addEventListener(
      "load",
      function () {
        if (window.__advVisApplyParams && window.__advVisLastParams) {
          var p = window.__advVisLastParams();
          if (p) window.__advVisApplyParams(p);
        }
      },
      { once: true },
    );
  }

  window.__utf8LoadRunFrame = loadRunFrame;
})();
`;

function renderUtf8Viewer(build) {
  const raw = build.utf8link || "";
  const payload = { utf8link: raw };
  const toolbar = `
<div class="toolbar">
  <div class="tabs">
    <button type="button" class="tab active" data-tab="raw">Raw link</button>
    <button type="button" class="tab" data-tab="run">Run</button>
  </div>
</div>`;
  const panels = `
${jsonScript(payload)}
<div class="panel active" data-panel="raw"><pre class="raw-pre thin-scroll">${escapeHtml(raw)}</pre></div>
<div class="panel" data-panel="run"><iframe id="utf8-run-frame" class="run-frame"></iframe></div>`;
  return viewerShell(
    "UTF8 link",
    toolbar,
    panels,
    UTF8_RUN_JS + PARAM_BRIDGE_SCRIPT + VIS_TABS_SCRIPT,
  );
}

function poolPmLink(build) {
  if (build.pool_pm_link) return build.pool_pm_link;
  const min = build.metadata_min;
  if (!min) return "";
  return (
    "https://pool.pm/test/metadata?metadata=" +
    encodeURIComponent(min).replace(/%/g, "%25")
  );
}

const POOL_OPEN_JS = `
(function () {
  var el = document.getElementById("build-data");
  if (!el) return;
  var build;
  try { build = JSON.parse(el.textContent); } catch (e) { return; }
  var url = build.pool_pm_link;
  if (!url) return;
  document.querySelectorAll(".pool-link").forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      try {
        window.parent.postMessage(
          { type: "advBuilder:open-external", url: url },
          window.location.origin
        );
      } catch (err) {
        window.open(url, "_blank", "noopener");
      }
    });
  });
})();
`;

function poolPmButton(link) {
  if (!link) return "";
  return `<a class="pool-link" href="#" title="Open on pool.pm metadata test (system browser)"><span class="pool-dot"></span>pool.pm</a>`;
}

function renderAnalysisViewer(opts) {
  const defaultSamples = opts?.defaultSamples ?? 1000;
  const lastAnalysis = opts?.lastAnalysis ?? null;
  const hideDebug = opts?.hideDebug !== false;
  const hideHxDna = opts?.hideHxDna !== false;
  const expertOpen = !!opts?.expertOpen;
  const payload = {
    defaultSamples,
    lastAnalysis,
    hideDebug,
    hideHxDna,
    expertOpen,
  };
  const dbgChk = hideDebug ? " checked" : "";
  const hxChk = hideHxDna ? " checked" : "";
  const dbgLabel = "Hide Debug group";
  const hxLabel = "Hide Hex DNA group";
  const configScript = `<script type="application/json" id="analysis-config">${JSON.stringify(payload).replace(/</g, "\\u003c")}</script>`;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Parameter analysis</title>
${THEME_HEAD}
</head>
<body>
${configScript}
<div class="analysis-toolbar">
  <div class="analysis-toolbar-main">
    <label>Samples <input type="number" id="analysis-samples" min="100" max="50000" step="100" value="${defaultSamples}"></label>
    <button type="button" class="analysis-run" id="analysis-run">Run parameter analysis</button>
    <div class="analysis-filters">
      <label><input type="checkbox" id="filter-hide-debug"${dbgChk}> ${dbgLabel}</label>
      <label><input type="checkbox" id="filter-hide-hxdna"${hxChk}> ${hxLabel}</label>
    </div>
  </div>
</div>
<div class="analysis-status" id="analysis-status"><span id="analysis-status-text"></span><div class="analysis-progress-track" id="analysis-progress-track" hidden><div class="analysis-progress-fill" id="analysis-progress-fill"></div></div></div>
<div class="analysis-body thin-scroll">
  <div id="analysis-results">
    <div id="analysis-msg-host"></div>
    <div id="analysis-summary-host"></div>
    <div id="analysis-expert-host" class="expert-block">
      <button type="button" class="expert-toggle" id="analysis-expert-toggle" aria-expanded="${expertOpen ? "true" : "false"}" hidden>Show node graph (expert)</button>
      <pre class="expert-pre${expertOpen ? " open" : ""} thin-scroll" id="analysis-expert-pre"></pre>
    </div>
    <div id="analysis-props-host"></div>
  </div>
</div>
<script>
${ANALYSIS_CLIENT_SCRIPT}
${SCROLLBAR_JS}
</script>
</body>
</html>`;
  return html;
}

function renderMetadataSetupViewer(opts) {
  const projectName = opts.projectName || "project";
  const relPath = opts.metadataPath
    ? opts.metadataPath.replace(/\\/g, "/").split("/").slice(-2).join("/")
    : `${projectName}/metadata.js`;
  const displayPath = relPath.includes("/")
    ? relPath
    : `${projectName}/metadata.js`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Metadata setup</title>
${THEME_HEAD}
</head>
<body class="setup-body">
<div class="setup-card">
  <h1>Metadata builder required</h1>
  <p>This project has no <code>metadata.js</code> with a <code>CreateMetadata(values, properties, artSrc)</code> export. Create the default file to build Cardano metadata.</p>
  <button type="button" class="setup-btn" id="meta-create-btn">Create default builder: <code>${escapeHtml(displayPath)}</code></button>
  <div class="setup-status" id="meta-create-status"></div>
</div>
<script>
(function () {
  var btn = document.getElementById("meta-create-btn");
  var status = document.getElementById("meta-create-status");
  if (!btn) return;
  btn.addEventListener("click", function () {
    btn.disabled = true;
    status.textContent = "Creating…";
    status.className = "setup-status";
    fetch("/metadata/create-default", { method: "POST" })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.ok) {
          status.textContent = "Created. Rebuilding…";
          if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: "advBuilder:metadata-created" }, "*");
          }
          setTimeout(function () {
            window.location.reload();
          }, 1500);
        } else {
          status.textContent = res.error || "Failed";
          status.className = "setup-status err";
          btn.disabled = false;
        }
      })
      .catch(function (e) {
        status.textContent = String(e);
        status.className = "setup-status err";
        btn.disabled = false;
      });
  });
})();
</script>
</body>
</html>`;
}

const METADATA_CARDANO_JS = `
(function () {
  var cb = document.getElementById("meta-cardano-split");
  if (!cb) return;
  var busy = false;
  cb.addEventListener("change", function () {
    if (busy) return;
    busy = true;
    cb.disabled = true;
    fetch("/metadata/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardanoMetadataSplit: cb.checked,
        rebuild: true,
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.ok) {
          cb.checked = !cb.checked;
          return;
        }
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(
            { type: "advBuilder:metadata-settings-changed" },
            "*"
          );
        }
      })
      .catch(function () {
        cb.checked = !cb.checked;
      })
      .finally(function () {
        busy = false;
        cb.disabled = false;
      });
  });
})();
`;

function metadataAsString(val) {
  if (val == null || val === "") return "";
  if (typeof val === "string") return val;
  if (typeof val === "object") return JSON.stringify(val, null, 2);
  return String(val);
}

const CARDANO_METADATA_LIMIT = 15400;

function metadataByteLength(str) {
  if (!str) return 0;
  return Buffer.byteLength(String(str), "utf8");
}

function buildMetadataOutputsPayload(build) {
  if (build.metadata_outputs && typeof build.metadata_outputs === "object") {
    const keys = Object.keys(build.metadata_outputs);
    if (keys.length) return build.metadata_outputs;
  }
  const raw = metadataAsString(build.metadata);
  const minStr = metadataAsString(build.metadata_min) || raw;
  if (!raw && !minStr) return null;
  return {
    "metadata.json": {
      pretty: raw,
      min: minStr,
      size:
        build.metadata_size != null && build.metadata_size > 0
          ? build.metadata_size
          : metadataByteLength(minStr),
    },
  };
}

function renderMetadataViewer(build, opts) {
  const cardanoSplit = opts?.cardanoMetadataSplit !== false;
  const metadataOutputs = buildMetadataOutputsPayload(build);
  if (!metadataOutputs) {
    const payload = {
      metadata_outputs: {},
      metadata_output_default: "metadata.json",
      metadata_min: "",
      metadata: "",
      metadata_size: 0,
      pool_pm_link: "",
      cardanoMetadataSplit: cardanoSplit,
    };
    return viewerShell(
      "Metadata",
      `<div class="toolbar"><p class="raw-pre">No metadata</p></div>`,
      jsonScript(payload),
      CLIENT_SCRIPT + PARAM_BRIDGE_SCRIPT + VIS_TABS_SCRIPT,
    );
  }
  const fileNames = Object.keys(metadataOutputs).sort();
  const defaultFile = fileNames.includes("metadata.json")
    ? "metadata.json"
    : fileNames[0];
  const primary = metadataOutputs[defaultFile];
  const minStr = primary.min || "";
  const raw = primary.pretty || minStr;
  const poolLink = poolPmLink({ ...build, metadata_min: minStr });
  const metadata_size =
    primary.size != null && primary.size > 0
      ? primary.size
      : metadataByteLength(minStr);
  const payload = {
    metadata_outputs: metadataOutputs,
    metadata_output_default: defaultFile,
    metadata_min: minStr,
    metadata: raw,
    metadata_size,
    pool_pm_link: poolLink,
    cardanoMetadataSplit: cardanoSplit,
  };
  const poolBtn = poolPmButton(poolLink);
  const fileSelect =
    fileNames.length > 1
      ? `<label class="meta-file-select" title="Metadata file from CreateMetadata">
    <span>File</span>
    <select id="meta-file-select">${fileNames
      .map(
        (f) =>
          `<option value="${escapeHtml(f)}"${f === defaultFile ? " selected" : ""}>${escapeHtml(f)}</option>`,
      )
      .join("")}</select>
  </label>`
      : "";
  const toolbar = `
<div class="toolbar">
  <div class="tabs">
    <button type="button" class="tab active" data-tab="raw">Raw</button>
    <button type="button" class="tab" data-tab="preview">Preview</button>
    ${poolBtn}
  </div>
  ${fileSelect}
  <label class="meta-cardano-toggle" title="Word-aware split for text fields; fixed 64-char chunks for embedded art src">
    <input type="checkbox" id="meta-cardano-split" ${cardanoSplit ? "checked" : ""}>
    <span>Cardano split</span>
  </label>
</div>`;
  const panels = `
${jsonScript(payload)}
<div class="panel active" data-panel="raw"><pre class="raw-pre thin-scroll" id="meta-raw-pre">${escapeHtml(raw)}</pre></div>
<div class="panel" data-panel="preview"><div class="preview-scroll thin-scroll" id="meta-preview-root"></div></div>`;
  return viewerShell(
    "Metadata",
    toolbar,
    panels,
    CLIENT_SCRIPT +
      POOL_OPEN_JS +
      METADATA_CARDANO_JS +
      PARAM_BRIDGE_SCRIPT +
      VIS_TABS_SCRIPT,
  );
}

module.exports = {
  renderUtf8Viewer,
  renderMetadataViewer,
  renderMetadataSetupViewer,
  renderAnalysisViewer,
  injectArtConsoleHook,
  CLIENT_SCRIPT,
};
