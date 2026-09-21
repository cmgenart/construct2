/**
 * Unified scrollable project tree for start page and dev rail.
 * @module project_tree
 */
(function (global) {
  const MAX_RECENT = 10;
  const RECENT_ROOT_ID = "__recent__";
  /** Shared scroll offset between start-page tree and dev rail tree. */
  let sharedScrollTop = 0;

  function normPath(p) {
    if (!p) return "";
    return String(p).replace(/\\/g, "/").toLowerCase();
  }

  function pathsEqual(a, b) {
    return normPath(a) === normPath(b);
  }

  function folderDisplayLabel(root) {
    if (root.id === RECENT_ROOT_ID) return "recent/";
    if (root.id === "art") return "art/";
    if (root.id === "legacy") return "art-legacy/";
    const label = String(root.label || "").trim();
    if (label && !label.endsWith("/")) return label + "/";
    return label || "folder/";
  }

  function legacyTooltip(p) {
    const lg = p.legacy || {};
    const lines = [
      "Construct legacy project",
      "typeid: " + (lg.typeid || "unknown"),
      "runtime: " + (lg.runtimeLabel || lg.runtimeId || "unknown"),
    ];
    if (lg.ccVersion) lines.push("version: " + lg.ccVersion);
    if (lg.convertedPath) lines.push("converted → " + lg.convertedPath);
    else lines.push("upgrades in place on first open");
    if (lg.needsReview || p.flags?.needsReview) {
      lines.push("manual review recommended");
    }
    return lines.join("\n");
  }

  function projectMetaText(p) {
    if (p.kind === "legacy" || p.flags?.legacy) {
      const lg = p.legacy || {};
      const bits = ["legacy"];
      if (lg.typeid) bits.push(lg.typeid);
      if (lg.convertedPath) bits.push("converted");
      if (lg.needsReview || p.flags?.needsReview) bits.push("review");
      return bits.join(" · ");
    }
    const f = p.flags || {};
    return [f.devJson && "dev", f.setupJs && "setup", f.needsReview && "review"]
      .filter(Boolean)
      .join(" · ");
  }

  function isLegacyProject(p) {
    return p.kind === "legacy" || !!p.flags?.legacy;
  }

  function badgeSpan(className, text) {
    const s = document.createElement("span");
    s.className = "project-tree-badge " + className;
    s.textContent = text;
    return s;
  }

  class ProjectTree {
    /**
     * @param {HTMLElement} container
     * @param {object} options
     * @param {"start"|"dev"} options.mode
     * @param {(project: object, rootId: string) => void} [options.onSelect]
     * @param {(project: object, rootId: string) => Promise<void>|void} [options.onOpenProject]
     * @param {(rootId: string|null) => void} [options.onExpandChange]
     * @param {boolean} [options.searchEnabled]
     * @param {object} [options.api]
     * @param {(action: string, ctx: object) => Promise<void>|void} [options.onContextAction]
     * @param {(payload: object) => Promise<void>|void} [options.onDrop]
     */
    constructor(container, options) {
      this.container = container;
      this.mode = options.mode || "start";
      this.onSelect = options.onSelect || (() => {});
      this.onOpenProject = options.onOpenProject || (() => {});
      this.onExpandChange = options.onExpandChange || (() => {});
      this.searchEnabled = options.searchEnabled !== false;
      this.api = options.api || null;
      this.onContextAction = options.onContextAction || null;
      this.onDrop = options.onDrop || null;

      this.listData = { roots: [] };
      this.workspace = { recentProjects: [], pinnedProjects: {} };
      this.selectedPath = null;
      this.expandedRootId = null;
      this.selectedFolderId = null;
      this.searchQuery = "";
      this.searchResults = null;
      this._searchIndexCache = null;
      this._searchJob = 0;
      this._searchDebounce = null;
      this._searchRenderPending = false;
      this._pendingSearchRender = false;
      this._dropBanner = null;
      this._dropTarget = null;

      this.rootEl = document.createElement("div");
      this.rootEl.className =
        "project-tree" + (this.mode === "dev" ? " project-tree--rail" : "");
      this.container.replaceChildren(this.rootEl);
      this._bindScrollFade();
      this.render();
    }

    _bindScrollFade() {
      this._scrollEl = null;
      this._scrollTimer = null;
      this._scrollRestoring = false;
    }

    _isScrollVisible(el) {
      return !!el && el.clientHeight > 0 && el.scrollHeight > el.clientHeight;
    }

    _setScrollTop(el, top) {
      if (!el) return;
      const target = Math.max(0, Number(top) || 0);
      this._scrollRestoring = true;
      const apply = () => {
        el.scrollTop = target;
      };
      apply();
      requestAnimationFrame(() => {
        apply();
        requestAnimationFrame(() => {
          apply();
          this._scrollRestoring = false;
        });
      });
    }

    _scheduleScrollRestore() {
      const top = sharedScrollTop;
      if (top <= 0 || !this._scrollEl) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (this._scrollEl) this._setScrollTop(this._scrollEl, top);
        });
      });
    }

    _onScroll(el) {
      if (this._scrollRestoring || !this._isScrollVisible(el)) return;
      sharedScrollTop = el.scrollTop;
      el.classList.add("is-scrolling");
      clearTimeout(this._scrollTimer);
      this._scrollTimer = setTimeout(() => {
        el.classList.remove("is-scrolling");
      }, 700);
    }

    /** Back column when a folder is expanded (same layout in start + dev rail). */
    _useBackColumn() {
      return true;
    }

    /**
     * Update in-memory tree state without re-rendering (hidden dev rail while on picker).
     * @param {object} data
     */
    setDataQuiet(data) {
      if (data.listData) this.listData = data.listData;
      if (data.workspace) this.workspace = data.workspace;
      if (data.expandedRootId !== undefined) {
        this.expandedRootId = data.expandedRootId;
      }
      if (data.selectedPath !== undefined) {
        this.selectedPath = data.selectedPath;
      }
      this._searchIndexCache = null;
    }

    /**
     * @param {object} data
     */
    setData(data) {
      this.captureScrollPosition();
      this.setDataQuiet(data);
      if (this.searchQuery.trim()) {
        this._refreshSearchAfterDataUpdate();
      } else {
        this._requestRender();
      }
      this._scheduleScrollRestore();
      this._ensureSearchInteractive();
    }

    /** Re-enable the search field after async UI work (e.g. native context menus). */
    _ensureSearchInteractive() {
      const input = this._getSearchInput();
      if (!input) return;
      input.disabled = !this.searchEnabled;
      input.removeAttribute("readonly");
      input.style.pointerEvents = "";
      input.tabIndex = 0;
    }

    /**
     * @param {string|null} path
     */
    setSelection(path) {
      this.selectedPath = path;
      this._syncActiveStates();
    }

    /** Persist this tree's scroll offset into the shared store. */
    captureScrollPosition() {
      if (this._scrollEl) sharedScrollTop = this._scrollEl.scrollTop;
    }

    /** Apply the shared scroll offset to this tree (no re-render). */
    applyScrollPosition() {
      if (this._scrollEl) this._setScrollTop(this._scrollEl, sharedScrollTop);
    }

    /**
     * @param {string|null} rootId
     */
    setExpandedRoot(rootId) {
      this.expandedRootId = rootId;
      this.render();
    }

    _syncActiveStates() {
      for (const btn of this.rootEl.querySelectorAll(".project-tree-btn--project")) {
        const p = btn.dataset.path;
        btn.classList.toggle("is-active", p && pathsEqual(p, this.selectedPath));
      }
      for (const btn of this.rootEl.querySelectorAll(".project-tree-btn--folder")) {
        const rid = btn.dataset.rootId;
        const expanded = rid && this.expandedRootId === rid;
        btn.classList.toggle("is-expanded", expanded);
        btn.classList.toggle(
          "is-active",
          rid && this.selectedFolderId === rid,
        );
      }
    }

    _selectProject(project, rootId) {
      this.selectedPath = project.path;
      this.selectedFolderId = null;
      this._syncActiveStates();
      return this.onSelect(project, rootId);
    }

    _selectFolder(rootId) {
      this.selectedFolderId = rootId;
      this.selectedPath = null;
      this._syncActiveStates();
    }

    _collapseRoot() {
      this.expandedRootId = null;
      this.selectedFolderId = null;
      this.onExpandChange(null);
      this.render();
    }

    /**
     * @param {string} rootId
     */
    _expandRoot(rootId) {
      const next = this.expandedRootId === rootId ? null : rootId;
      this.expandedRootId = next;
      this.selectedFolderId = next;
      if (next) this.selectedPath = null;
      this.onExpandChange(next);
      this.render();
    }

    /**
     * @param {object} project
     * @param {string|null} rootId
     */
    _handleProjectClick(project, rootId) {
      if (this.mode === "dev") {
        this._selectProject(project, rootId);
        this.onOpenProject(project, rootId);
        return;
      }
      const same = pathsEqual(this.selectedPath, project.path);
      this._selectProject(project, rootId);
      if (same) {
        this.onOpenProject(project, rootId);
      }
    }

    _clearSearch() {
      this.searchQuery = "";
      this.searchResults = null;
      this._searchJob += 1;
      this.render();
    }

    _getSearchIndex() {
      if (!this._searchIndexCache && global.ProjectSearch) {
        this._searchIndexCache = ProjectSearch.buildSearchIndex(
          this.listData,
          this.workspace,
        );
      }
      return this._searchIndexCache || [];
    }

    _isTreeVisible() {
      if (!this.container?.isConnected) return false;
      const rect = this.container.getBoundingClientRect();
      return rect.width > 8 && rect.height > 8;
    }

    _isSearchFocused() {
      const input = this._getSearchInput();
      return !!input && document.activeElement === input;
    }

    _flushPendingSearchRender() {
      if (!this._pendingSearchRender) return;
      this._pendingSearchRender = false;
      this.render();
    }

    _requestRender() {
      if (this._isSearchFocused()) {
        this._pendingSearchRender = true;
        return;
      }
      this.render();
    }

    _captureSearchFocus() {
      const el = document.activeElement;
      if (
        !el ||
        el.tagName !== "INPUT" ||
        !this.rootEl.contains(el) ||
        !el.closest(".project-tree-search")
      ) {
        return null;
      }
      return {
        start: el.selectionStart,
        end: el.selectionEnd,
      };
    }

    _restoreSearchFocus(snap) {
      if (!snap || !this._isTreeVisible()) return;
      const input = this._getSearchInput();
      if (!input) return;
      input.focus({ preventScroll: true });
      try {
        if (snap.start != null && snap.end != null) {
          input.setSelectionRange(snap.start, snap.end);
        }
      } catch (_) {}
    }

    _getSearchInput() {
      if (this._searchInputEl && this.rootEl.contains(this._searchInputEl)) {
        return this._searchInputEl;
      }
      const input = this.rootEl.querySelector(".project-tree-search input");
      if (input) this._searchInputEl = input;
      return input || null;
    }

    _scheduleSearch(query) {
      this.searchQuery = query;
      this.searchResults = null;
      clearTimeout(this._searchDebounce);
      this.render();
      this._searchDebounce = setTimeout(() => this._runSearch(query), 120);
    }

    /** Re-index and re-score after list data refresh without clearing the search field. */
    _refreshSearchAfterDataUpdate() {
      clearTimeout(this._searchDebounce);
      this.render();
      this._searchDebounce = setTimeout(() => this._runSearch(this.searchQuery), 120);
    }

    async _runSearch(query) {
      const q = String(query || "").trim();
      if (!q || !global.ProjectSearch) {
        this.searchResults = null;
        this.render();
        return;
      }
      const job = ++this._searchJob;
      const index = this._getSearchIndex();
      await ProjectSearch.scoreProjectsChunked(q, index, {
        onPartial: (results) => {
          if (job !== this._searchJob) return;
          this.searchResults = results;
          if (this._searchRenderPending) return;
          this._searchRenderPending = true;
          requestAnimationFrame(() => {
            this._searchRenderPending = false;
            if (job !== this._searchJob) return;
            this._requestRender();
          });
        },
      });
      this._flushPendingSearchRender();
    }

    _makeSearchBackButton() {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "project-tree-back-col";
      btn.title = "Clear search";
      btn.setAttribute("aria-label", "Clear search");
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._clearSearch();
      });
      return btn;
    }

    /**
     * @param {object} entry
     */
    _makeSearchResultRow(entry) {
      const p = entry.project;
      const row = document.createElement("li");
      row.className = "project-tree-row project-tree-row--project";

      const cell = document.createElement("div");
      cell.className = "project-tree-cell";
      const pinned =
        entry.rootId && this._isPinned(p.path, entry.rootId);
      if (pinned) cell.classList.add("project-tree-cell--pinned");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "project-tree-btn project-tree-btn--project";
      btn.dataset.path = p.path;
      if (isLegacyProject(p)) btn.title = legacyTooltip(p);

      const label = document.createElement("span");
      label.className = "project-tree-label";
      this._fillNameEl(label, p);

      const meta = document.createElement("span");
      meta.className = "project-tree-meta";
      const bits = [entry.rootLabel];
      const extra = projectMetaText(p);
      if (extra) bits.push(extra);
      meta.textContent = bits.join(" · ");

      btn.appendChild(label);
      btn.appendChild(meta);
      if (pathsEqual(p.path, this.selectedPath)) btn.classList.add("is-active");

      btn.addEventListener("click", () =>
        this._handleProjectClick(p, entry.rootId),
      );
      this._attachProjectContextMenu(btn, p, entry.rootId);
      cell.appendChild(btn);
      if (pinned) this._appendPinCorner(cell);
      row.appendChild(cell);
      return row;
    }

    _renderSearchResults(list) {
      if (this.searchResults === null) {
        const pending = document.createElement("li");
        pending.className = "project-tree-empty";
        pending.textContent = "Searching…";
        list.appendChild(pending);
        return;
      }
      const results = this.searchResults;
      if (!results.length) {
        const empty = document.createElement("li");
        empty.className = "project-tree-empty";
        empty.textContent = "No matching projects.";
        list.appendChild(empty);
        return;
      }

      const appendRows = (parent) => {
        for (const entry of results) {
          parent.appendChild(this._makeSearchResultRow(entry));
        }
      };

      if (this._useBackColumn()) {
        const wrap = document.createElement("li");
        wrap.className = "project-tree-expanded-wrap";
        const inner = document.createElement("div");
        inner.className = "project-tree-expanded-inner";
        inner.appendChild(this._makeSearchBackButton());
        const items = document.createElement("ul");
        items.className = "project-tree-expanded-items";
        appendRows(items);
        inner.appendChild(items);
        wrap.appendChild(inner);
        list.appendChild(wrap);
        return;
      }

      appendRows(list);
    }

    _bindSearchInput(input) {
      if (!input) return;
      this._searchInputEl = input;
      input.value = this.searchQuery;
      if (!this.searchEnabled || input.dataset.bound) return;
      input.dataset.bound = "1";

      const focusSearch = async () => {
        if (this.api?.focusWindow) await this.api.focusWindow();
        input.focus({ preventScroll: true });
      };

      input.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        void focusSearch();
      });
      input.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        void focusSearch();
      });
      input.addEventListener("blur", () => {
        this._flushPendingSearchRender();
      });
      input.addEventListener("input", () => {
        const val = input.value;
        if (!val.trim()) {
          this._clearSearch();
          return;
        }
        this._scheduleSearch(val);
      });
    }

    _isPinned(projectPath, rootId) {
      if (!rootId) return false;
      const pins = (this.workspace.pinnedProjects || {})[rootId] || [];
      return pins.some((p) => pathsEqual(p.path, projectPath));
    }

    _rootById(rootId) {
      if (!rootId) return null;
      return (this.listData.roots || []).find((r) => r.id === rootId) || null;
    }

    _attachProjectContextMenu(btn, p, rootId) {
      if (!this.api?.showContextMenu || !this.onContextAction) return;
      btn.addEventListener("contextmenu", async (e) => {
        e.preventDefault();
        await this._selectProject(p, rootId);
        const menu = await this.api.showContextMenu({
          kind: "project",
          path: p.path,
          rootId,
          projectKind: isLegacyProject(p) ? "legacy" : "construct2",
          pinned: this._isPinned(p.path, rootId),
          readOnlyRoot: !!this._rootById(rootId)?.readOnly,
        });
        if (menu?.ok && menu.action && !menu.cancelled) {
          await this.onContextAction(menu.action, {
            project: p,
            rootId,
            path: p.path,
          });
        }
      });
    }

    _attachRootContextMenu(btn, root) {
      if (
        root.id === RECENT_ROOT_ID ||
        !this.api?.showContextMenu ||
        !this.onContextAction
      ) {
        return;
      }
      btn.addEventListener("contextmenu", async (e) => {
        e.preventDefault();
        this._selectFolder(root.id);
        const menu = await this.api.showContextMenu({
          kind: "root",
          rootId: root.id,
          path: root.path,
          readOnly: !!root.readOnly,
        });
        if (menu?.ok && menu.action && !menu.cancelled) {
          await this.onContextAction(menu.action, {
            root,
            rootId: root.id,
            path: root.path,
            rootLabel: folderDisplayLabel(root),
          });
        }
      });
    }

    _clearDropUi() {
      this._dropTarget = null;
      if (this._dropBanner) {
        this._dropBanner.hidden = true;
        this._dropBanner.textContent = "";
      }
      for (const el of this.rootEl.querySelectorAll(".project-tree-drop-active")) {
        el.classList.remove("project-tree-drop-active");
        el.classList.remove("project-tree-drop-invalid");
      }
    }

    _showDropUi(target) {
      this._clearDropUi();
      this._dropTarget = target;
      if (!this._dropBanner || !target) return;
      this._dropBanner.hidden = false;
      this._dropBanner.textContent = target.label || "";
      if (target.el) {
        target.el.classList.add(
          target.valid === false
            ? "project-tree-drop-invalid"
            : "project-tree-drop-active",
        );
      }
    }

    _resolveDropTarget(e) {
      const zone = e.target.closest("[data-drop-root-id], [data-drop-zone]");
      if (!zone) {
        return {
          zone: "add-root",
          rootId: null,
          label: "Add folder as root",
          valid: true,
          el: this._scrollEl,
        };
      }
      if (zone.dataset.dropZone === "add-root") {
        return {
          zone: "add-root",
          rootId: null,
          label: "Add folder as root",
          valid: true,
          el: zone,
        };
      }
      const rootId = zone.dataset.dropRootId;
      if (!rootId || rootId === RECENT_ROOT_ID) {
        return {
          zone: "invalid",
          rootId: null,
          label: "Cannot drop here",
          valid: false,
          el: zone,
        };
      }
      const root = (this.listData.roots || []).find((r) => r.id === rootId);
      return {
        zone: "copy-root",
        rootId,
        rootLabel: root ? folderDisplayLabel(root) : rootId,
        label: "Copy to '" + (root ? folderDisplayLabel(root) : rootId) + "'",
        valid: true,
        el: zone,
      };
    }

    _bindDragDrop(scroll) {
      if (!this.api?.getPathForFile || !this.onDrop || scroll.dataset.dragBound) return;
      scroll.dataset.dragBound = "1";

      scroll.addEventListener("dragenter", (e) => {
        e.preventDefault();
      });

      scroll.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        this._showDropUi(this._resolveDropTarget(e));
      });

      scroll.addEventListener("dragleave", (e) => {
        if (!scroll.contains(e.relatedTarget)) this._clearDropUi();
      });

      scroll.addEventListener("drop", async (e) => {
        e.preventDefault();
        const target = this._dropTarget || this._resolveDropTarget(e);
        this._clearDropUi();
        const file = e.dataTransfer?.files?.[0];
        if (!file) return;
        const sourcePath = this.api.getPathForFile(file);
        if (!sourcePath) return;
        await this.onDrop({ sourcePath, ...target });
      });
    }

    _makeBackColumnButton() {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "project-tree-back-col";
      btn.title = "Collapse folder";
      btn.setAttribute("aria-label", "Collapse folder");
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._collapseRoot();
      });
      return btn;
    }

    _fillNameEl(nameEl, p, opts = {}) {
      nameEl.textContent = p.name;
      if (isLegacyProject(p)) {
        nameEl.appendChild(badgeSpan("project-tree-badge--legacy", "legacy"));
      }
      if (p.flags?.needsReview) {
        nameEl.appendChild(badgeSpan("project-tree-badge--review", "review"));
      }
    }

    _appendPinCorner(cell) {
      const pin = document.createElement("span");
      pin.className = "project-tree-pin-corner";
      pin.textContent = "pinned";
      pin.setAttribute("aria-hidden", "true");
      cell.appendChild(pin);
    }

    /**
     * @param {object} p
     * @param {string|null} rootId
     * @param {object} [opts]
     */
    _makeProjectRow(p, rootId, opts = {}) {
      const row = document.createElement("li");
      row.className = "project-tree-row project-tree-row--project";

      const cell = document.createElement("div");
      cell.className = "project-tree-cell";
      if (opts.pinned) cell.classList.add("project-tree-cell--pinned");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "project-tree-btn project-tree-btn--project";
      btn.dataset.path = p.path;
      if (isLegacyProject(p)) btn.title = legacyTooltip(p);

      const label = document.createElement("span");
      label.className = "project-tree-label";
      this._fillNameEl(label, p, opts);

      const meta = document.createElement("span");
      meta.className = "project-tree-meta";
      meta.textContent = projectMetaText(p);

      btn.appendChild(label);
      btn.appendChild(meta);
      if (pathsEqual(p.path, this.selectedPath)) btn.classList.add("is-active");

      btn.addEventListener("click", () => this._handleProjectClick(p, rootId));
      this._attachProjectContextMenu(btn, p, rootId);
      cell.appendChild(btn);
      if (opts.pinned) this._appendPinCorner(cell);
      row.appendChild(cell);
      return row;
    }

    /**
     * @param {object} root
     */
    _makeRootRow(root) {
      const row = document.createElement("li");
      row.className = "project-tree-row project-tree-row--folder";

      const cell = document.createElement("div");
      cell.className = "project-tree-cell";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "project-tree-btn project-tree-btn--folder";
      btn.dataset.rootId = root.id;
      btn.title = root.path || folderDisplayLabel(root);

      const expanded = this.expandedRootId === root.id;
      if (expanded) btn.classList.add("is-expanded");
      if (this.selectedFolderId === root.id) btn.classList.add("is-active");

      const label = document.createElement("span");
      label.className = "project-tree-label";
      label.textContent = folderDisplayLabel(root);

      const meta = document.createElement("span");
      meta.className = "project-tree-meta";
      const count = root.projects.length;
      meta.textContent =
        root.id === RECENT_ROOT_ID
          ? count + " recent"
          : count + " project" + (count === 1 ? "" : "s");

      btn.appendChild(label);
      btn.appendChild(meta);
      btn.addEventListener("click", () => this._expandRoot(root.id));
      if (root.id !== RECENT_ROOT_ID) {
        btn.dataset.dropRootId = root.id;
      }
      this._attachRootContextMenu(btn, root);
      cell.appendChild(btn);
      row.appendChild(cell);
      return row;
    }

    _allProjectsByPath() {
      const m = new Map();
      for (const root of this.listData.roots || []) {
        for (const p of root.projects) {
          m.set(normPath(p.path), p);
        }
      }
      return m;
    }

    _buildRecentFolder() {
      const recents = (this.workspace.recentProjects || []).slice(0, MAX_RECENT);
      const byPath = this._allProjectsByPath();
      const projects = recents.map((item) => {
        const full = byPath.get(normPath(item.path));
        if (full) return full;
        return {
          name: item.name,
          path: item.path,
          rootId: item.rootId || null,
          kind: item.kind,
          flags: item.flags,
          legacy: item.legacy,
        };
      });
      return {
        id: RECENT_ROOT_ID,
        label: "recent/",
        path: "",
        readOnly: false,
        projects,
        isRecent: true,
      };
    }

    _collectProjectRows(root) {
      const rows = [];
      const isRecent = root.id === RECENT_ROOT_ID;

      if (!isRecent) {
        const pins = (this.workspace.pinnedProjects || {})[root.id] || [];
        const pinnedPaths = new Set(pins.map((p) => normPath(p.path)));
        const projectByPath = new Map(
          root.projects.map((p) => [normPath(p.path), p]),
        );

        for (const pin of pins) {
          const p =
            projectByPath.get(normPath(pin.path)) ||
            { name: pin.name, path: pin.path, kind: "unknown", flags: {} };
          rows.push({ p, rootId: root.id, pinned: true });
        }

        const unpinned = root.projects.filter(
          (p) => !pinnedPaths.has(normPath(p.path)),
        );

        if (pins.length && unpinned.length) {
          rows.push({ separator: true });
        }

        for (const p of unpinned) {
          rows.push({ p, rootId: root.id });
        }
      } else {
        for (const p of root.projects) {
          rows.push({ p, rootId: p.rootId || null });
        }
      }

      return rows;
    }

    /**
     * @param {object} root
     * @param {HTMLElement} list
     */
    _renderExpandedProjects(root, list) {
      const entries = this._collectProjectRows(root);

      if (!entries.length) {
        const empty = document.createElement("li");
        empty.className = "project-tree-empty";
        empty.textContent =
          root.id === RECENT_ROOT_ID
            ? "No recent projects yet."
            : "No projects in this folder.";
        list.appendChild(empty);
        return;
      }

      const appendProjectRows = (parent) => {
        for (const entry of entries) {
          if (entry.separator) {
            const sep = document.createElement("li");
            sep.className = "project-tree-separator";
            sep.setAttribute("aria-hidden", "true");
            parent.appendChild(sep);
            continue;
          }
          parent.appendChild(
            this._makeProjectRow(entry.p, entry.rootId, {
              pinned: entry.pinned,
            }),
          );
        }
      };

      if (this._useBackColumn()) {
        const wrap = document.createElement("li");
        wrap.className = "project-tree-expanded-wrap";
        if (root.id !== RECENT_ROOT_ID) {
          wrap.dataset.dropRootId = root.id;
        }
        const inner = document.createElement("div");
        inner.className = "project-tree-expanded-inner";
        inner.appendChild(this._makeBackColumnButton());
        const items = document.createElement("ul");
        items.className = "project-tree-expanded-items";
        appendProjectRows(items);
        inner.appendChild(items);
        wrap.appendChild(inner);
        list.appendChild(wrap);
        return;
      }

      appendProjectRows(list);
    }

    _ensureSearchBar() {
      let searchWrap = this.rootEl.querySelector(".project-tree-search");
      if (!searchWrap) {
        searchWrap = document.createElement("div");
        searchWrap.className = "project-tree-search";
        const searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.setAttribute("role", "searchbox");
        searchInput.setAttribute("aria-label", "Search projects");
        searchInput.placeholder = "Search projects…";
        searchInput.autocomplete = "off";
        searchInput.spellcheck = false;
        searchWrap.appendChild(searchInput);
        this.rootEl.appendChild(searchWrap);
        this._bindSearchInput(searchInput);
      }
      const input = this._getSearchInput();
      if (input) {
        input.disabled = !this.searchEnabled;
        if (document.activeElement !== input) {
          input.value = this.searchQuery;
        }
      }
    }

    _ensureScrollContainer() {
      let scroll = this.rootEl.querySelector(".project-tree-scroll");
      if (!scroll) {
        scroll = document.createElement("div");
        scroll.className = "project-tree-scroll";
        scroll.dataset.dropZone = "add-root";
        scroll.addEventListener("scroll", () => this._onScroll(scroll), {
          passive: true,
        });
        this._scrollEl = scroll;

        const dropBanner = document.createElement("div");
        dropBanner.className = "project-tree-drop-banner";
        dropBanner.hidden = true;
        this._dropBanner = dropBanner;
        scroll.appendChild(dropBanner);
        this.rootEl.appendChild(scroll);
        this._bindDragDrop(scroll);
      } else {
        this._scrollEl = scroll;
        const oldList = scroll.querySelector(".project-tree-list");
        if (oldList) oldList.remove();
      }
      return scroll;
    }

    _populateList(list) {
      const inSearch = !!this.searchQuery.trim();
      if (inSearch) {
        this._renderSearchResults(list);
        return;
      }
      const folders = [this._buildRecentFolder(), ...(this.listData.roots || [])];
      if (!folders.length) {
        const empty = document.createElement("li");
        empty.className = "project-tree-empty";
        empty.textContent = "No workspace roots — add a folder.";
        list.appendChild(empty);
        return;
      }
      for (const root of folders) {
        list.appendChild(this._makeRootRow(root));
        if (this.expandedRootId === root.id) {
          this._renderExpandedProjects(root, list);
        }
      }
    }

    render() {
      const focusSnap = this._captureSearchFocus();
      this._ensureSearchBar();
      const scroll = this._ensureScrollContainer();
      const list = document.createElement("ul");
      list.className = "project-tree-list";
      this._populateList(list);
      scroll.appendChild(list);
      this._setScrollTop(scroll, sharedScrollTop);
      this._syncActiveStates();
      this._restoreSearchFocus(focusSnap);
      this._ensureSearchInteractive();
    }
  }

  global.ProjectTree = ProjectTree;
  global.ProjectTreeRecentRootId = RECENT_ROOT_ID;
  global.ProjectTreeSharedScrollTop = {
    get: () => sharedScrollTop,
    set: (n) => {
      sharedScrollTop = Math.max(0, Number(n) || 0);
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
