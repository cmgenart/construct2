/**
 * Visualizer console — Build / Art log panel (F1.3).
 * @see docs/VISUALIZER-CONSOLE.md
 */
(function () {
  "use strict";

  const MAX_LINES = 10000;
  const PAGE_SIZE = 100;
  const DEFAULT_HEIGHT = 180;
  const MIN_BODY_H = 70;
  const MIN_VIS = 120;
  const DRAG_THRESHOLD_PX = 4;
  const PERSIST_IDLE_MS = 2000;
  const PERSIST_MAX_MS = 10000;

  const buildLines = [];
  const artLines = [];
  const streamState = {
    build: { lines: buildLines, viewStart: 0, viewCount: PAGE_SIZE, following: true },
    art: { lines: artLines, viewStart: 0, viewCount: PAGE_SIZE, following: true },
  };

  let viewMode = "build";
  let panelVisible = false;
  let panelHeight = DEFAULT_HEIGHT;
  let buildCapture = true;
  let artCapture = false;
  let barHeight = 10;

  let els = {};
  let initialized = false;
  let ctxMenuEl = null;

  let artPersistQueue = [];
  let artIdleTimer = null;
  let artMaxTimer = null;
  let artLastPersist = Date.now();
  let suppressScrollCollapse = false;

  function loadPrefs() {
    try {
      const raw = localStorage.getItem("advBuilder.console");
      if (!raw) return;
      const p = JSON.parse(raw);
      if (p.viewMode) viewMode = p.viewMode;
      if (typeof p.panelVisible === "boolean") panelVisible = p.panelVisible;
      if (typeof p.panelHeightPx === "number") panelHeight = p.panelHeightPx;
      if (typeof p.buildCapture === "boolean") buildCapture = p.buildCapture;
      if (typeof p.artCapture === "boolean") artCapture = p.artCapture;
    } catch (_) {}
  }

  function savePrefs() {
    try {
      localStorage.setItem(
        "advBuilder.console",
        JSON.stringify({
          viewMode,
          panelVisible,
          panelHeightPx: panelHeight,
          buildCapture,
          artCapture,
        }),
      );
    } catch (_) {}
  }

  function isCaptureOn(streamName) {
    return streamName === "build" ? buildCapture : artCapture;
  }

  function pushLine(streamName, entry) {
    const buf = streamState[streamName].lines;
    buf.push(entry);
    while (buf.length > MAX_LINES) {
      buf.shift();
      streamState[streamName].viewStart = Math.max(0, streamState[streamName].viewStart - 1);
    }
    const st = streamState[streamName];
    if (st.following) {
      st.viewCount = PAGE_SIZE;
      st.viewStart = Math.max(0, buf.length - PAGE_SIZE);
    }
  }

  function tailWindow(streamName) {
    const st = streamState[streamName];
    const len = st.lines.length;
    st.viewCount = PAGE_SIZE;
    st.viewStart = Math.max(0, len - PAGE_SIZE);
    st.following = true;
  }

  function formatTime(ts) {
    const d = new Date(ts || Date.now());
    return d.toTimeString().slice(0, 8);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function lineLevelClass(level) {
    const lv = String(level || "info").toLowerCase();
    if (lv === "error") return "log-error";
    if (lv === "warn" || lv === "warning") return "log-warn";
    return "";
  }

  function formatLinePlain(entry) {
    return `[${formatTime(entry.ts)}] ${entry.level || "info"}  ${entry.text || ""}`;
  }

  function formatLineHtml(entry) {
    const cls = lineLevelClass(entry.level);
    const classAttr = cls ? ` class="log-line ${cls}"` : ` class="log-line"`;
    return `<span${classAttr}>${escapeHtml(formatLinePlain(entry))}</span>`;
  }

  function bufferText(streamName) {
    return streamState[streamName].lines.map(formatLinePlain).join("\n");
  }

  function visibleSlice(streamName) {
    const st = streamState[streamName];
    const buf = st.lines;
    const len = buf.length;
    const start = Math.max(0, Math.min(st.viewStart, Math.max(0, len - 1)));
    const count = Math.max(PAGE_SIZE, Math.min(st.viewCount || PAGE_SIZE, len - start));
    const end = Math.min(len, start + count);
    return {
      lines: buf.slice(start, end),
      start,
      count: end - start,
      hasOlder: start > 0,
    };
  }

  function updateExpandButton(pane, streamName, logEl) {
    const btn = pane.querySelector(".vis-console-expand");
    if (!btn || !logEl) return;
    const slice = visibleSlice(streamName);
    const atTop = logEl.scrollTop <= 2;
    btn.classList.toggle("visible", slice.hasOlder && atTop);
  }

  function renderPane(pane) {
    const streamName = pane.dataset.stream;
    if (!streamName || !streamState[streamName]) return;
    const logEl = pane.querySelector(".vis-console-log");
    if (!logEl) return;

    const wasAtBottom =
      logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 12;
    const prevScrollTop = logEl.scrollTop;
    const prevScrollHeight = logEl.scrollHeight;

    const st = streamState[streamName];
    const slice = visibleSlice(streamName);
    logEl.innerHTML = slice.lines.map(formatLineHtml).join("");

    pane.classList.toggle("feed-disabled", !isCaptureOn(streamName));

    const tailView = (st.viewCount || PAGE_SIZE) <= PAGE_SIZE;
    if ((st.following || wasAtBottom) && tailView) {
      logEl.scrollTop = logEl.scrollHeight;
    } else if (prevScrollHeight !== logEl.scrollHeight) {
      logEl.scrollTop = Math.max(0, prevScrollTop + (logEl.scrollHeight - prevScrollHeight));
    }

    updateExpandButton(pane, streamName, logEl);
  }

  function renderStream(streamName) {
    document.querySelectorAll(`.vis-console-pane[data-stream="${streamName}"]`).forEach(renderPane);
  }

  function refreshLogViews() {
    const single = els.logSingle;
    const bothWrap = els.logBoth;
    if (viewMode === "both") {
      if (single) single.hidden = true;
      if (bothWrap) bothWrap.hidden = false;
      renderStream("build");
      renderStream("art");
    } else {
      if (single) single.hidden = false;
      if (bothWrap) bothWrap.hidden = true;
      const buildPane = single?.querySelector('.vis-console-pane[data-stream="build"]');
      const artPane = single?.querySelector('.vis-console-pane[data-stream="art"]');
      if (buildPane) buildPane.hidden = viewMode !== "build";
      if (artPane) artPane.hidden = viewMode !== "art";
      if (viewMode === "build") renderStream("build");
      if (viewMode === "art") renderStream("art");
    }
    if (els.viewBuild) els.viewBuild.classList.toggle("active", viewMode === "build");
    if (els.viewArt) els.viewArt.classList.toggle("active", viewMode === "art");
    if (els.viewBoth) els.viewBoth.classList.toggle("active", viewMode === "both");
    if (els.captureBuild) {
      els.captureBuild.setAttribute("aria-checked", buildCapture ? "true" : "false");
    }
    if (els.captureArt) {
      els.captureArt.setAttribute("aria-checked", artCapture ? "true" : "false");
    }
  }

  function scheduleArtPersist() {
    if (artIdleTimer) clearTimeout(artIdleTimer);
    artIdleTimer = setTimeout(flushArtPersist, PERSIST_IDLE_MS);
    if (!artMaxTimer) {
      const wait = Math.max(0, PERSIST_MAX_MS - (Date.now() - artLastPersist));
      artMaxTimer = setTimeout(() => {
        artMaxTimer = null;
        flushArtPersist();
      }, wait);
    }
  }

  function queueArtPersist(entry) {
    artPersistQueue.push(entry);
    scheduleArtPersist();
  }

  async function flushArtPersist() {
    if (artIdleTimer) {
      clearTimeout(artIdleTimer);
      artIdleTimer = null;
    }
    if (artMaxTimer) {
      clearTimeout(artMaxTimer);
      artMaxTimer = null;
    }
    if (!artPersistQueue.length) return;
    const lines = artPersistQueue.splice(0);
    try {
      await fetch("/console/art-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      });
      artLastPersist = Date.now();
    } catch (_) {}
  }

  function syncBarHeightFromToolbar() {
    const toolbar = document.getElementById("vis-toolbar");
    if (!toolbar) return barHeight;
    const half = Math.round(toolbar.getBoundingClientRect().height / 2);
    barHeight = Math.max(10, Math.min(18, half));
    if (els.wrap) els.wrap.style.setProperty("--console-bar-h", `${barHeight}px`);
    return barHeight;
  }

  function totalConsoleHeight() {
    return panelVisible ? panelHeight : barHeight;
  }

  function applyLayout() {
    const area = els.area;
    const wrap = els.wrap;
    if (!area || !wrap) return;

    const h = totalConsoleHeight();
    area.classList.toggle("console-panel-open", panelVisible);
    area.classList.toggle("console-collapsed", !panelVisible);
    wrap.style.height = `${h}px`;
    wrap.style.flexBasis = `${h}px`;

    if (els.body) els.body.hidden = !panelVisible;
    if (els.bar) {
      els.bar.title = panelVisible
        ? "Click to hide console · drag to resize"
        : "Click to show console";
    }
  }

  function appendBuild(msg) {
    if (!buildCapture) return;
    const entry = {
      level: msg.level || "info",
      text: msg.text || "",
      ts: msg.ts || Date.now(),
    };
    pushLine("build", entry);
    refreshLogViews();
  }

  function appendArt(msg) {
    if (!artCapture) return;
    const entry = {
      level: msg.level || "info",
      text: msg.text || "",
      ts: msg.ts || Date.now(),
    };
    pushLine("art", entry);
    queueArtPersist(entry);
    refreshLogViews();
  }

  function loadStreamLines(streamName, entries) {
    const st = streamState[streamName];
    st.lines.length = 0;
    for (const entry of entries || []) {
      st.lines.push({
        level: entry.level || "info",
        text: entry.text || "",
        ts: entry.ts || Date.now(),
      });
    }
    while (st.lines.length > MAX_LINES) st.lines.shift();
    st.viewCount = PAGE_SIZE;
    st.viewStart = Math.max(0, st.lines.length - PAGE_SIZE);
    st.following = true;
  }

  async function clearStreamOnServer(streamName) {
    try {
      await fetch("/console/logs/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stream: streamName }),
      });
    } catch (_) {}
  }

  async function clearStream(streamName) {
    const st = streamState[streamName];
    st.lines.length = 0;
    st.viewStart = 0;
    st.viewCount = PAGE_SIZE;
    st.following = true;
    if (streamName === "art") {
      artPersistQueue.length = 0;
      if (artIdleTimer) {
        clearTimeout(artIdleTimer);
        artIdleTimer = null;
      }
      if (artMaxTimer) {
        clearTimeout(artMaxTimer);
        artMaxTimer = null;
      }
    }
    renderStream(streamName);
    await clearStreamOnServer(streamName);
  }

  async function clearAllStreams() {
    streamState.build.lines.length = 0;
    streamState.build.viewStart = 0;
    streamState.build.viewCount = PAGE_SIZE;
    streamState.build.following = true;
    streamState.art.lines.length = 0;
    streamState.art.viewStart = 0;
    streamState.art.viewCount = PAGE_SIZE;
    streamState.art.following = true;
    artPersistQueue.length = 0;
    if (artIdleTimer) {
      clearTimeout(artIdleTimer);
      artIdleTimer = null;
    }
    if (artMaxTimer) {
      clearTimeout(artMaxTimer);
      artMaxTimer = null;
    }
    refreshLogViews();
    await clearStreamOnServer("all");
  }

  let logsLoadedForProject = "";

  async function loadFromServer() {
    if (!initialized) return;
    const projectPath = window.state?.project?.path || "";
    if (!projectPath) return;
    if (logsLoadedForProject === projectPath) return;
    logsLoadedForProject = projectPath;
    try {
      const r = await fetch(`/console/logs?tail=${MAX_LINES}`);
      if (!r.ok) return;
      const data = await r.json();
      if (Array.isArray(data.build)) loadStreamLines("build", data.build);
      if (Array.isArray(data.art)) loadStreamLines("art", data.art);
      refreshLogViews();
    } catch (_) {}
  }

  function expandStream(streamName) {
    const st = streamState[streamName];
    const len = st.lines.length;
    if (len === 0) return;

    const pane = document.querySelector(`.vis-console-pane[data-stream="${streamName}"]`);
    const logEl = pane?.querySelector(".vis-console-log");
    const prevScrollTop = logEl?.scrollTop || 0;
    const prevScrollHeight = logEl?.scrollHeight || 0;
    const atTop = prevScrollTop <= 2;

    const nextStart = Math.max(0, st.viewStart - PAGE_SIZE);
    st.viewStart = nextStart;
    st.viewCount = Math.min(len - nextStart, (st.viewCount || PAGE_SIZE) + PAGE_SIZE);
    st.following = false;
    suppressScrollCollapse = true;
    renderStream(streamName);

    document
      .querySelectorAll(`.vis-console-pane[data-stream="${streamName}"]`)
      .forEach((p) => {
        const log = p.querySelector(".vis-console-log");
        if (!log) return;
        if (atTop) {
          log.scrollTop = 0;
        } else {
          log.scrollTop = Math.max(0, prevScrollTop + (log.scrollHeight - prevScrollHeight));
        }
        updateExpandButton(p, streamName, log);
      });
    requestAnimationFrame(() => {
      suppressScrollCollapse = false;
    });
  }

  function gotoBottomStream(streamName) {
    tailWindow(streamName);
    renderStream(streamName);
    document
      .querySelectorAll(`.vis-console-pane[data-stream="${streamName}"]`)
      .forEach((pane) => {
        const logEl = pane.querySelector(".vis-console-log");
        if (!logEl) return;
        logEl.scrollTop = logEl.scrollHeight;
        updateExpandButton(pane, streamName, logEl);
      });
  }

  function selectAllInLog(logEl) {
    if (!logEl) return;
    logEl.focus();
    const range = document.createRange();
    range.selectNodeContents(logEl);
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function hideContextMenu() {
    if (ctxMenuEl) {
      ctxMenuEl.remove();
      ctxMenuEl = null;
    }
  }

  function showContextMenu(x, y, streamName, logEl) {
    hideContextMenu();
    const menu = document.createElement("div");
    menu.className = "vis-console-ctx-menu";
    menu.innerHTML =
      `<button type="button" data-action="select-all">Select all</button>` +
      `<button type="button" data-action="copy">Copy</button>` +
      `<button type="button" data-action="goto-bottom">Go to bottom</button>` +
      `<button type="button" data-action="clear">Clear</button>`;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-action");
      hideContextMenu();
      if (action === "select-all") {
        selectAllInLog(logEl);
      } else if (action === "copy") {
        const text = bufferText(streamName);
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          alert(text);
        }
      } else if (action === "clear") {
        clearStream(streamName);
      } else if (action === "goto-bottom") {
        gotoBottomStream(streamName);
      }
    });
    document.body.appendChild(menu);
    ctxMenuEl = menu;
    requestAnimationFrame(() => {
      const r = menu.getBoundingClientRect();
      if (r.right > window.innerWidth) menu.style.left = `${Math.max(0, x - r.width)}px`;
      if (r.bottom > window.innerHeight) menu.style.top = `${Math.max(0, y - r.height)}px`;
    });
  }

  function initPaneInteractions() {
    document.querySelectorAll(".vis-console-pane").forEach((pane) => {
      const streamName = pane.dataset.stream;
      const logEl = pane.querySelector(".vis-console-log");
      const expandBtn = pane.querySelector(".vis-console-expand");
      if (!streamName || !logEl) return;

      logEl.tabIndex = 0;

      expandBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        expandStream(streamName);
      });

      logEl.addEventListener("mousedown", (e) => {
        if (e.button === 0) logEl.focus();
      });

      logEl.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
          e.preventDefault();
          e.stopPropagation();
          selectAllInLog(logEl);
        }
      });

      logEl.addEventListener("scroll", () => {
        const st = streamState[streamName];
        const atBottom =
          logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 12;
        if (atBottom) {
          if (st.viewCount > PAGE_SIZE && !suppressScrollCollapse) {
            tailWindow(streamName);
            st.following = true;
            renderStream(streamName);
            return;
          }
          st.following = true;
        } else {
          st.following = false;
        }
        updateExpandButton(pane, streamName, logEl);
      });

      logEl.addEventListener("contextmenu", (e) => {
        const sel = window.getSelection();
        if (sel && sel.toString().length > 0) return;
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, streamName, logEl);
      });
    });

    document.addEventListener("click", (e) => {
      if (ctxMenuEl && !ctxMenuEl.contains(e.target)) hideContextMenu();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hideContextMenu();
    });
  }

  function setPanelVisible(open) {
    panelVisible = !!open;
    applyLayout();
    savePrefs();
    if (panelVisible) {
      tailWindow("build");
      tailWindow("art");
      refreshLogViews();
      requestAnimationFrame(() => {
        document.querySelectorAll(".vis-console-log").forEach((logEl) => {
          logEl.scrollTop = logEl.scrollHeight;
        });
      });
    }
  }

  function initBarInteraction() {
    const bar = els.bar;
    const area = els.area;
    const vis = document.getElementById("vis-viewport");
    if (!bar || !area) return;

    let dragging = false;
    let dragMoved = false;
    let startY = 0;

    function clampPanelHeight(fromBottom) {
      const rect = area.getBoundingClientRect();
      const maxH = Math.max(barHeight + MIN_BODY_H, rect.height * 0.7);
      let next = Math.max(barHeight + MIN_BODY_H, Math.min(maxH, fromBottom));
      const visH = rect.height - next;
      if (visH < MIN_VIS) next = Math.max(barHeight + MIN_BODY_H, rect.height - MIN_VIS);
      panelHeight = next;
      applyLayout();
    }

    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      bar.classList.remove("dragging");
      if (vis) vis.style.pointerEvents = "";
      document.body.style.userSelect = "";
      if (e?.pointerId != null && bar.hasPointerCapture?.(e.pointerId)) {
        try {
          bar.releasePointerCapture(e.pointerId);
        } catch (_) {}
      }
      if (dragMoved) savePrefs();
    }

    bar.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      dragging = true;
      dragMoved = false;
      startY = e.clientY;
      try {
        bar.setPointerCapture(e.pointerId);
      } catch (_) {}
      if (panelVisible) {
        bar.classList.add("dragging");
        if (vis) vis.style.pointerEvents = "none";
        document.body.style.userSelect = "none";
        clampPanelHeight(area.getBoundingClientRect().bottom - e.clientY);
      }
    });

    bar.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      if (!panelVisible) return;
      if (Math.abs(e.clientY - startY) >= DRAG_THRESHOLD_PX) dragMoved = true;
      clampPanelHeight(area.getBoundingClientRect().bottom - e.clientY);
    });

    bar.addEventListener("pointerup", (e) => {
      const wasDragging = dragging;
      const moved = dragMoved;
      endDrag(e);
      if (!wasDragging) return;
      if (!moved) setPanelVisible(!panelVisible);
    });

    bar.addEventListener("pointercancel", endDrag);

    bar.addEventListener("dblclick", (e) => {
      if (!panelVisible) return;
      e.preventDefault();
      panelHeight = DEFAULT_HEIGHT;
      applyLayout();
      savePrefs();
    });
  }

  function syncArtCaptureToPreview() {
    const vis = document.getElementById("vis");
    if (!vis?.contentWindow) return;
    try {
      vis.contentWindow.postMessage(
        { type: "advBuilder:artConsoleCapture", enabled: artCapture },
        window.location.origin,
      );
    } catch (_) {}
  }

  function init() {
    if (initialized) return;
    loadPrefs();
    els = {
      area: document.getElementById("vis-area"),
      wrap: document.getElementById("vis-console"),
      bar: document.getElementById("vis-console-bar"),
      body: document.getElementById("vis-console-body"),
      logSingle: document.getElementById("vis-console-log-single"),
      logBoth: document.getElementById("vis-console-log-both"),
      viewBuild: document.getElementById("vis-console-view-build"),
      viewArt: document.getElementById("vis-console-view-art"),
      viewBoth: document.getElementById("vis-console-view-both"),
      captureBuild: document.getElementById("vis-console-capture-build"),
      captureArt: document.getElementById("vis-console-capture-art"),
      clearAll: document.getElementById("vis-console-clear-all"),
    };
    if (!els.wrap) return;
    initialized = true;

    els.viewBuild?.addEventListener("click", (e) => {
      e.stopPropagation();
      viewMode = "build";
      refreshLogViews();
      savePrefs();
    });
    els.viewArt?.addEventListener("click", (e) => {
      e.stopPropagation();
      viewMode = "art";
      refreshLogViews();
      savePrefs();
    });
    els.viewBoth?.addEventListener("click", (e) => {
      e.stopPropagation();
      viewMode = "both";
      refreshLogViews();
      savePrefs();
    });
    els.captureBuild?.addEventListener("click", (e) => {
      e.stopPropagation();
      buildCapture = !buildCapture;
      refreshLogViews();
      savePrefs();
    });
    els.captureArt?.addEventListener("click", (e) => {
      e.stopPropagation();
      artCapture = !artCapture;
      refreshLogViews();
      savePrefs();
      syncArtCaptureToPreview();
    });
    els.clearAll?.addEventListener("click", (e) => {
      e.stopPropagation();
      clearAllStreams();
    });

    initPaneInteractions();
    initBarInteraction();
    syncBarHeightFromToolbar();
    window.addEventListener("resize", () => {
      syncBarHeightFromToolbar();
      applyLayout();
    });
    window.addEventListener("beforeunload", () => {
      flushArtPersist();
    });
    refreshLogViews();
    applyLayout();
    syncArtCaptureToPreview();
    if (window.stateReady && window.state?.project?.path) {
      loadFromServer();
    }
  }

  window.VisConsole = {
    init,
    appendBuild,
    appendArt,
    loadFromServer,
    isArtCapture: () => artCapture,
    syncArtCaptureToPreview,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
