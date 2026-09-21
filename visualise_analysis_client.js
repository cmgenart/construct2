/**
 * Analysis mode UI: run sampler, filters, results grid, expert node graph.
 * Inlined by visualise_views.js — see docs/PROPERTY-ANALYSIS.md.
 */
(function () {
  "use strict";

  var configEl = document.getElementById("analysis-config");
  if (!configEl) return;

  var config;
  try {
    config = JSON.parse(configEl.textContent);
  } catch (e) {
    config = {
      defaultSamples: 1000,
      lastAnalysis: null,
      hideDebug: true,
      hideHxDna: true,
      expertOpen: false,
    };
  }

  var samplesInput = document.getElementById("analysis-samples");
  var runBtn = document.getElementById("analysis-run");
  var statusEl = document.getElementById("analysis-status");
  var statusTextEl = document.getElementById("analysis-status-text");
  var progressTrack = document.getElementById("analysis-progress-track");
  var progressFill = document.getElementById("analysis-progress-fill");
  var msgHost = document.getElementById("analysis-msg-host");
  var summaryHost = document.getElementById("analysis-summary-host");
  var propsHost = document.getElementById("analysis-props-host");
  var hideDebugCb = document.getElementById("filter-hide-debug");
  var hideHxCb = document.getElementById("filter-hide-hxdna");
  var expertToggle = document.getElementById("analysis-expert-toggle");
  var expertPre = document.getElementById("analysis-expert-pre");

  var lastResult = config.lastAnalysis || null;
  var running = false;
  var saveTimer = null;

  if (samplesInput) {
    samplesInput.value = String(config.defaultSamples || 1000);
  }
  if (hideDebugCb) hideDebugCb.checked = config.hideDebug !== false;
  if (hideHxCb) hideHxCb.checked = config.hideHxDna !== false;
  if (expertPre && config.expertOpen) {
    expertPre.classList.add("open");
    if (expertToggle) {
      expertToggle.setAttribute("aria-expanded", "true");
      expertToggle.textContent = "Hide node graph (expert)";
    }
  }

  function displayName(prop) {
    return String(prop)
      .replace(/^debug_/, "")
      .replace(/^HxDNA_/, "")
      .replace(/_/g, " ");
  }

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtPct(n) {
    var v = Number(n);
    if (!Number.isFinite(v)) return "0.00";
    return v.toFixed(2);
  }

  function fmtMs(ms) {
    var v = Number(ms);
    if (!Number.isFinite(v) || v < 1000) return Math.round(v) + " ms";
    return (v / 1000).toFixed(2) + " s";
  }

  function getSamples() {
    var v = parseInt(samplesInput && samplesInput.value, 10);
    if (!Number.isFinite(v)) v = 1000;
    if (v < 100) v = 100;
    if (v > 50000) v = 50000;
    if (samplesInput) samplesInput.value = String(v);
    return v;
  }

  function scheduleSavePrefs() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveUiPrefs, 350);
  }

  function saveUiPrefs() {
    fetch("/analyze/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        samples: getSamples(),
        hideDebug: hideDebugCb ? hideDebugCb.checked : true,
        hideHxDna: hideHxCb ? hideHxCb.checked : true,
        expertOpen: expertPre ? expertPre.classList.contains("open") : false,
      }),
    }).catch(function () {});
  }

  function setProgress(percent) {
    if (!progressTrack || !progressFill) return;
    if (percent == null || percent < 0) {
      progressTrack.hidden = true;
      progressFill.style.width = "0%";
      return;
    }
    progressTrack.hidden = false;
    progressFill.style.width = Math.min(100, Math.max(0, percent)) + "%";
  }

  function setRunning(on, text, percent) {
    running = on;
    if (runBtn) runBtn.disabled = on;
    if (samplesInput) samplesInput.disabled = on;
    if (statusTextEl) statusTextEl.textContent = text || "";
    else if (statusEl) statusEl.textContent = text || "";
    if (statusEl) statusEl.classList.toggle("running", !!on);
    if (!on) setProgress(null);
    else if (percent != null) setProgress(percent);
  }

  function propertyGroupsMap() {
    if (lastResult && lastResult.propertyGroups) return lastResult.propertyGroups;
    return {};
  }

  function shouldShowProp(name) {
    const groups = propertyGroupsMap();
    if (hideDebugCb && hideDebugCb.checked) {
      if (groups[name] === "Debug" || name.indexOf("debug_") === 0) return false;
    }
    if (hideHxCb && hideHxCb.checked) {
      if (groups[name] === "Hex DNA" || name.indexOf("HxDNA_") === 0) return false;
    }
    return true;
  }

  function renderSummary(parent, data) {
    var wrap = document.createElement("div");
    wrap.className = "summary";
    var grid = document.createElement("div");
    grid.className = "summary-grid";
    wrap.appendChild(grid);

    function addItem(label, valueHtml) {
      var item = document.createElement("div");
      item.className = "summary-item";
      item.innerHTML =
        '<span class="summary-label">' +
        escapeHtml(label) +
        '</span><span class="summary-value">' +
        valueHtml +
        "</span>";
      grid.appendChild(item);
    }

    addItem("Samples", escapeHtml(data.samples || data.requested_samples || "—"));
    addItem("Duration", escapeHtml(fmtMs(data.duration_ms)));
    addItem(
      "Master seed",
      '<span class="mono">' + escapeHtml(data.master_seed != null ? data.master_seed : "—") + "</span>",
    );
    var valid = data.valid !== false;
    addItem(
      "Status",
      '<span class="badge ' +
        (valid ? "badge-ok" : "badge-warn") +
        '">' +
        (valid ? "Valid" : "Errors detected") +
        "</span>",
    );
    if (data.error_count) {
      addItem("Sample errors", escapeHtml(String(data.error_count)));
    }
    parent.appendChild(wrap);
  }

  function updateExpertSection(data) {
    if (!expertToggle || !expertPre) return;
    var graph = data && data.node_graph ? data.node_graph : "";
    expertToggle.hidden = !graph;
    expertPre.textContent = graph;
    if (!graph) {
      expertPre.classList.remove("open");
      expertToggle.setAttribute("aria-expanded", "false");
      expertToggle.textContent = "Show node graph (expert)";
    }
  }

  function renderPropertyCard(prop, choices) {
    var entries = Object.keys(choices)
      .map(function (k) {
        return { value: k, pct: Number(choices[k]) || 0 };
      })
      .sort(function (a, b) {
        return b.pct - a.pct;
      });
    var maxPct = 0;
    entries.forEach(function (e) {
      if (e.pct > maxPct) maxPct = e.pct;
    });
    if (maxPct < 0.01) maxPct = 1;

    var card = document.createElement("section");
    card.className = "prop-card";
    var head = document.createElement("h3");
    head.className = "prop-title";
    head.textContent = displayName(prop);
    card.appendChild(head);

    var list = document.createElement("ul");
    list.className = "choice-list";
    entries.forEach(function (e) {
      var li = document.createElement("li");
      li.className = "choice-row";
      var barWrap = document.createElement("div");
      barWrap.className = "bar-wrap";
      var bar = document.createElement("div");
      bar.className = "bar";
      bar.style.width = Math.max(0.5, (e.pct / maxPct) * 100) + "%";
      barWrap.appendChild(bar);
      var headRow = document.createElement("div");
      headRow.className = "choice-row-head";
      var label = document.createElement("span");
      label.className = "choice-label";
      label.textContent = e.value;
      var pct = document.createElement("span");
      pct.className = "choice-pct";
      pct.textContent = fmtPct(e.pct) + "%";
      headRow.appendChild(label);
      headRow.appendChild(pct);
      li.appendChild(barWrap);
      li.appendChild(headRow);
      list.appendChild(li);
    });
    card.appendChild(list);
    return card;
  }

  function renderResults(data) {
    if (msgHost) msgHost.innerHTML = "";
    if (summaryHost) summaryHost.innerHTML = "";
    if (propsHost) propsHost.innerHTML = "";

    if (!data) {
      if (msgHost) {
        msgHost.innerHTML =
          '<p class="empty-msg">Run parameter analysis to see distribution percentages.</p>';
      }
      updateExpertSection(null);
      return;
    }

    if (!data.ok) {
      if (msgHost) {
        msgHost.innerHTML =
          '<p class="error-msg">' +
          escapeHtml(data.error || "Analysis failed") +
          "</p>";
      }
      updateExpertSection(null);
      return;
    }

    if (summaryHost) renderSummary(summaryHost, data);
    updateExpertSection(data);

    var stat = data.stat_data || {};
    var props = Object.keys(stat)
      .filter(shouldShowProp)
      .sort(function (a, b) {
        return displayName(a).localeCompare(displayName(b));
      });

    if (!props.length) {
      if (msgHost) {
        msgHost.innerHTML =
          '<p class="empty-msg">No properties match the current filters.</p>';
      }
    } else if (propsHost) {
      var grid = document.createElement("div");
      grid.className = "prop-grid";
      props.forEach(function (p) {
        grid.appendChild(renderPropertyCard(p, stat[p]));
      });
      propsHost.appendChild(grid);
    }
  }

  function runAnalysis() {
    if (running) return;
    saveUiPrefs();
    var samples = getSamples();
    setRunning(true, "Starting analysis (" + samples.toLocaleString() + " samples)…", 0);
    fetch("/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ samples: samples }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        lastResult = data;
        renderResults(data);
        if (data.ok) {
          setRunning(false, "Done in " + fmtMs(data.duration_ms));
        } else {
          setRunning(false, data.error || "Analysis failed");
        }
      })
      .catch(function (err) {
        setRunning(false, "Request failed");
        renderResults({ ok: false, error: err && err.message ? err.message : String(err) });
      });
  }

  function onParentMessage(ev) {
    if (ev.origin !== location.origin) return;
    var d = ev.data;
    if (!d || !d.type) return;
    if (d.type === "advBuilder:analysis-progress") {
      setRunning(
        true,
        "Running " +
          (d.samples || getSamples()).toLocaleString() +
          " samples… " +
          (d.percent != null ? d.percent + "%" : ""),
        d.percent,
      );
    }
    if (d.type === "advBuilder:analysis-done" && d.result) {
      lastResult = d.result;
      renderResults(d.result);
      if (d.result.ok) {
        setRunning(false, "Done in " + fmtMs(d.result.duration_ms));
      } else {
        setRunning(false, d.result.error || "Analysis failed");
      }
    }
  }

  if (runBtn) runBtn.addEventListener("click", runAnalysis);
  if (samplesInput) {
    samplesInput.addEventListener("change", scheduleSavePrefs);
    samplesInput.addEventListener("input", scheduleSavePrefs);
  }
  if (hideDebugCb) {
    hideDebugCb.addEventListener("change", function () {
      renderResults(lastResult);
      scheduleSavePrefs();
    });
  }
  if (hideHxCb) {
    hideHxCb.addEventListener("change", function () {
      renderResults(lastResult);
      scheduleSavePrefs();
    });
  }
  if (expertToggle && expertPre) {
    expertToggle.addEventListener("click", function () {
      var open = expertPre.classList.toggle("open");
      expertToggle.setAttribute("aria-expanded", open ? "true" : "false");
      expertToggle.textContent = open ? "Hide node graph (expert)" : "Show node graph (expert)";
      scheduleSavePrefs();
    });
  }

  window.addEventListener("message", onParentMessage);
  renderResults(lastResult);
})();
