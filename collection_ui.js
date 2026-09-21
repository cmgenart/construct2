/**
 * Collection editor v2 UI — Collections panel + piece list.
 * @see docs/COLLECTION-DESIGN-V2.md
 */
(function () {
  "use strict";

  let activeCollection = null;
  let buildProgress = null;
  let collectionsListCache = [];
  let ctxMenuEl = null;
  let ctxMenuPad2 = null;
  let pieceAddCtxMenuEl = null;
  let pieceScriptsCtxMenuEl = null;
  let pieceCtxMenuEl = null;
  let pieceErrorsOverlayEl = null;
  const pieceErrorHints = Object.create(null);
  let statusMessage = "";
  const MAX_PIECES = 9999;
  const BULK_PIECE_BATCH_MAX = 500;

  function pad4(n) {
    return String(Math.max(0, Number(n) || 0)).padStart(4, "0");
  }

  function pieceListLabel(pr) {
    const bag = pr.values || {};
    let num = pr.num;
    const numEntry = bag.num;
    if (numEntry && typeof numEntry === "object" && numEntry.value != null) {
      const n = parseInt(String(numEntry.value), 10);
      if (!Number.isNaN(n)) num = n;
    }
    const p4 = pad4(num);
    let name = "";
    const nameEntry = bag.name;
    if (nameEntry && typeof nameEntry === "object" && nameEntry.value != null) {
      name = String(nameEntry.value);
    } else if (pr.displayName) {
      name = String(pr.displayName).replace(/^\d{4}:?\s*/, "");
    }
    if (!name) name = `Piece ${p4}`;
    return `${p4} ${name}`;
  }

  function applyStateFromServer(serverState) {
    if (!serverState) return;
    if (typeof window.applyBuilderState === "function") {
      window.applyBuilderState(serverState);
    } else {
      window.state = serverState;
    }
  }

  function getState() {
    return typeof window !== "undefined" ? window.state || {} : {};
  }

  function ctx() {
    const s = getState();
    return s.collectionContext || { pad2: null, selectedPieceIds: [] };
  }

  function isMultiPiece() {
    return (ctx().selectedPieceIds || []).length > 1;
  }

  function pieceStatusClass(pr) {
    if (!pr) return "piece-unbuilt";
    if (pieceHasBuildErrors(pr) || pr.metadataOverBudget) return "piece-error";
    if (pr.buildStatus === "built") return "piece-built";
    if (pr.hasOutput) return "piece-stale";
    return "piece-unbuilt";
  }

  function pieceHasBuildErrors(pr) {
    if (!pr) return false;
    return pr.buildStatus === "error" || !!pieceErrorHints[pr.id];
  }

  function pieceShowsErrorIndicator(pr) {
    if (!pr) return false;
    return pieceHasBuildErrors(pr) || !!pr.metadataOverBudget;
  }

  function formatErrorEntry(e) {
    if (typeof e === "string") return e;
    const info = e?.info != null ? String(e.info) : "";
    const err = e?.error != null ? String(e.error) : "";
    const line = [info, err].filter(Boolean).join(": ");
    return line || JSON.stringify(e);
  }

  function formatErrorsBody(errors) {
    if (!errors) return "No error details available.";
    if (Array.isArray(errors)) return errors.map(formatErrorEntry).join("\n\n");
    if (typeof errors === "object") return JSON.stringify(errors, null, 2);
    return String(errors);
  }

  async function fetchPieceErrorHint(pad2, pr) {
    if (!pad2 || !pr) return;
    const p4 = pad4(pr.num);
    try {
      const r = await fetch(`/collections/${pad2}/${p4}/errors.json`);
      if (!r.ok) {
        if (pr.buildStatus === "error") {
          pieceErrorHints[pr.id] = { summary: "Build failed" };
        } else {
          delete pieceErrorHints[pr.id];
        }
        return;
      }
      const data = await r.json();
      const hasErr = Array.isArray(data) ? data.length > 0 : !!data;
      if (hasErr) {
        pieceErrorHints[pr.id] = {
          summary: formatErrorEntry(Array.isArray(data) ? data[0] : data),
          errors: data,
        };
      } else {
        delete pieceErrorHints[pr.id];
      }
    } catch {
      if (pr.buildStatus === "error") {
        pieceErrorHints[pr.id] = { summary: "Build failed" };
      }
    }
  }

  function hidePieceContextMenu() {
    if (pieceCtxMenuEl) {
      pieceCtxMenuEl.remove();
      pieceCtxMenuEl = null;
    }
  }

  function hidePieceErrorsOverlay() {
    if (pieceErrorsOverlayEl) {
      pieceErrorsOverlayEl.remove();
      pieceErrorsOverlayEl = null;
    }
  }

  async function showPieceErrorsModal(pad2, pr) {
    hidePieceErrorsOverlay();
    const p4 = pad4(pr.num);
    let errors = pieceErrorHints[pr.id]?.errors;
    if (!errors) {
      try {
        const r = await fetch(`/collections/${pad2}/${p4}/errors.json`);
        if (r.ok) errors = await r.json();
      } catch (_) {}
    }
    const overlay = document.createElement("div");
    overlay.className = "piece-errors-overlay";
    overlay.innerHTML =
      `<div class="piece-errors-dialog" role="dialog" aria-modal="true">` +
      `<h3 class="piece-errors-title">${escapeHtml(pieceListLabel(pr))} — build errors</h3>` +
      `<pre class="piece-errors-body">${escapeHtml(formatErrorsBody(errors))}</pre>` +
      `<div class="piece-errors-actions">` +
      `<button type="button" class="piece-errors-copy">Copy</button>` +
      `<button type="button" class="piece-errors-close">Close</button>` +
      `</div></div>`;
    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) hidePieceErrorsOverlay();
    });
    overlay.querySelector(".piece-errors-close")?.addEventListener("click", hidePieceErrorsOverlay);
    overlay.querySelector(".piece-errors-copy")?.addEventListener("click", async () => {
      const text = formatErrorsBody(errors);
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        alert(text);
      }
    });
    document.body.appendChild(overlay);
    pieceErrorsOverlayEl = overlay;
  }

  async function rebuildPieceById(pieceId) {
    const pad2 = ctx().pad2;
    if (!pad2 || !pieceId) return;
    showPieceBuildOverlay({ index: 0, total: 1, label: "Starting…" });
    const res = await api(`/collections/${pad2}/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pieceIds: [pieceId] }),
    });
    if (!res.ok) {
      hidePieceBuildOverlay();
      alert(res.error || "Build failed");
    }
  }

  async function openPieceInExplorer(pad2, pieceNum) {
    const p4 = pad4(pieceNum);
    const res = await api(`/collections/${pad2}/reveal/${p4}`, { method: "POST" });
    if (!res.ok) {
      alert(res.error || "Could not open folder");
      return;
    }
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        { type: "advBuilder:revealPath", path: res.path },
        "*",
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(res.path);
      alert(`Path copied to clipboard:\n${res.path}`);
    } catch {
      alert(res.path);
    }
  }

  function openPieceInBrowser(pad2, pieceNum, hasMin) {
    const p4 = pad4(pieceNum);
    const file = hasMin ? "min.html" : "full.html";
    const url = `${window.location.origin}/collections/${pad2}/${p4}/${file}`;
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "advBuilder:open-external", url }, "*");
      return;
    }
    window.open(url, "_blank", "noopener");
  }

  function showPieceContextMenu(ev, pr) {
    ev.preventDefault();
    hidePieceContextMenu();
    const pad2 = ctx().pad2;
    if (!pad2 || !pr) return;
    const frozen = isCollectionFrozen(pad2);
    const showErr = pieceHasBuildErrors(pr);
    const hasMin = !!pr.hasOutput;
    const menu = document.createElement("div");
    menu.className = "collection-ctx-menu piece-ctx-menu";
    let html = "";
    if (showErr) {
      html += `<button type="button" data-action="errors">Show errors…</button>`;
    }
    html += `<button type="button" data-action="build"${frozen ? " disabled" : ""}>${isMultiPiece() ? "Build selected" : "Build"}</button>`;
    html += `<button type="button" data-action="explorer">Open in Explorer</button>`;
    html += `<button type="button" data-action="browser"${hasMin ? "" : " disabled"}>Open in browser</button>`;
    menu.innerHTML = html;
    menu.style.left = `${ev.clientX}px`;
    menu.style.top = `${ev.clientY}px`;
    menu.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn || btn.disabled) return;
      const action = btn.getAttribute("data-action");
      hidePieceContextMenu();
      if (action === "errors") showPieceErrorsModal(pad2, pr);
      else if (action === "build") {
        if (isMultiPiece()) runBuild(false);
        else rebuildPieceById(pr.id);
      }
      else if (action === "explorer") openPieceInExplorer(pad2, pr.num);
      else if (action === "browser") openPieceInBrowser(pad2, pr.num, hasMin);
    });
    document.body.appendChild(menu);
    pieceCtxMenuEl = menu;
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        menu.style.left = `${Math.max(0, window.innerWidth - rect.width - 4)}px`;
      }
      if (rect.bottom > window.innerHeight) {
        menu.style.top = `${Math.max(0, window.innerHeight - rect.height - 4)}px`;
      }
    });
  }

  async function api(path, opts) {
    const r = await fetch(path, opts);
    return r.json();
  }

  async function loadCollectionsList() {
    const data = await api("/collections");
    return data.collections || [];
  }

  function promptNewCollectionName(defaultName) {
    return new Promise((resolve) => {
      if (typeof window.showNewCollectionModal === "function") {
        window.showNewCollectionModal(defaultName || "New collection", resolve);
        return;
      }
      const name = prompt("Collection name", defaultName || "New collection");
      resolve(name == null ? null : name);
    });
  }

  async function loadCollection(pad2) {
    const data = await api(`/collections/${pad2}`);
    if (data.ok) activeCollection = data.collection;
    return data;
  }

  async function setSession(pad2, selectedPieceIds) {
    const data = await api("/collections/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pad2: pad2 || null, selectedPieceIds: selectedPieceIds || [] }),
    });
    if (data.collection) activeCollection = data.collection;
    if (data.state) applyStateFromServer(data.state);
    return data;
  }

  function showPieceListCol(show) {
    const col = document.getElementById("piece-list-col");
    if (!col) return;
    col.hidden = !show;
    document.body.classList.toggle("collection-open", !!show);
    requestAnimationFrame(() => {
      if (typeof window.layoutPieceListCol === "function") {
        window.layoutPieceListCol();
      }
    });
  }

  function isViewerLevelActive() {
    const level = getState().propertiesActiveLevel || "viewer";
    return level === "viewer" || level === "default";
  }

  function canAddFromViewer(pad2) {
    if (!isViewerLevelActive()) return false;
    if (pad2 && isCollectionFrozen(pad2)) return false;
    return true;
  }

  function updateCollectionTransferButtons() {
    const viewerActive = isViewerLevelActive();
    const upSymbol = "\u25B3";
    const downSymbol = "\u25BD";
    document.querySelectorAll(".collection-tab-from-viewer[data-pad2]").forEach((btn) => {
      const pad2 = btn.getAttribute("data-pad2");
      btn.textContent = viewerActive ? upSymbol : downSymbol;
      if (viewerActive) {
        const frozen = pad2 && isCollectionFrozen(pad2);
        btn.disabled = !!frozen;
        btn.title = frozen
          ? "Collection is frozen"
          : "Add piece from viewer";
      } else {
        btn.disabled = false;
        if (ctx().pad2 !== pad2) {
          btn.title = "Send piece to viewer";
        } else if ((ctx().selectedPieceIds || []).length !== 1) {
          btn.title = "Send piece to viewer (select one piece)";
        } else {
          btn.title = "Send piece to viewer";
        }
      }
    });
  }

  function hideCollectionContextMenu() {
    if (ctxMenuEl) {
      ctxMenuEl.remove();
      ctxMenuEl = null;
      ctxMenuPad2 = null;
    }
  }

  function hidePieceAddContextMenu() {
    if (pieceAddCtxMenuEl) {
      pieceAddCtxMenuEl.remove();
      pieceAddCtxMenuEl = null;
    }
  }

  function hidePieceScriptsContextMenu() {
    if (pieceScriptsCtxMenuEl) {
      pieceScriptsCtxMenuEl.remove();
      pieceScriptsCtxMenuEl = null;
    }
  }

  function getCollectionScriptNames() {
    const names = getState().collectionScriptNames;
    return Array.isArray(names) ? names : [];
  }

  function updateScriptButton() {
    const btn = document.getElementById("btn-piece-scripts");
    if (!btn) return;
    const pad2 = ctx().pad2;
    const scripts = getCollectionScriptNames();
    const show = !!pad2 && scripts.length > 0;
    btn.hidden = !show;
    btn.disabled = !show || !!(activeCollection && activeCollection.frozen);
  }

  function showPieceScriptsContextMenu(ev) {
    ev.preventDefault();
    hidePieceScriptsContextMenu();
    hideCollectionContextMenu();
    hidePieceAddContextMenu();
    const pad2 = ctx().pad2;
    if (!pad2) return;
    const scripts = getCollectionScriptNames();
    if (!scripts.length) return;
    const frozen = !!(activeCollection && activeCollection.frozen);
    const menu = document.createElement("div");
    menu.className = "collection-ctx-menu";
    menu.innerHTML = scripts
      .map(
        (name) =>
          `<button type="button" data-script="${escapeHtml(name)}"${
            frozen ? " disabled" : ""
          }>${escapeHtml(name)}</button>`,
      )
      .join("");
    menu.style.left = `${ev.clientX}px`;
    menu.style.top = `${ev.clientY}px`;
    menu.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-script]");
      if (!btn || btn.disabled) return;
      hidePieceScriptsContextMenu();
      const scriptName = btn.getAttribute("data-script");
      if (scriptName) runCollectionScriptByName(scriptName);
    });
    document.body.appendChild(menu);
    pieceScriptsCtxMenuEl = menu;
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        menu.style.left = `${Math.max(0, window.innerWidth - rect.width - 4)}px`;
      }
      if (rect.bottom > window.innerHeight) {
        menu.style.top = `${Math.max(0, window.innerHeight - rect.height - 4)}px`;
      }
    });
  }

  async function runCollectionScriptByName(scriptName) {
    const pad2 = ctx().pad2;
    if (!pad2 || !scriptName) return;
    const count = activeCollection?.pieceRecords?.length || 0;
    if (count > 0) {
      const ok = window.confirm(
        `Replace ${count} existing piece(s)? Built outputs will be discarded.`,
      );
      if (!ok) return;
    }
    const res = await api(`/collections/${pad2}/run-script`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scriptName }),
    });
    if (!res.ok) {
      alert(res.error || "Collection script failed");
      return;
    }
    activeCollection = res.collection;
    if (res.state) applyStateFromServer(res.state);
    statusMessage = `${scriptName}: ${res.pieceCount} piece(s)`;
    renderPieceList();
    renderCollectionsPanel();
    refreshPanelsAfterPieceChange();
  }

  function isCollectionFrozen(pad2) {
    const c = collectionsListCache.find((x) => x.pad2 === pad2);
    return !!(c && c.frozen);
  }

  function showCollectionContextMenu(ev, pad2) {
    ev.preventDefault();
    hideCollectionContextMenu();
    const frozen = isCollectionFrozen(pad2);
    const viewerOk = isViewerLevelActive();
    ctxMenuPad2 = pad2;
    const menu = document.createElement("div");
    menu.className = "collection-ctx-menu";
    const maxAdd = maxBlankPiecesAddable(pad2);
    menu.innerHTML =
      `<button type="button" data-action="create-n"${frozen || maxAdd < 1 ? " disabled" : ""}>Create N pieces…</button>` +
      `<button type="button" data-action="blank"${frozen ? " disabled" : ""}>Add blank piece</button>` +
      `<button type="button" data-action="viewer"${frozen || !viewerOk ? " disabled" : ""}>Add piece from viewer</button>`;
    menu.style.left = `${ev.clientX}px`;
    menu.style.top = `${ev.clientY}px`;
    menu.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn || btn.disabled || !ctxMenuPad2) return;
      const action = btn.getAttribute("data-action");
      const targetPad2 = ctxMenuPad2;
      hideCollectionContextMenu();
      if (action === "create-n") addManyBlankPiecesFromDialog(targetPad2);
      else if (action === "blank") addBlankPieceToCollection(targetPad2);
      else if (action === "viewer") addPieceFromViewer(targetPad2);
    });
    document.body.appendChild(menu);
    ctxMenuEl = menu;
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        menu.style.left = `${Math.max(0, window.innerWidth - rect.width - 4)}px`;
      }
      if (rect.bottom > window.innerHeight) {
        menu.style.top = `${Math.max(0, window.innerHeight - rect.height - 4)}px`;
      }
    });
  }

  function refreshPanelsAfterPieceChange() {
    if (typeof window.updateValuesUI === "function") window.updateValuesUI();
    if (typeof window.updatePropsUI === "function") window.updatePropsUI();
    if (typeof window.refreshCollectionPreview === "function") {
      window.refreshCollectionPreview();
    } else if (typeof window.refreshVisualiser === "function") {
      window.refreshVisualiser();
    }
  }

  async function postAddPieceFlow(pad2, piece, fromViewer) {
    if (fromViewer && piece) {
      statusMessage = `Added ${pad4(piece.num)} from viewer`;
    } else {
      statusMessage = "";
    }
    const data = await setSession(pad2, piece && piece.id ? [piece.id] : []);
    if (data.state) applyStateFromServer(data.state);
    if (data.collection) activeCollection = data.collection;
    renderCollectionsPanel();
    renderPieceList();
    refreshPanelsAfterPieceChange();
  }

  function maxBlankPiecesAddable(pad2) {
    const coll =
      activeCollection &&
      String(activeCollection.num).padStart(2, "0") === pad2
        ? activeCollection
        : null;
    const n = coll?.pieceRecords?.length ?? 0;
    return Math.max(0, Math.min(BULK_PIECE_BATCH_MAX, MAX_PIECES - n));
  }

  async function addBlankPieceToCollection(pad2, count = 1) {
    if (!pad2) return;
    const n = Math.max(1, parseInt(String(count), 10) || 1);
    const res = await api(`/collections/${pad2}/pieces`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: n }),
    });
    if (!res.ok) {
      alert(res.error || "Could not add piece");
      return;
    }
    const added = res.pieces || [];
    activeCollection = res.collection;
    if (n > 1) {
      statusMessage = `Added ${added.length} blank piece(s)`;
      const data = await setSession(pad2, []);
      if (data.state) applyStateFromServer(data.state);
      if (data.collection) activeCollection = data.collection;
      renderCollectionsPanel();
      renderPieceList();
      refreshPanelsAfterPieceChange();
      return;
    }
    const piece = added[0] || null;
    await postAddPieceFlow(pad2, piece, false);
  }

  function promptCreateNPiecesCount(pad2) {
    return new Promise((resolve) => {
      const maxCount = maxBlankPiecesAddable(pad2);
      if (maxCount < 1) {
        alert(`Maximum pieces (${MAX_PIECES}) reached for this collection.`);
        resolve(null);
        return;
      }
      if (typeof window.showCreateNPiecesModal === "function") {
        window.showCreateNPiecesModal(
          { defaultCount: Math.min(10, maxCount), maxCount },
          resolve,
        );
        return;
      }
      const raw = prompt(`How many blank pieces to add? (1–${maxCount})`, "10");
      if (raw == null) {
        resolve(null);
        return;
      }
      const n = parseInt(String(raw).trim(), 10);
      resolve(Number.isFinite(n) && n >= 1 ? Math.min(n, maxCount) : null);
    });
  }

  async function addManyBlankPiecesFromDialog(pad2) {
    if (!pad2) return;
    const count = await promptCreateNPiecesCount(pad2);
    if (count == null) return;
    await addBlankPieceToCollection(pad2, count);
  }

  function showCreateNPiecesContextMenu(ev, pad2) {
    ev.preventDefault();
    hidePieceAddContextMenu();
    hideCollectionContextMenu();
    if (!pad2) return;
    const frozen = isCollectionFrozen(pad2);
    const maxAdd = maxBlankPiecesAddable(pad2);
    const menu = document.createElement("div");
    menu.className = "collection-ctx-menu";
    const disabled = frozen || maxAdd < 1;
    menu.innerHTML =
      `<button type="button" data-action="create-n"${disabled ? " disabled" : ""}>Create N pieces…</button>`;
    menu.style.left = `${ev.clientX}px`;
    menu.style.top = `${ev.clientY}px`;
    menu.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn || btn.disabled) return;
      hidePieceAddContextMenu();
      if (btn.getAttribute("data-action") === "create-n") {
        addManyBlankPiecesFromDialog(pad2);
      }
    });
    document.body.appendChild(menu);
    pieceAddCtxMenuEl = menu;
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        menu.style.left = `${Math.max(0, window.innerWidth - rect.width - 4)}px`;
      }
      if (rect.bottom > window.innerHeight) {
        menu.style.top = `${Math.max(0, window.innerHeight - rect.height - 4)}px`;
      }
    });
  }

  function showPieceAddContextMenu(ev) {
    const pad2 = ctx().pad2;
    if (!pad2) return;
    showCreateNPiecesContextMenu(ev, pad2);
  }

  async function addPieceFromViewer(pad2) {
    const targetPad2 = pad2 || ctx().pad2;
    if (!targetPad2 || !canAddFromViewer(targetPad2)) return;
    const res = await api(`/collections/${targetPad2}/pieces`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: 1, fromViewer: true }),
    });
    if (!res.ok) {
      alert(res.error || "Could not add piece from viewer");
      return;
    }
    const piece = (res.pieces && res.pieces[0]) || null;
    activeCollection = res.collection;
    await postAddPieceFlow(targetPad2, piece, true);
  }

  async function transportPieceToViewer(pad2) {
    if (!pad2) return;
    if (isViewerLevelActive()) return;
    if (ctx().pad2 !== pad2) {
      await openCollection(pad2);
      return;
    }
    const sel = ctx().selectedPieceIds || [];
    if (sel.length !== 1) {
      alert("Select exactly one piece to send to the viewer");
      return;
    }
    const pieceId = sel[0];
    if (typeof window.showRebuilding === "function") window.showRebuilding();
    const res = await api(`/collections/${pad2}/to-viewer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pieceId }),
    });
    if (!res.ok) {
      if (typeof window.hideRebuilding === "function") window.hideRebuilding();
      alert(res.error || "Could not send piece to viewer");
      return;
    }
    statusMessage = "";
    activeCollection = null;
    if (res.state) applyStateFromServer(res.state);
    renderCollectionsPanel();
    showPieceListCol(false);
    refreshPanelsAfterPieceChange();
    updateCollectionTransferButtons();
  }

  function onCollectionTransferClick(pad2) {
    if (isViewerLevelActive()) addPieceFromViewer(pad2);
    else transportPieceToViewer(pad2);
  }

  let autoBriefSaveTimer = null;
  let peerTemplateSaveTimer = null;

  const COLLECTION_AUTO_SECTION_STATE_KEY = "advBuilder.collectionAutoSections";

  function readCollectionAutoSectionState() {
    try {
      const raw = localStorage.getItem(COLLECTION_AUTO_SECTION_STATE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  function writeCollectionAutoSectionState(map) {
    try {
      localStorage.setItem(COLLECTION_AUTO_SECTION_STATE_KEY, JSON.stringify(map));
    } catch (_) {}
  }

  function snapshotCollectionAutoSectionState() {
    const map = {};
    document.querySelectorAll(".collection-auto-section[id]").forEach((sec) => {
      map[sec.id] = sec.classList.contains("collapsed");
    });
    writeCollectionAutoSectionState(map);
  }

  function bindCollectionAutoSectionToggles() {
    document.querySelectorAll(".collection-auto-section-head").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sec = btn.closest(".collection-auto-section");
        if (!sec) return;
        const collapsed = sec.classList.toggle("collapsed");
        btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
        snapshotCollectionAutoSectionState();
      });
    });
    const helpBtn = document.getElementById("collection-auto-peer-help");
    if (helpBtn) {
      helpBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.advOpenCollectionPeerHelpModal?.();
      });
    }
  }

  function normalizeAutoSettingsClient(input) {
    const d = {
      includePeerExamples: true,
      peerExampleMax: 5,
      peerExampleKeys: ["name", "description"],
      peerExampleTemplate:
        "num: [values.num]\nname: [values.name]\ndescription: [values.description]",
      peerExampleIntro:
        "Here are examples from other pieces in this collection (match this tone and style; do not copy verbatim):",
      peerExampleOutro:
        "Generate a new entry in the same spirit for the current piece.",
      peerExampleSeparator: "---",
    };
    if (!input || typeof input !== "object") return { ...d };
    const out = { ...d };
    if (input.includePeerExamples != null) {
      out.includePeerExamples = !!input.includePeerExamples;
    }
    if (input.peerExampleMax != null) {
      const n = parseInt(input.peerExampleMax, 10);
      if (Number.isFinite(n) && n >= 0) out.peerExampleMax = Math.min(n, 20);
    }
    if (Array.isArray(input.peerExampleKeys)) {
      const keys = input.peerExampleKeys
        .filter((k) => typeof k === "string" && k.trim())
        .map((k) => k.trim());
      if (keys.length) out.peerExampleKeys = keys;
    }
    if (input.peerExampleTemplate != null) {
      out.peerExampleTemplate = String(input.peerExampleTemplate);
    }
    if (input.peerExampleIntro != null) {
      out.peerExampleIntro = String(input.peerExampleIntro);
    }
    if (input.peerExampleOutro != null) {
      out.peerExampleOutro = String(input.peerExampleOutro);
    }
    if (input.peerExampleSeparator != null) {
      out.peerExampleSeparator = String(input.peerExampleSeparator);
    }
    return out;
  }

  async function patchCollectionAuto(pad2, patch) {
    const res = await api(`/collections/${pad2}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok && res.collection) {
      activeCollection = res.collection;
      onCollectionPatched(res.collection);
    } else if (!res.ok) {
      alert(res.error || "Could not save collection auto settings");
    }
    return res;
  }

  function bindCollectionAutoPanelEvents(pad2, frozen) {
    if (frozen) return;
    const briefEl = document.getElementById("collection-auto-brief");
    if (briefEl) {
      const saveBrief = () => {
        patchCollectionAuto(pad2, { autoBrief: briefEl.value });
      };
      briefEl.addEventListener("input", () => {
        clearTimeout(autoBriefSaveTimer);
        autoBriefSaveTimer = setTimeout(saveBrief, 400);
      });
      briefEl.addEventListener("blur", () => {
        clearTimeout(autoBriefSaveTimer);
        saveBrief();
      });
    }
    const peerEnable = document.getElementById("collection-auto-peer-enable");
    const peerMax = document.getElementById("collection-auto-peer-max");
    const peerKeys = document.getElementById("collection-auto-peer-keys");
    const peerTemplate = document.getElementById("collection-auto-peer-template");
    const syncPeerFieldsEnabled = () => {
      const on = !!(peerEnable && peerEnable.checked);
      if (peerMax) peerMax.disabled = !on;
      if (peerKeys) peerKeys.disabled = !on;
      if (peerTemplate) peerTemplate.disabled = !on;
      const block = document.getElementById("collection-auto-peer-fields");
      if (block) block.classList.toggle("collection-auto-peer-fields-off", !on);
    };
    const savePeerSettings = () => {
      const keysRaw = (peerKeys && peerKeys.value ? peerKeys.value : "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      patchCollectionAuto(pad2, {
        autoSettings: {
          includePeerExamples: !!(peerEnable && peerEnable.checked),
          peerExampleMax: peerMax ? parseInt(peerMax.value, 10) : 5,
          peerExampleKeys: keysRaw.length ? keysRaw : ["name", "description"],
          peerExampleTemplate: peerTemplate ? peerTemplate.value : undefined,
        },
      });
    };
    if (peerEnable) {
      peerEnable.addEventListener("change", () => {
        syncPeerFieldsEnabled();
        savePeerSettings();
      });
    }
    syncPeerFieldsEnabled();
    if (peerMax) {
      peerMax.addEventListener("change", savePeerSettings);
      peerMax.addEventListener("blur", savePeerSettings);
    }
    if (peerKeys) {
      peerKeys.addEventListener("change", savePeerSettings);
      peerKeys.addEventListener("blur", savePeerSettings);
    }
    if (peerTemplate) {
      peerTemplate.addEventListener("input", () => {
        clearTimeout(peerTemplateSaveTimer);
        peerTemplateSaveTimer = setTimeout(savePeerSettings, 400);
      });
      peerTemplate.addEventListener("blur", () => {
        clearTimeout(peerTemplateSaveTimer);
        savePeerSettings();
      });
    }
  }

  function renderCollectionAutoPanel() {
    const panel = document.getElementById("collection-auto-panel");
    if (!panel) return;
    const pad2 = ctx().pad2;
    if (!pad2 || !activeCollection) {
      panel.hidden = true;
      panel.innerHTML = "";
      return;
    }
    panel.hidden = false;
    const frozen = !!activeCollection.frozen;
    const brief =
      activeCollection.autoBrief != null ? String(activeCollection.autoBrief) : "";
    const settings = normalizeAutoSettingsClient(activeCollection.autoSettings);
    const electron = !!window.advIsElectronApp;
    const peersOn = settings.includePeerExamples;
    const peerFieldsDisabled = frozen || !peersOn;
    const peerDisabledAttr = peerFieldsDisabled ? " disabled" : "";
    const sectionState = readCollectionAutoSectionState();
    const briefCollapsed = !!sectionState["collection-auto-brief-section"];
    const settingsCollapsed =
      sectionState["collection-auto-settings-section"] !== undefined
        ? !!sectionState["collection-auto-settings-section"]
        : true;

    let html = '<div class="collection-auto-block">';
    html += `<div class="collection-auto-section${briefCollapsed ? " collapsed" : ""}" id="collection-auto-brief-section">`;
    html += `<button type="button" class="collection-auto-section-head" aria-expanded="${briefCollapsed ? "false" : "true"}"><span class="collection-auto-section-title">Brief (collection flavour)</span></button>`;
    html += '<div class="collection-auto-section-body">';
    html += `<textarea id="collection-auto-brief" class="collection-auto-brief" rows="3" spellcheck="false" placeholder="Shared tone for auto prompts — referenced as [collection.brief] in prompt inserts."${frozen ? " disabled" : ""}>${escapeHtml(brief)}</textarea>`;
    html += "</div></div>";
    if (electron) {
      html += `<div class="collection-auto-section${settingsCollapsed ? " collapsed" : ""}" id="collection-auto-settings-section">`;
      html += `<button type="button" class="collection-auto-section-head" aria-expanded="${settingsCollapsed ? "false" : "true"}"><span class="collection-auto-section-title">Auto settings</span></button>`;
      html += '<div class="collection-auto-section-body"><div class="collection-auto-settings">';
      html += '<div class="collection-auto-peer-row">';
      html += `<label class="collection-auto-inline">Max peers <input type="number" id="collection-auto-peer-max" min="0" max="20" value="${settings.peerExampleMax}"${peerDisabledAttr}></label>`;
      html += `<label class="collection-auto-check"><input type="checkbox" id="collection-auto-peer-enable"${settings.includePeerExamples ? " checked" : ""}${frozen ? " disabled" : ""}> Include peer examples</label>`;
      html += "</div>";
      html += `<div id="collection-auto-peer-fields" class="${peersOn ? "" : "collection-auto-peer-fields-off"}">`;
      html += '<label class="collection-auto-label" for="collection-auto-peer-keys">Peer example keys (auto fill eligibility)</label>';
      html += `<input type="text" id="collection-auto-peer-keys" class="collection-auto-keys" spellcheck="false" value="${escapeHtml(settings.peerExampleKeys.join(", "))}" placeholder="name, description — piece qualifies if any key is non-empty (batch auto fill)"${peerDisabledAttr}>`;
      html += '<div class="collection-auto-label-row">';
      html += '<label class="collection-auto-label" for="collection-auto-peer-template">Peer example template</label>';
      html += '<button type="button" class="collection-auto-help-btn" id="collection-auto-peer-help" title="Peer examples and insert reference">?</button>';
      html += "</div>";
      html += `<textarea id="collection-auto-peer-template" class="collection-auto-peer-template" rows="5" spellcheck="false" placeholder="One peer per block — use [values.key], [properties.Name], [piece.num]. Blocks are separated by ---."${peerDisabledAttr}>${escapeHtml(settings.peerExampleTemplate)}</textarea>`;
      html += "</div>";
      html += "</div></div></div>";
    }
    html += "</div>";
    panel.innerHTML = html;
    bindCollectionAutoPanelEvents(pad2, frozen);
    bindCollectionAutoSectionToggles();
  }

  function collectionLabel(coll) {
    if (!coll) return "";
    if (coll.displayName) return String(coll.displayName);
    const entry = coll.values?.collection_name;
    if (entry && typeof entry === "object" && entry.value != null) {
      const v = String(entry.value).trim();
      if (v) return v;
    }
    return coll.name != null ? String(coll.name) : "";
  }

  function renderCollectionsPanel() {
    const tabs = document.getElementById("collection-tabs");
    const status = document.getElementById("collection-status");
    if (!tabs) return;
    loadCollectionsList().then((list) => {
      collectionsListCache = list;
      let html = "";
      for (const c of list) {
        const active = ctx().pad2 === c.pad2 ? " collection-tab-active" : "";
        const frozen = c.frozen ? " collection-tab-frozen" : "";
        const frozenAttr = c.frozen ? " disabled" : "";
        html += `<div class="collection-tab-stack">`;
        html += `<button type="button" class="collection-tab${active}${frozen}" data-pad2="${c.pad2}" title="${escapeHtml(c.name)}">${c.pad2}</button>`;
        html += `<button type="button" class="collection-tab-from-viewer" data-pad2="${c.pad2}" title="Add piece from viewer"${frozenAttr}>\u25B3</button>`;
        html += `</div>`;
      }
      html += `<button type="button" class="collection-tab-add" id="btn-collection-add" title="New collection">+</button>`;
      tabs.innerHTML = html;
      tabs.querySelectorAll(".collection-tab[data-pad2]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const pad2 = btn.getAttribute("data-pad2");
          if (ctx().pad2 === pad2) closeCollection();
          else openCollection(pad2);
        });
        btn.addEventListener("contextmenu", (ev) => {
          const pad2 = btn.getAttribute("data-pad2");
          if (pad2) showCollectionContextMenu(ev, pad2);
        });
      });
      tabs.querySelectorAll(".collection-tab-from-viewer[data-pad2]").forEach((btn) => {
        btn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          if (btn.disabled) return;
          const pad2 = btn.getAttribute("data-pad2");
          if (pad2) onCollectionTransferClick(pad2);
        });
      });
      updateCollectionTransferButtons();
      const addBtn = document.getElementById("btn-collection-add");
      if (addBtn) {
        addBtn.onclick = async () => {
          const name = await promptNewCollectionName("New collection");
          if (name == null) return;
          const res = await api("/collections", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          });
          if (res.ok) {
            await openCollection(res.pad2);
            renderCollectionsPanel();
          } else {
            alert(res.error || "Could not create collection");
          }
        };
        addBtn.addEventListener("contextmenu", (ev) => {
          const pad2 = ctx().pad2;
          if (!pad2) {
            ev.preventDefault();
            alert("Open a collection first, then right-click + to create pieces.");
            return;
          }
          showCreateNPiecesContextMenu(ev, pad2);
        });
      }
      if (status) {
        status.classList.toggle(
          "status-error",
          !!statusMessage && /failed/i.test(statusMessage),
        );
        if (statusMessage) {
          status.textContent = statusMessage;
        } else if (ctx().pad2 && activeCollection) {
          status.textContent = `${collectionLabel(activeCollection)} · ${activeCollection.pieceRecords.length} piece(s)`;
          if (activeCollection.frozen) status.textContent += " · frozen";
        } else {
          status.textContent = "No collection open";
        }
      }
      syncCollectionAutoPanel();
    });
  }

  function isCollectionAutoPanelEditing() {
    const el = document.activeElement;
    if (!el || !el.id) return false;
    return (
      el.id === "collection-auto-brief" ||
      el.id === "collection-auto-peer-template" ||
      el.id === "collection-auto-peer-keys"
    );
  }

  function syncCollectionAutoPanel() {
    const pad2 = ctx().pad2;
    if (!pad2) {
      renderCollectionAutoPanel();
      return;
    }
    if (isCollectionAutoPanelEditing()) return;
    if (
      activeCollection &&
      String(activeCollection.num).padStart(2, "0") === pad2
    ) {
      renderCollectionAutoPanel();
      return;
    }
    loadCollection(pad2).then((data) => {
      if (data.ok) activeCollection = data.collection;
      if (!isCollectionAutoPanelEditing()) renderCollectionAutoPanel();
    });
  }

  function renderPieceList() {
    const list = document.getElementById("piece-list");
    if (!list) return;
    const pad2 = ctx().pad2;
    if (!pad2) {
      list.innerHTML = "";
      showPieceListCol(false);
      return;
    }
    showPieceListCol(true);
    const render = (coll) => {
      activeCollection = coll;
      const sel = new Set(ctx().selectedPieceIds || []);
      let html = "";
      for (const pr of coll.pieceRecords || []) {
        const selected = sel.has(pr.id) ? " piece-selected" : "";
        const cls = pieceStatusClass(pr);
        const errDot = pieceShowsErrorIndicator(pr)
          ? `<span class="piece-error-dot" aria-label="Build errors"></span>`
          : "";
        const hint = pieceErrorHints[pr.id]?.summary;
        let title = hint ? escapeHtml(hint) : "";
        if (!title && pr.metadataOverBudget) {
          title = escapeHtml(
            `Metadata over Cardano limit (${pr.metadataSize || "?"} bytes)`,
          );
        }
        html += `<button type="button" class="piece-row ${cls}${selected}" data-id="${pr.id}" data-num="${pr.num}"${title ? ` title="${title}"` : ""}>`;
        const label = pieceListLabel(pr);
        const staleMark =
          pr.buildStatus !== "built" && pr.buildStatus !== "error" && pr.hasOutput
            ? " \u25CB"
            : "";
        html += `<span class="piece-label">${escapeHtml(label)}${staleMark}</span>${errDot}`;
        html += `</button>`;
      }
      if (!html) {
        html = '<p class="piece-list-empty">No pieces — Add piece</p>';
      }
      list.innerHTML = html;
      list.querySelectorAll(".piece-row").forEach((row) => {
        row.addEventListener("click", (ev) => onPieceClick(ev, row));
        row.addEventListener("contextmenu", (ev) => {
          const id = row.getAttribute("data-id");
          const pr = (coll.pieceRecords || []).find((p) => p.id === id);
          if (pr) showPieceContextMenu(ev, pr);
        });
      });
      if (typeof window.refreshCollectionPreview === "function") {
        window.refreshCollectionPreview();
      }
      updateScriptButton();
    };
    loadCollection(pad2).then((data) => {
      if (data.ok) render(data.collection);
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function onPieceClick(ev, row) {
    const id = row.getAttribute("data-id");
    const pad2 = ctx().pad2;
    if (!pad2 || !id) return;
    let sel = [...(ctx().selectedPieceIds || [])];
    if (ev.ctrlKey || ev.metaKey) {
      if (sel.includes(id)) sel = sel.filter((x) => x !== id);
      else sel.push(id);
    } else if (ev.shiftKey && sel.length) {
      const records = activeCollection?.pieceRecords || [];
      const lastId = sel[sel.length - 1];
      const a = records.findIndex((p) => p.id === lastId);
      const b = records.findIndex((p) => p.id === id);
      if (a >= 0 && b >= 0) {
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        sel = records.slice(lo, hi + 1).map((p) => p.id);
      } else {
        sel = [id];
      }
    } else {
      sel = [id];
    }
    setSession(pad2, sel).then((data) => {
      if (data.state) applyStateFromServer(data.state);
      if (data.collection) activeCollection = data.collection;
      if (typeof window.updateValuesUI === "function") window.updateValuesUI();
      if (typeof window.updatePropsUI === "function") window.updatePropsUI();
      renderPieceList();
      updateCollectionTransferButtons();
      if (typeof window.refreshCollectionPreview === "function") {
        window.refreshCollectionPreview();
      }
    });
  }

  async function openCollection(pad2) {
    statusMessage = "";
    const collData = await loadCollection(pad2);
    const pieces = collData?.collection?.pieceRecords || [];
    const firstId = pieces.length ? pieces[0].id : null;
    const data = await setSession(pad2, firstId ? [firstId] : []);
    if (data.state) applyStateFromServer(data.state);
    if (data.collection) activeCollection = data.collection;
    else if (collData?.collection) activeCollection = collData.collection;
    renderCollectionsPanel();
    renderPieceList();
    if (typeof window.updateValuesUI === "function") window.updateValuesUI();
    if (typeof window.updatePropsUI === "function") window.updatePropsUI();
    if (typeof window.refreshCollectionPreview === "function") {
      window.refreshCollectionPreview();
    }
  }

  async function deselectPieces() {
    const pad2 = ctx().pad2;
    if (!pad2 || !(ctx().selectedPieceIds || []).length) return;
    const data = await setSession(pad2, []);
    if (data.state) applyStateFromServer(data.state);
    if (data.collection) activeCollection = data.collection;
    renderPieceList();
    if (typeof window.updateValuesUI === "function") window.updateValuesUI();
    if (typeof window.updatePropsUI === "function") window.updatePropsUI();
    if (typeof window.refreshCollectionPreview === "function") {
      window.refreshCollectionPreview();
    }
  }

  async function closeCollection() {
    statusMessage = "";
    const data = await setSession(null, []);
    if (data.state) applyStateFromServer(data.state);
    activeCollection = null;
    renderCollectionsPanel();
    renderPieceList();
    if (typeof window.updateValuesUI === "function") window.updateValuesUI();
    if (typeof window.updatePropsUI === "function") window.updatePropsUI();
    if (typeof window.refreshVisualiser === "function") window.refreshVisualiser();
  }

  async function addPiece() {
    const pad2 = ctx().pad2;
    if (!pad2) return;
    await addBlankPieceToCollection(pad2);
  }

  async function deleteSelectedPieces() {
    const pad2 = ctx().pad2;
    const sel = ctx().selectedPieceIds || [];
    if (!pad2 || !sel.length) return;
    if (!confirm(`Delete ${sel.length} piece(s)?`)) return;
    for (const id of sel) {
      await api(`/collections/${pad2}/pieces/${id}`, { method: "DELETE" });
    }
    await setSession(pad2, []);
    await loadCollection(pad2);
    renderPieceList();
    renderCollectionsPanel();
    if (typeof window.updateValuesUI === "function") window.updateValuesUI();
  }

  let collectionBuildBusy = false;

  async function rebuildSelectedPiece() {
    const pad2 = ctx().pad2;
    const sel = ctx().selectedPieceIds || [];
    if (!pad2 || sel.length !== 1) return;
    if ((window.state || {}).propertiesActiveLevel !== "piece") return;
    if (collectionBuildBusy) return;
    collectionBuildBusy = true;
    try {
      await runBuild(false);
    } finally {
      collectionBuildBusy = false;
    }
  }

  async function reshuffleSelectedPiece() {
    const pad2 = ctx().pad2;
    const sel = ctx().selectedPieceIds || [];
    if (!pad2 || sel.length !== 1) return;
    if ((window.state || {}).propertiesActiveLevel !== "piece") return;
    showPieceBuildOverlay({ index: 0, total: 1, label: "Starting…" });
    const res = await api(`/collections/${pad2}/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pieceIds: sel, reshuffle: true }),
    });
    if (!res.ok) {
      hidePieceBuildOverlay();
      alert(res.error || "Reshuffle failed");
    }
  }

  function onCollectionPatched(coll) {
    if (coll) activeCollection = coll;
  }

  async function runBuild(forceAll) {
    const pad2 = ctx().pad2;
    if (!pad2) return;
    const sel = ctx().selectedPieceIds || [];
    const body = { forceAll: !!forceAll };
    if (!forceAll && sel.length) body.pieceIds = sel;
    showPieceBuildOverlay({
      index: 0,
      total: forceAll ? activeCollection?.pieceRecords?.length || 0 : sel.length || 0,
      label: "Starting…",
    });
    const res = await api(`/collections/${pad2}/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      hidePieceBuildOverlay();
      alert(res.error || "Build failed");
    }
  }

  function showPieceBuildOverlay(msg) {
    const wrap = document.getElementById("piece-build-progress-wrap");
    const overlay = document.getElementById("piece-build-overlay");
    if (!overlay) return;
    if (wrap) wrap.classList.add("active");
    overlay.hidden = false;
    updatePieceBuildOverlay(msg);
  }

  function updatePieceBuildOverlay(msg) {
    const status = document.getElementById("piece-build-status");
    const fill = document.getElementById("piece-build-progress-fill");
    if (!msg) return;
    const label = msg.label || "…";
    const index = msg.index || 0;
    const total = msg.total || 0;
    if (status) {
      status.textContent =
        total > 0
          ? `Building '${label}' (${index} of ${total})`
          : "Building…";
    }
    if (fill) {
      const pct =
        total > 0 ? Math.min(100, Math.round((index / total) * 100)) : 0;
      fill.style.width = `${pct}%`;
    }
  }

  function hidePieceBuildOverlay() {
    const wrap = document.getElementById("piece-build-progress-wrap");
    const overlay = document.getElementById("piece-build-overlay");
    if (overlay) overlay.hidden = true;
    if (wrap) wrap.classList.remove("active");
    const fill = document.getElementById("piece-build-progress-fill");
    if (fill) fill.style.width = "0%";
  }

  async function cancelBuild() {
    const pad2 = ctx().pad2;
    if (!pad2) return;
    await api(`/collections/${pad2}/build/cancel`, { method: "POST" });
  }

  function onWsMessage(msg) {
    if (msg.type === "collectionBuildProgress") {
      buildProgress = msg;
      showPieceBuildOverlay(msg);
      renderPieceList();
      return;
    }
    if (
      msg.type === "collectionBuildDone" ||
      msg.type === "collectionBuildCancelled"
    ) {
      buildProgress = null;
      hidePieceBuildOverlay();
      const pad2 = ctx().pad2;
      if (msg.type === "collectionBuildCancelled") {
        statusMessage = "Build cancelled";
      } else if (msg.type === "collectionBuildDone" && msg.failed > 0) {
        const ok = msg.succeeded || 0;
        statusMessage = `Build finished — ${msg.failed} failed, ${ok} succeeded`;
      } else if (msg.type === "collectionBuildDone" && msg.total > 0) {
        statusMessage = `Build finished — ${msg.succeeded ?? msg.total} succeeded`;
      }
      if (pad2) {
        loadCollection(pad2).then(() => {
          renderPieceList();
          renderCollectionsPanel();
          if (typeof window.refreshCollectionPreview === "function") {
            window.refreshCollectionPreview();
          }
        });
      }
      if (typeof window.hideRebuilding === "function") window.hideRebuilding();
      return;
    }
    if (msg.type === "collectionBuildSourceInvalidated") {
      buildProgress = null;
      hidePieceBuildOverlay();
      statusMessage =
        "Art source changed — pieces are out of date. Rebuild to include changes.";
      const pad2 = ctx().pad2;
      if (pad2) {
        loadCollection(pad2).then(() => {
          renderPieceList();
          renderCollectionsPanel();
          if (window.state?.collectionPreview) {
            window.state.collectionPreview.sourceStale = true;
          }
          if (typeof window.refreshCollectionPreview === "function") {
            window.refreshCollectionPreview();
          }
          if (typeof window.updateCollectionPreviewBanner === "function") {
            window.updateCollectionPreviewBanner();
          }
        });
      }
      return;
    }
  }

  function syncActiveCollectionFromState() {
    const meta = (window.state || {}).collectionPieceBuildMeta;
    if (!activeCollection || !meta?.pieceId) return;
    const idx = (activeCollection.pieceRecords || []).findIndex(
      (p) => p.id === meta.pieceId
    );
    if (idx < 0) return;
    const pr = activeCollection.pieceRecords[idx];
    activeCollection.pieceRecords[idx] = {
      ...pr,
      properties: meta.properties || pr.properties,
      lastBuiltAllprops: meta.lastBuiltAllprops ?? pr.lastBuiltAllprops,
      lastBuiltPropertyGroups:
        meta.lastBuiltPropertyGroups ?? pr.lastBuiltPropertyGroups,
      lastBuiltPropertyGroupOrder:
        meta.lastBuiltPropertyGroupOrder ?? pr.lastBuiltPropertyGroupOrder,
      lastBuiltPropertyGroupFlags:
        meta.lastBuiltPropertyGroupFlags ?? pr.lastBuiltPropertyGroupFlags,
    };
  }

  function onStateUpdate() {
    syncActiveCollectionFromState();
    renderCollectionsPanel();
    updateCollectionTransferButtons();
    updateScriptButton();
    if (ctx().pad2) renderPieceList();
    else showPieceListCol(false);
  }

  function bindPieceListScroll() {
    const list = document.getElementById("piece-list");
    if (!list || list.dataset.scrollBound) return;
    list.dataset.scrollBound = "1";
    let scrollTimer = null;
    list.addEventListener("scroll", () => {
      list.classList.add("is-scrolling");
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        list.classList.remove("is-scrolling");
      }, 700);
    }, { passive: true });
  }

  function init() {
    bindPieceListScroll();
    const btnAdd = document.getElementById("btn-piece-add");
    const btnDel = document.getElementById("btn-piece-delete");
    const btnBuild = document.getElementById("btn-piece-build");
    const btnBuildAll = document.getElementById("btn-piece-build-all");
    const btnPieceBuildCancel = document.getElementById("piece-build-cancel");
    const btnScripts = document.getElementById("btn-piece-scripts");
    if (btnAdd) {
      btnAdd.addEventListener("click", addPiece);
      btnAdd.addEventListener("contextmenu", showPieceAddContextMenu);
    }
    if (btnDel) btnDel.addEventListener("click", deleteSelectedPieces);
    if (btnBuild) btnBuild.addEventListener("click", () => runBuild(false));
    if (btnBuildAll) btnBuildAll.addEventListener("click", () => runBuild(true));
    if (btnPieceBuildCancel) btnPieceBuildCancel.addEventListener("click", cancelBuild);
    if (btnScripts) {
      btnScripts.addEventListener("click", (ev) => {
        ev.stopPropagation();
        showPieceScriptsContextMenu(ev);
      });
      btnScripts.addEventListener("contextmenu", (ev) => {
        ev.stopPropagation();
        showPieceScriptsContextMenu(ev);
      });
    }
    document.addEventListener("click", (ev) => {
      if (ctxMenuEl && !ctxMenuEl.contains(ev.target)) hideCollectionContextMenu();
      if (pieceAddCtxMenuEl && !pieceAddCtxMenuEl.contains(ev.target)) {
        hidePieceAddContextMenu();
      }
      if (pieceScriptsCtxMenuEl && !pieceScriptsCtxMenuEl.contains(ev.target)) {
        hidePieceScriptsContextMenu();
      }
      if (pieceCtxMenuEl && !pieceCtxMenuEl.contains(ev.target)) hidePieceContextMenu();
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") {
        hideCollectionContextMenu();
        hidePieceAddContextMenu();
        hidePieceScriptsContextMenu();
        hidePieceContextMenu();
        hidePieceErrorsOverlay();
      }
    });
    renderCollectionsPanel();
    updateCollectionTransferButtons();
    if (ctx().pad2) {
      loadCollection(ctx().pad2).then(() => renderPieceList());
    }
  }

  window.CollectionUI = {
    init,
    onStateUpdate,
    onWsMessage,
    openCollection,
    closeCollection,
    deselectPieces,
    addPieceFromViewer,
    addBlankPieceToCollection,
    transportPieceToViewer,
    rebuildSelectedPiece,
    reshuffleSelectedPiece,
    onCollectionPatched,
    renderCollectionsPanel,
    renderPieceList,
    renderCollectionAutoPanel,
    syncCollectionAutoPanel,
    updateCollectionTransferButtons,
    getActiveCollection: () => activeCollection,
    isMultiPiece,
  };
})();
