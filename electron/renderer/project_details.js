/**
 * Start-page project details panel.
 */
(function (global) {
  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatBytes(n) {
    const b = Number(n) || 0;
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
    return (b / (1024 * 1024)).toFixed(1) + " MB";
  }

  function normPath(p) {
    return String(p || "")
      .replace(/\\/g, "/")
      .toLowerCase();
  }

  class ProjectDetailsPanel {
    /**
     * @param {HTMLElement} container
     * @param {object} api
     * @param {() => object} getWorkspace
     * @param {() => Promise<void>} onPinsChanged
     * @param {(ctx: { path: string, name?: string, rootId: string|null }) => void|Promise<void>} [onOpen]
     * @param {(ctx: { path: string, name?: string, rootId: string|null }) => void|Promise<void>} [onDuplicate]
     */
    constructor(container, api, getWorkspace, onPinsChanged, onOpen, onDuplicate) {
      this.container = container;
      this.api = api;
      this.getWorkspace = getWorkspace;
      this.onPinsChanged = onPinsChanged || (async () => {});
      this.onOpen = onOpen || (() => {});
      this.onDuplicate = onDuplicate || (() => {});
      this.currentPath = null;
      this.currentRootId = null;
      this.details = null;
      this._loadGen = 0;
      this._scrollTimer = null;
      this.container.addEventListener(
        "scroll",
        () => {
          this.container.classList.add("is-scrolling");
          clearTimeout(this._scrollTimer);
          this._scrollTimer = setTimeout(() => {
            this.container.classList.remove("is-scrolling");
          }, 700);
        },
        { passive: true },
      );
      this.showPlaceholder();
    }

    showPlaceholder() {
      this.currentPath = null;
      this.details = null;
      this.container.innerHTML =
        '<p class="details-panel-placeholder">' +
        "<strong>Select a project</strong> to see file sizes, collections, and legacy info. " +
        "Double-click a row to open the dev UI.</p>";
    }

    _isPinned(path, rootId) {
      const ws = this.getWorkspace();
      const pins = (ws?.pinnedProjects || {})[rootId] || [];
      return pins.some((p) => normPath(p.path) === normPath(path));
    }

    /**
     * @param {object|null} project
     * @param {string|null} rootId
     */
    async show(project, rootId) {
      if (!project?.path) {
        this.showPlaceholder();
        return;
      }
      this.currentPath = project.path;
      this.currentRootId = rootId || project.rootId || null;
      const gen = ++this._loadGen;
      this.container.innerHTML =
        '<p class="details-panel-placeholder">Loading…</p>';

      const d = await this.api.getProjectDetails({ path: project.path });
      if (gen !== this._loadGen) return;
      if (!d.ok) {
        this.container.innerHTML =
          '<p class="details-panel-placeholder details-error">' +
          (d.error || "Could not load project details") +
          "</p>";
        return;
      }
      this.details = d;
      this.render();
    }

    /** Re-fetch and render when the same project is still selected. */
    async refresh() {
      if (!this.currentPath) return;
      await this.show(
        {
          path: this.currentPath,
          name: this.details?.name,
          rootId: this.currentRootId,
        },
        this.currentRootId,
      );
    }

    async _togglePin() {
      if (!this.currentPath || !this.currentRootId) return;
      const pinned = this._isPinned(this.currentPath, this.currentRootId);
      const payload = {
        path: this.currentPath,
        name: this.details?.name,
        rootId: this.currentRootId,
      };
      const r = pinned
        ? await this.api.unpinProject(payload)
        : await this.api.pinProject(payload);
      if (r.ok) await this.onPinsChanged();
      this.render();
    }

    _section(title, bodyHtml) {
      return (
        '<section class="details-section">' +
        '<h3 class="details-section-title">' +
        title +
        "</h3>" +
        bodyHtml +
        "</section>"
      );
    }

    _fileList(files, projectPath) {
      const rows = (files || [])
        .filter((f) => f.exists)
        .map((f) => {
          let label = escapeHtml(f.path);
          if (f.effective && f.runtimeLabel) {
            label += " · " + escapeHtml(f.runtimeLabel);
          } else if (f.kind === "lib") {
            label += ' <span class="details-muted">(lib)</span>';
          }
          const absPath = f.absPath || "";
          return (
            "<li>" +
            '<button type="button" class="details-file-btn" data-abs-path="' +
            escapeHtml(absPath) +
            '" title="Show in Explorer">' +
            '<span class="details-file-name">' +
            label +
            "</span>" +
            '<span class="details-file-size">' +
            formatBytes(f.bytes) +
            "</span>" +
            "</button></li>"
          );
        });
      if (!rows.length) return '<p class="details-muted">None</p>';
      return (
        '<ul class="details-file-list" data-project-path="' +
        escapeHtml(projectPath || "") +
        '">' +
        rows.join("") +
        "</ul>"
      );
    }

    render() {
      const d = this.details;
      if (!d) return;

      const pinned =
        this.currentRootId &&
        this._isPinned(this.currentPath, this.currentRootId);
      const pinLabel = pinned ? "Unpin" : "Pin";
      const pinDisabled = this.currentRootId ? "" : " disabled";

      let identity =
        '<dl class="details-dl">' +
        "<dt>Folder</dt><dd>" +
        escapeHtml(d.name) +
        "</dd>" +
        "<dt>Kind</dt><dd>" +
        escapeHtml(d.kind) +
        "</dd>";
      if (d.root) {
        identity +=
          "<dt>Root</dt><dd>" +
          escapeHtml(d.root.label) +
          (d.root.readOnly ? " (read-only)" : "") +
          "</dd>";
      }
      if (d.legacy?.typeid) {
        identity += "<dt>Legacy type</dt><dd>" + escapeHtml(d.legacy.typeid) + "</dd>";
      }
      if (d.runtime?.label || d.runtime?.id) {
        identity +=
          "<dt>Active runtime</dt><dd>" +
          escapeHtml(d.runtime.label || d.runtime.id) +
          "</dd>";
      } else if (d.legacy?.runtimeLabel || d.legacy?.runtimeId) {
        identity +=
          "<dt>Runtime</dt><dd>" +
          escapeHtml(d.legacy.runtimeLabel || d.legacy.runtimeId) +
          "</dd>";
      }
      identity += "</dl>";

      const flags = [];
      if (d.flags?.needsReview) flags.push("needs review");
      if (d.flags?.readOnlyRoot) flags.push("read-only root");
      if (d.flags?.convertedPath) flags.push("converted copy exists");
      const flagsHtml = flags.length
        ? '<ul class="details-flags">' +
          flags.map((f) => "<li>" + escapeHtml(f) + "</li>").join("") +
          "</ul>"
        : '<p class="details-muted">None</p>';

      let collectionsHtml = '<p class="details-muted">None</p>';
      if (d.collections?.length) {
        collectionsHtml =
          '<ul class="details-collection-list">' +
          d.collections
            .map(
              (c) =>
                "<li><strong>" +
                escapeHtml(c.name || c.pad2) +
                "</strong> · " +
                c.pieceCount +
                " piece(s)</li>",
            )
            .join("") +
          "</ul>";
      }

      let provenanceHtml = '<p class="details-muted">None</p>';
      const prov = [];
      if (d.provenance?.dataFile) prov.push("data: " + escapeHtml(d.provenance.dataFile));
      if (d.provenance?.dataFileMtime) {
        prov.push("data modified: " + escapeHtml(d.provenance.dataFileMtime));
      }
      if (d.provenance?.legacyImport?.upgradedAt) {
        prov.push("upgraded: " + escapeHtml(d.provenance.legacyImport.upgradedAt));
      }
      if (d.provenance?.legacyDataNewer) {
        prov.push("legacy data newer than last upgrade");
      }
      if (d.provenance?.devJsonTruncated) prov.push("dev.json too large to parse");
      if (prov.length) {
        provenanceHtml =
          '<ul class="details-flags">' +
          prov.map((p) => "<li>" + p + "</li>").join("") +
          "</ul>";
      }

      let readOnlyBanner = "";
      if (d.flags?.readOnlyRoot) {
        if (d.kind === "legacy" && d.root?.id) {
          readOnlyBanner =
            '<div class="details-readonly-banner">' +
            "<p>This project is in a read-only root. Duplicate it to your projects to edit, or enable write to upgrade in place.</p>" +
            '<div class="details-readonly-actions">' +
            '<button type="button" class="details-action-btn details-duplicate-btn">Duplicate</button>' +
            '<button type="button" class="details-action-btn details-enable-write-btn">Enable write on root</button>' +
            "</div>" +
            (d.flags?.convertedPath
              ? '<p class="details-muted">An upgraded copy may exist at: ' +
                escapeHtml(d.flags.convertedPath) +
                "</p>"
              : "") +
            "</div>";
        } else {
          readOnlyBanner =
            '<div class="details-readonly-banner">' +
            "<p>This project is read-only. Duplicate it to your projects to edit.</p>" +
            '<div class="details-readonly-actions">' +
            '<button type="button" class="details-action-btn details-duplicate-btn">Duplicate</button>' +
            "</div>" +
            "</div>";
        }
      }

      this.container.innerHTML =
        '<div class="details-header">' +
        '<div class="details-title-row">' +
        '<h2 class="details-title">' +
        escapeHtml(d.name) +
        "</h2>" +
        '<div class="details-title-actions">' +
        '<button type="button" class="details-open-btn">Open</button>' +
        (d.flags?.readOnlyRoot
          ? '<button type="button" class="details-duplicate-btn" title="Copy to your projects and open">Duplicate</button>'
          : "") +
        '<button type="button" class="details-folder-btn" title="Open in Explorer" aria-label="Open in Explorer">&#128193;</button>' +
        '<button type="button" class="details-pin-btn"' +
        pinDisabled +
        ">" +
        pinLabel +
        "</button>" +
        "</div>" +
        "</div>" +
        "</div>" +
        '<p class="details-path">' +
        escapeHtml(d.path) +
        "</p>" +
        readOnlyBanner +
        '<div class="details-body">' +
        '<div class="details-col details-col--meta">' +
        this._section("Identity", identity) +
        this._section("Flags", flagsHtml) +
        this._section("Collections", collectionsHtml) +
        this._section("Legacy provenance", provenanceHtml) +
        "</div>" +
        '<div class="details-col details-col--files">' +
        this._section("Source files", this._fileList(d.sourceFiles, d.path)) +
        this._section("Build outputs", this._fileList(d.outputs, d.path)) +
        "</div>" +
        "</div>";

      const openBtn = this.container.querySelector(".details-open-btn");
      if (openBtn) {
        openBtn.addEventListener("click", () => {
          this.onOpen({
            path: this.currentPath,
            name: d.name,
            rootId: this.currentRootId,
          });
        });
      }

      const folderBtn = this.container.querySelector(".details-folder-btn");
      if (folderBtn && this.currentPath) {
        folderBtn.addEventListener("click", () => {
          this.api.revealInExplorer({ path: this.currentPath, mode: "folder" });
        });
      }

      for (const btn of this.container.querySelectorAll(".details-file-btn")) {
        btn.addEventListener("click", () => {
          const absPath = btn.dataset.absPath;
          if (!absPath) return;
          this.api.revealInExplorer({
            absPath,
            projectPath: this.currentPath,
            mode: "select",
          });
        });
      }

      const pinBtn = this.container.querySelector(".details-pin-btn");
      if (pinBtn && !pinBtn.disabled) {
        pinBtn.addEventListener("click", () => this._togglePin());
      }

      const enableWriteBtn = this.container.querySelector(".details-enable-write-btn");
      if (enableWriteBtn && d.root?.id) {
        enableWriteBtn.addEventListener("click", async () => {
          const r = await this.api.enableRootWrite({ rootId: d.root.id });
          if (r.ok) {
            await this.onPinsChanged();
            await this.show(
              { path: this.currentPath, name: d.name, rootId: this.currentRootId },
              this.currentRootId,
            );
          }
        });
      }

      for (const dupBtn of this.container.querySelectorAll(".details-duplicate-btn")) {
        dupBtn.addEventListener("click", () => {
          this.onDuplicate({
            path: this.currentPath,
            name: d.name,
            rootId: this.currentRootId,
          });
        });
      }
    }
  }

  global.ProjectDetailsPanel = ProjectDetailsPanel;
})(typeof window !== "undefined" ? window : globalThis);
