/**
 * Floating colour picker (advBuilder dev-ui) — Iro.js HSVA editor.
 * Live preview: iframe postMessage only. Commit: POST /params → dev.json.
 * Undo/redo: per-property stack of committed colours (reset on project load).
 */
(function (g) {
  /** @type {{ postParamPatch: Function, applyParamsToIframe: Function, getParamValues: Function, updateParamsUI: Function, getParamSchema: Function } | null} */
  let deps = null;
  /** @type {Record<string, { stack: *, index: number }>} */
  let colorUndo = {};
  /**
   * @type {{
   *   name: string, type: string, openingSnapshot: *,
   *   dragMoved: boolean, workingNative: *, lastPreviewSig: string | null,
   * } | null}
   */
  let session = null;
  let rootEl = null;
  let dialogEl = null;
  let titleEl = null;
  let bodyEl = null;
  let readoutEl = null;
  let pasteErrorEl = null;
  let undoBtn = null;
  let redoBtn = null;
  let drag = null;
  let iroPicker = null;
  let suppressIro = 0;

  const COLOUR_TYPES = new Set(["PARAM-RGB", "PARAM-HSV", "PARAM-HEX", "PARAM-HSL"]);

  function cloneSnapshot(type, value) {
    const pc = g.advParamColor;
    if (pc && pc.deepCloneColorValue) return pc.deepCloneColorValue(type, value);
    if (value == null) return value;
    if (typeof value === "object") return JSON.parse(JSON.stringify(value));
    return value;
  }

  function cloneNative(v) {
    if (v != null && typeof v === "object") return JSON.parse(JSON.stringify(v));
    return v;
  }

  function nativeSig(v) {
    return JSON.stringify(v);
  }

  function ensureUndoEntry(name, type, values) {
    if (colorUndo[name]) return colorUndo[name];
    const vals = values || (deps && deps.getParamValues()) || {};
    const schema = (deps && deps.getParamSchema()) || [];
    const p = schema.find((x) => x.name === name);
    const baseline = cloneSnapshot(
      type,
      vals[name] !== undefined ? vals[name] : p && p.default,
    );
    colorUndo[name] = { stack: [baseline], index: 0 };
    return colorUndo[name];
  }

  /** Reset all colour undo stacks (call when art project / dev-ui state loads). */
  function resetColorUndo(schema, values) {
    colorUndo = {};
    const vals = values || {};
    for (const p of schema || []) {
      if (!COLOUR_TYPES.has(p.type)) continue;
      const baseline = cloneSnapshot(
        p.type,
        vals[p.name] !== undefined ? vals[p.name] : p.default,
      );
      colorUndo[p.name] = { stack: [baseline], index: 0 };
    }
  }

  function updateUndoRedoButtons() {
    if (!undoBtn || !redoBtn || !session) {
      if (undoBtn) undoBtn.disabled = true;
      if (redoBtn) redoBtn.disabled = true;
      return;
    }
    const u = colorUndo[session.name];
    if (!u) {
      undoBtn.disabled = true;
      redoBtn.disabled = true;
      return;
    }
    undoBtn.disabled = u.index <= 0;
    redoBtn.disabled = u.index >= u.stack.length - 1;
  }

  /** Push a committed colour onto this property's undo stack. */
  function recordCommit(name, type, nativeValue) {
    const u = ensureUndoEntry(name, type);
    const sig = nativeSig(nativeValue);
    if (nativeSig(u.stack[u.index]) === sig) return;
    u.stack = u.stack.slice(0, u.index + 1);
    u.stack.push(cloneNative(nativeValue));
    u.index = u.stack.length - 1;
  }

  function hsvaFromIroColor(color) {
    const pc = g.advParamColor;
    if (!pc || !color) return null;
    const hsv = color.hsv || {};
    return pc.normalizeHsva(hsv.h, hsv.s / 100, hsv.v / 100, color.alpha);
  }

  function applyHsvaToIro(picker, hsva) {
    if (!picker || !hsva) return;
    picker.color.hsv = { h: hsva.h, s: hsva.s * 100, v: hsva.v * 100 };
    picker.color.alpha = hsva.a;
  }

  function getWorkingNative() {
    if (!session) return null;
    const pc = g.advParamColor;
    if (iroPicker && pc) {
      const hsva = hsvaFromIroColor(iroPicker.color);
      const native = pc.toNative(session.type, hsva);
      if (native != null) return native;
    }
    if (session.workingNative !== undefined) return session.workingNative;
    return session.openingSnapshot;
  }

  function updateReadout(nativeVal) {
    if (!readoutEl || !session) return;
    const pc = g.advParamColor;
    readoutEl.textContent = pc ? pc.formatReadout(session.type, nativeVal) || "—" : "—";
  }

  function showPasteError(msg) {
    if (!pasteErrorEl) return;
    pasteErrorEl.textContent = msg || "";
    pasteErrorEl.hidden = !msg;
  }

  function clearPasteError() {
    showPasteError("");
  }

  function getCurrentHsva() {
    if (iroPicker) return hsvaFromIroColor(iroPicker.color);
    const pc = g.advParamColor;
    if (session && session.workingNative != null && pc) {
      return pc.fromNative(session.type, session.workingNative);
    }
    return null;
  }

  /** Clipboard: navigator API, then fallbacks (execCommand / Electron parent bridge). */
  function clipboardViaParent(payload) {
    if (window.parent === window) {
      return Promise.reject(new Error("Clipboard unavailable"));
    }
    return new Promise((resolve, reject) => {
      const id = "cb_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      const onMsg = (e) => {
        const d = e.data;
        if (!d || d.type !== "advBuilder:clipboard-result" || d.id !== id) return;
        window.removeEventListener("message", onMsg);
        if (d.ok) resolve(d.text);
        else reject(new Error(d.error || "Clipboard failed"));
      };
      window.addEventListener("message", onMsg);
      window.parent.postMessage({ ...payload, id }, "*");
      setTimeout(() => {
        window.removeEventListener("message", onMsg);
        reject(new Error("Clipboard timeout"));
      }, 8000);
    });
  }

  function writeClipboardExecCommand(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (_) {}
    document.body.removeChild(ta);
    return ok ? Promise.resolve() : Promise.reject(new Error("Copy failed"));
  }

  function writeClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(() => writeClipboardExecCommand(text));
    }
    return writeClipboardExecCommand(text).catch(() =>
      clipboardViaParent({ type: "advBuilder:clipboard-write", text }).then(() => undefined),
    );
  }

  function readClipboard() {
    if (navigator.clipboard && navigator.clipboard.readText) {
      return navigator.clipboard.readText().catch(() =>
        clipboardViaParent({ type: "advBuilder:clipboard-read" }),
      );
    }
    return clipboardViaParent({ type: "advBuilder:clipboard-read" });
  }

  function copyColor() {
    if (!session || !g.advParamColor) return Promise.resolve();
    const hsva = getCurrentHsva();
    if (!hsva) return Promise.resolve();
    const text = g.advParamColor.formatClipboardHsva(hsva);
    return writeClipboard(text)
      .then(() => clearPasteError())
      .catch(() => showPasteError("Copy failed"));
  }

  function pasteColor() {
    if (!session || !g.advParamColor) return Promise.resolve();
    return readClipboard()
      .then((text) => {
        const hsva = g.advParamColor.parseClipboardHsva(text);
        if (!hsva) {
          showPasteError('Invalid HSVA (expected {"h":…,"s":…,"v":…,"a":…})');
          return;
        }
        clearPasteError();
        const native = g.advParamColor.toNative(session.type, hsva);
        if (native == null) {
          showPasteError("Could not convert pasted colour");
          return;
        }
        syncPickerToNative(native, true);
      })
      .catch(() => showPasteError("Paste failed (check clipboard permission)"));
  }

  function previewSessionNative(native) {
    if (!session || !deps) return;
    const pc = g.advParamColor;
    if (session.mode === "settings" && session.onPreview && pc) {
      const hsva = pc.fromNative(session.type, native);
      if (hsva) session.onPreview(hsva);
      return;
    }
    deps.applyParamsToIframe({ [session.name]: native });
  }

  function syncPickerToNative(native, previewOnly) {
    if (!session || !deps) return;
    const pc = g.advParamColor;
    session.workingNative = cloneNative(native);
    session.lastPreviewSig = nativeSig(native);
    if (iroPicker && pc) {
      const hsva = pc.fromNative(session.type, native);
      if (hsva) {
        suppressIro++;
        applyHsvaToIro(iroPicker, hsva);
        suppressIro--;
      }
    }
    updateReadout(native);
    previewSessionNative(session.workingNative);
    if (!previewOnly) {
      if (session.mode === "settings" && session.onCommit && pc) {
        const hsva = pc.fromNative(session.type, native);
        if (hsva) session.onCommit(hsva);
        return Promise.resolve();
      }
      return deps.postParamPatch(
        { [session.name]: session.workingNative },
        undefined,
        true,
      );
    }
    return Promise.resolve();
  }

  function destroyIro() {
    if (iroPicker) {
      try {
        iroPicker.off("color:change", onIroColorChange);
      } catch (_) {}
      const mount = document.getElementById("color-picker-iro-mount");
      if (mount) mount.innerHTML = "";
      iroPicker = null;
    }
  }

  function onIroColorChange(color) {
    if (suppressIro > 0 || !session || !deps) return;
    const pc = g.advParamColor;
    if (!pc) return;
    const hsva = hsvaFromIroColor(color);
    if (!hsva) return;
    const native = pc.toNative(session.type, hsva);
    if (native == null) return;
    const sig = nativeSig(native);
    if (session.lastPreviewSig === sig) return;
    session.lastPreviewSig = sig;
    session.workingNative = cloneNative(native);
    previewSessionNative(session.workingNative);
    updateReadout(session.workingNative);
  }

  function mountIro(paramEntry, nativeOverride) {
    destroyIro();
    const mount = document.getElementById("color-picker-iro-mount");
    if (!mount) return;
    if (!g.iro || !g.iro.ColorPicker) {
      mount.textContent = "Iro.js failed to load.";
      return;
    }
    const pc = g.advParamColor;
    if (!pc) return;
    const values = deps.getParamValues() || {};
    const current =
      nativeOverride !== undefined
        ? nativeOverride
        : values[paramEntry.name];
    const hsva =
      pc.fromNative(paramEntry.type, current) ||
      pc.fromNative(paramEntry.type, paramEntry.default) || {
        h: 0,
        s: 0,
        v: 0.5,
        a: 1,
      };

    const layout = [
      { component: g.iro.ui.Wheel, options: { wheelLightness: false } },
      { component: g.iro.ui.Slider, options: { sliderType: "hue" } },
      { component: g.iro.ui.Slider, options: { sliderType: "saturation" } },
      { component: g.iro.ui.Slider, options: { sliderType: "value" } },
      { component: g.iro.ui.Slider, options: { sliderType: "alpha" } },
    ];

    iroPicker = new g.iro.ColorPicker(mount, {
      width: 200,
      layout,
    });

    suppressIro++;
    applyHsvaToIro(iroPicker, hsva);
    suppressIro--;

    const native = pc.toNative(paramEntry.type, hsva);
    session.workingNative = cloneNative(native);
    session.lastPreviewSig = native != null ? nativeSig(native) : null;

    iroPicker.on("color:change", onIroColorChange);
    updateReadout(native);
  }

  function buildDom() {
    if (rootEl) return;

    rootEl = document.createElement("div");
    rootEl.id = "color-picker-root";
    rootEl.className = "color-picker-root";
    rootEl.hidden = true;

    const backdrop = document.createElement("div");
    backdrop.className = "color-picker-backdrop";
    backdrop.dataset.action = "backdrop";

    dialogEl = document.createElement("div");
    dialogEl.id = "color-picker-dialog";
    dialogEl.className = "color-picker-dialog";
    dialogEl.setAttribute("role", "dialog");
    dialogEl.setAttribute("aria-modal", "true");
    dialogEl.tabIndex = -1;

    const header = document.createElement("div");
    header.className = "color-picker-header";

    const handle = document.createElement("div");
    handle.className = "color-picker-drag-handle";
    handle.dataset.dragHandle = "1";
    handle.title = "Drag to move";
    titleEl = document.createElement("span");
    titleEl.className = "color-picker-title";
    handle.appendChild(titleEl);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "color-picker-close";
    closeBtn.dataset.action = "commit";
    closeBtn.title = "Accept colour (Enter)";
    closeBtn.setAttribute("aria-label", "Accept colour");
    closeBtn.textContent = "×";

    const headerActions = document.createElement("div");
    headerActions.className = "color-picker-header-actions";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "color-picker-cancel";
    cancelBtn.dataset.action = "discard";
    cancelBtn.title = "Cancel (Esc)";
    cancelBtn.textContent = "Cancel";
    headerActions.appendChild(cancelBtn);
    headerActions.appendChild(closeBtn);

    header.appendChild(handle);
    header.appendChild(headerActions);

    const toolbar = document.createElement("div");
    toolbar.className = "color-picker-toolbar";
    toolbar.innerHTML =
      '<button type="button" data-action="undo" disabled title="Undo (Ctrl+Z)">Undo</button>' +
      '<button type="button" data-action="redo" disabled title="Redo (Ctrl+Y)">Redo</button>' +
      '<button type="button" data-action="discard" title="Cancel (Esc)">Cancel</button>' +
      '<span class="color-picker-toolbar-spacer"></span>' +
      '<button type="button" data-action="copy" title="Copy HSVA (Ctrl+C)">Copy</button>' +
      '<button type="button" data-action="paste" title="Paste HSVA (Ctrl+V)">Paste</button>';
    undoBtn = toolbar.querySelector('[data-action="undo"]');
    redoBtn = toolbar.querySelector('[data-action="redo"]');

    bodyEl = document.createElement("div");
    bodyEl.className = "color-picker-body";

    dialogEl.appendChild(header);
    dialogEl.appendChild(toolbar);
    dialogEl.appendChild(bodyEl);

    rootEl.appendChild(backdrop);
    rootEl.appendChild(dialogEl);
    document.body.appendChild(rootEl);

    rootEl.addEventListener("click", onRootClick);
    dialogEl.addEventListener("keydown", onDialogKeydown);
    handle.addEventListener("pointerdown", onDragStart);
  }

  function onRootClick(e) {
    const t = e.target;
    if (!t || !t.dataset) return;
    const action = t.dataset.action;
    if (action === "backdrop") {
      e.preventDefault();
      commit();
      return;
    }
    if (action === "undo") {
      e.preventDefault();
      undo();
      return;
    }
    if (action === "redo") {
      e.preventDefault();
      redo();
      return;
    }
    if (action === "copy") {
      e.preventDefault();
      copyColor();
      return;
    }
    if (action === "paste") {
      e.preventDefault();
      pasteColor();
      return;
    }
    if (action === "discard") {
      e.preventDefault();
      discard();
      return;
    }
    if (action === "commit") {
      e.preventDefault();
      commit();
    }
  }

  function onDialogKeydown(e) {
    if (!session) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === "z" && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && (e.key === "y" || e.key === "Y")) {
      e.preventDefault();
      e.stopPropagation();
      redo();
      return;
    }
    if (mod && (e.key === "c" || e.key === "C")) {
      e.preventDefault();
      e.stopPropagation();
      copyColor();
      return;
    }
    if (mod && (e.key === "v" || e.key === "V")) {
      e.preventDefault();
      e.stopPropagation();
      pasteColor();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      discard();
      return;
    }
    if (e.key === "Enter" && !mod && !e.altKey) {
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "BUTTON" || tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      commit();
    }
  }

  function onDragStart(e) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (!dialogEl) return;
    e.preventDefault();
    const rect = dialogEl.getBoundingClientRect();
    drag = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origLeft: rect.left,
      origTop: rect.top,
    };
    if (session) session.dragMoved = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
    e.currentTarget.addEventListener("pointermove", onDragMove);
    e.currentTarget.addEventListener("pointerup", onDragEnd);
    e.currentTarget.addEventListener("pointercancel", onDragEnd);
  }

  function onDragMove(e) {
    if (!drag || e.pointerId !== drag.pointerId || !dialogEl) return;
    const left = drag.origLeft + (e.clientX - drag.startX);
    const top = drag.origTop + (e.clientY - drag.startY);
    dialogEl.style.left = Math.round(left) + "px";
    dialogEl.style.top = Math.round(top) + "px";
  }

  function onDragEnd(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const handle = e.currentTarget;
    handle.removeEventListener("pointermove", onDragMove);
    handle.removeEventListener("pointerup", onDragEnd);
    handle.removeEventListener("pointercancel", onDragEnd);
    try {
      if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
    } catch (_) {}
    drag = null;
  }

  function positionNearAnchor(anchorEl) {
    if (!dialogEl || !anchorEl) return;
    const w = dialogEl.offsetWidth || 280;
    const h = dialogEl.offsetHeight || 320;
    const ar = anchorEl.getBoundingClientRect();
    let left = ar.left;
    let top = ar.bottom + 8;
    if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
    if (left < 8) left = 8;
    if (top + h > window.innerHeight - 8) top = ar.top - h - 8;
    if (top < 8) top = 8;
    dialogEl.style.left = Math.round(left) + "px";
    dialogEl.style.top = Math.round(top) + "px";
  }

  function renderPickerBody() {
    if (!bodyEl) return;
    bodyEl.innerHTML = "";
    readoutEl = document.createElement("p");
    readoutEl.className = "color-picker-readout";
    bodyEl.appendChild(readoutEl);
    pasteErrorEl = document.createElement("p");
    pasteErrorEl.className = "color-picker-paste-error";
    pasteErrorEl.hidden = true;
    bodyEl.appendChild(pasteErrorEl);
    const mount = document.createElement("div");
    mount.className = "color-picker-iro-mount";
    mount.id = "color-picker-iro-mount";
    mount.addEventListener("pointerdown", (e) => e.stopPropagation());
    bodyEl.appendChild(mount);
  }

  function isOpen() {
    return !!(session && rootEl && !rootEl.hidden);
  }

  function close() {
    destroyIro();
    session = null;
    drag = null;
    readoutEl = null;
    pasteErrorEl = null;
    if (rootEl) rootEl.hidden = true;
    updateUndoRedoButtons();
  }

  function openSettingsColor(opts) {
    if (!deps || !opts || typeof opts.getValue !== "function") return Promise.resolve();
    if (isOpen()) return commit().then(() => openSettingsColor(opts));
    const pc = g.advParamColor;
    if (!pc) return Promise.resolve();
    const hsva = pc.normalizeHsva(
      opts.getValue().h,
      opts.getValue().s,
      opts.getValue().v,
      opts.getValue().a,
    );
    const native = pc.toNative("PARAM-HSV", hsva);
    buildDom();
    session = {
      name: "__settings__",
      type: "PARAM-HSV",
      mode: "settings",
      openingSnapshot: cloneSnapshot("PARAM-HSV", native),
      dragMoved: false,
      workingNative: null,
      lastPreviewSig: null,
      onPreview: opts.onPreview,
      onCommit: opts.onCommit,
    };
    if (titleEl) titleEl.textContent = opts.title || "Colour";
    const desc = opts.description ? " — " + opts.description : "";
    dialogEl.setAttribute("aria-label", (opts.title || "Colour") + desc);
    renderPickerBody();
    clearPasteError();
    rootEl.hidden = false;
    dialogEl.style.left = "";
    dialogEl.style.top = "";
    positionNearAnchor(opts.anchorEl);
    updateUndoRedoButtons();
    undoBtn.disabled = true;
    redoBtn.disabled = true;
    dialogEl.focus();
    const fakeEntry = { name: "__settings__", type: "PARAM-HSV" };
    requestAnimationFrame(() => {
      if (session && session.name === "__settings__") mountIro(fakeEntry, native);
    });
    return Promise.resolve();
  }

  function open(paramEntry, anchorEl) {
    if (!deps || !paramEntry || !COLOUR_TYPES.has(paramEntry.type))
      return Promise.resolve();
    if (isOpen() && session && session.mode === "settings") {
      return commit().then(() => open(paramEntry, anchorEl));
    }
    buildDom();
    ensureUndoEntry(paramEntry.name, paramEntry.type);
    const values = deps.getParamValues() || {};
    const current = values[paramEntry.name];
    session = {
      name: paramEntry.name,
      type: paramEntry.type,
      mode: "param",
      openingSnapshot: cloneSnapshot(paramEntry.type, current),
      dragMoved: false,
      workingNative: null,
      lastPreviewSig: null,
    };
    if (titleEl) titleEl.textContent = paramEntry.name;
    const desc = paramEntry.description ? " — " + paramEntry.description : "";
    dialogEl.setAttribute("aria-label", "Colour: " + paramEntry.name + desc);
    renderPickerBody();
    clearPasteError();
    rootEl.hidden = false;
    dialogEl.style.left = "";
    dialogEl.style.top = "";
    positionNearAnchor(anchorEl);
    updateUndoRedoButtons();
    dialogEl.focus();
    requestAnimationFrame(() => {
      if (session && session.name === paramEntry.name) mountIro(paramEntry);
    });
    return Promise.resolve();
  }

  function undo() {
    if (!session || !deps) return Promise.resolve();
    const u = colorUndo[session.name];
    if (!u || u.index <= 0) return Promise.resolve();
    u.index--;
    const v = cloneNative(u.stack[u.index]);
    updateUndoRedoButtons();
    return syncPickerToNative(v, false).then(() => {
      if (deps.updateParamsUI) deps.updateParamsUI();
    });
  }

  function redo() {
    if (!session || !deps) return Promise.resolve();
    const u = colorUndo[session.name];
    if (!u || u.index >= u.stack.length - 1) return Promise.resolve();
    u.index++;
    const v = cloneNative(u.stack[u.index]);
    updateUndoRedoButtons();
    return syncPickerToNative(v, false).then(() => {
      if (deps.updateParamsUI) deps.updateParamsUI();
    });
  }

  function discard() {
    if (!session || !deps) {
      close();
      return Promise.resolve();
    }
    const snap = session.openingSnapshot;
    const name = session.name;
    const mode = session.mode;
    const onPreview = session.onPreview;
    const type = session.type;
    destroyIro();
    session = null;
    drag = null;
    readoutEl = null;
    if (rootEl) rootEl.hidden = true;
    updateUndoRedoButtons();
    if (mode === "settings" && onPreview && g.advParamColor) {
      const hsva = g.advParamColor.fromNative(type, snap);
      if (hsva) onPreview(hsva);
    } else {
      deps.applyParamsToIframe({ [name]: snap });
    }
    return Promise.resolve();
  }

  function commit() {
    if (!session || !deps) {
      close();
      return Promise.resolve();
    }
    const name = session.name;
    const type = session.type;
    const v = getWorkingNative();
    const mode = session.mode;
    const onCommit = session.onCommit;
    if (name !== "__settings__") recordCommit(name, type, v);
    destroyIro();
    session = null;
    drag = null;
    readoutEl = null;
    if (rootEl) rootEl.hidden = true;
    updateUndoRedoButtons();
    if (mode === "settings" && onCommit && g.advParamColor) {
      const hsva = g.advParamColor.fromNative(type, v);
      if (hsva) onCommit(hsva);
      return Promise.resolve();
    }
    return deps.postParamPatch({ [name]: v }, undefined, true);
  }

  function init(options) {
    deps = options;
    buildDom();
    if (options.getParamSchema && options.getParamValues) {
      resetColorUndo(options.getParamSchema(), options.getParamValues());
    }
  }

  g.advColorPicker = {
    init,
    open,
    openSettingsColor,
    close,
    commit,
    discard,
    undo,
    redo,
    isOpen,
    resetColorUndo,
    getSession: () => session,
  };
})(typeof window !== "undefined" ? window : globalThis);
