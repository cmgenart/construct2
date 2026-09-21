/**
 * Parameter driver host (dev-ui parent). Relay hub driver ↔ art.
 * @see docs/PARAMETER-DRIVERS-DESIGN.md
 */
(function (g) {
  const HOST = "advBuilder-param-host";
  const DRIVER = "advBuilder-param-driver";

  let api = null;
  let inited = false;
  let iframeParamLastByKey = {};
  let driverPersistTimer = null;
  let driverPersistPending = false;

  function getDriverFrame() {
    return document.getElementById("param-driver-frame");
  }

  function isCustomDriverMode(mode) {
    return mode && mode !== "off" && mode !== "param";
  }

  function postToDriver(msg) {
    const fr = getDriverFrame();
    if (!fr || !fr.contentWindow) return;
    try {
      fr.contentWindow.postMessage({ source: HOST, ...msg }, "*");
    } catch (_) {}
  }

  function buildSchemaRows() {
    if (!api) return [];
    const schema = api.getParamSchema() || [];
    const values = api.getParamValues() || {};
    return schema.map((p) => {
      const row = { ...p };
      if (Object.prototype.hasOwnProperty.call(values, p.name)) {
        row.value = values[p.name];
      } else if ("default" in p) {
        row.value = p.default;
      }
      return row;
    });
  }

  function notifyDriverPatch(patch) {
    if (!patch || !Object.keys(patch).length) return;
    postToDriver({ type: "message", values: patch });
  }

  function updateReadout() {
    if (!api) return;
    const mode = api.getParamDriverMode() || "param";
    if (!isCustomDriverMode(mode)) return;
    const el = document.getElementById("param-readout");
    const wrap = document.getElementById("param-readout-wrap");
    if (!el || !wrap || wrap.hidden) return;
    const ro = g.advParamReadout;
    if (ro && typeof ro.renderParamReadout === "function") {
      ro.renderParamReadout(el, api.getParamSchema() || [], api.getParamValues() || {});
    }
  }

  function applyParamsPatchToIframe(patch, opts) {
    if (!api) return;
    const eq = api.paramValuesEqual;
    const toSend = {};
    for (const k of Object.keys(patch || {})) {
      if (eq && eq(iframeParamLastByKey[k], patch[k])) continue;
      toSend[k] = patch[k];
      iframeParamLastByKey[k] = patch[k];
    }
    if (!Object.keys(toSend).length && !(opts && opts.allowEmpty)) return;
    const ifr = document.getElementById("vis");
    if (!ifr || !ifr.contentWindow) return;
    try {
      ifr.contentWindow.postMessage(toSend, location.origin);
    } catch (_) {}
  }

  function resetIframeParamLast() {
    iframeParamLastByKey = {};
  }

  function scheduleDriverPersist() {
    driverPersistPending = true;
    clearTimeout(driverPersistTimer);
    driverPersistTimer = setTimeout(() => {
      driverPersistTimer = null;
      if (!driverPersistPending || !api) return;
      driverPersistPending = false;
      const values = api.getParamValues() || {};
      fetch("/params", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values, persist: true, broadcast: false }),
      }).catch(() => {});
      api.saveDriverUiPrefs({});
    }, 500);
  }

  /**
   * Apply driver send patch: coerce, merge, relay art, notify driver, readout.
   * @param {object} patch bare map from driver
   * @param {{ persist?: boolean }} [opts]
   */
  function applyDriverParamPatch(patch, opts) {
    if (!api || !patch || !Object.keys(patch).length) return;
    const coerce = g.advParamCoerce && g.advParamCoerce.coerceParamPatch;
    if (typeof coerce !== "function") return;

    const { values, relay } = coerce(api.getParamSchema(), patch);
    if (!Object.keys(values).length) return;

    const prev = api.getParamValues() || {};
    const changed = {};
    const merged = { ...prev };
    const eq = api.paramValuesEqual;

    for (const k of Object.keys(values)) {
      if (eq && eq(prev[k], values[k])) continue;
      merged[k] = values[k];
      changed[k] = values[k];
    }
    if (!Object.keys(changed).length) return;

    api.setParamValues(merged);
    applyParamsPatchToIframe(relay);
    notifyDriverPatch(changed);
    updateReadout();

    const mode = api.getParamDriverMode();
    if (mode === "param" && !api.isParamRangeDragging()) {
      api.updateParamsUI();
    }

    api.postParamPatch(changed, undefined, false, {
      persist: opts && opts.persist === true,
      skipIframe: true,
      broadcast: false,
    });
    if (!(opts && opts.persist === true)) scheduleDriverPersist();
  }

  function onDriverButton(name) {
    if (!api || typeof name !== "string" || !name) return;
    api.fireParamButton(name);
  }

  function sendDriverSnapshot() {
    if (!api) return;
    postToDriver({
      type: "snapshot",
      schema: buildSchemaRows(),
      values: { ...(api.getParamValues() || {}) },
    });
  }

  function mountDriverIframe(driverId) {
    const fr = getDriverFrame();
    if (!fr) return;
    fr.src = "/parameters/" + encodeURIComponent(driverId) + ".html?t=" + Date.now();
  }

  function driverHeightMin() {
    return 120;
  }

  function driverHeightMax() {
    const scroll = document.getElementById("left-scroll");
    if (scroll && scroll.clientHeight > 0) {
      return Math.max(280, Math.min(560, Math.floor(scroll.clientHeight * 0.65)));
    }
    return 480;
  }

  function clampDriverHeight(h) {
    const n = Number(h);
    const base = Number.isFinite(n) && n > 0 ? n : 280;
    return Math.max(driverHeightMin(), Math.min(driverHeightMax(), base));
  }

  function applyParamDriverLayout() {
    if (!api) return;
    const mode = api.getParamDriverMode() || "param";
    const drivers = api.getParamDrivers() || [];
    const driverWrap = document.getElementById("param-driver-wrap");
    const panelWrap = document.getElementById("panel-params-wrap");
    const readoutWrap = document.getElementById("param-readout-wrap");
    const sel = document.getElementById("param-mode");

    if (sel) {
      sel.innerHTML = "";
      const addOpt = (v, label) => {
        const o = document.createElement("option");
        o.value = v;
        o.textContent = label;
        sel.appendChild(o);
      };
      addOpt("off", "Off");
      addOpt("param", "PARAM");
      drivers.forEach((id) => addOpt(id, id));
      sel.value = drivers.includes(mode) || mode === "off" || mode === "param" ? mode : "param";
    }

    const custom = isCustomDriverMode(mode);
    const section = document.getElementById("section-params");
    if (section) {
      section.classList.toggle("is-driver-mode", custom);
      section.classList.toggle("is-param-mode", mode === "param");
    }
    const docs = document.getElementById("param-driver-docs");
    if (docs) docs.hidden = !custom;

    if (driverWrap) {
      driverWrap.hidden = !custom;
      if (custom) {
        const px = clampDriverHeight(api.getParamDriverHeight());
        driverWrap.style.height = px + "px";
        driverWrap.style.maxHeight = driverHeightMax() + "px";
        api.setParamDriverHeight(px);
      }
    }
    if (panelWrap) panelWrap.hidden = mode !== "param";
    if (readoutWrap) {
      readoutWrap.hidden = !custom;
      if (custom) {
        readoutWrap.classList.toggle("collapsed", !!api.getParamReadoutCollapsed());
        const rh = api.getParamReadoutHeight();
        const panel = document.getElementById("param-readout-panel");
        if (panel && !api.getParamReadoutCollapsed()) {
          if (rh > 0) {
            panel.style.height = Math.max(40, Math.min(180, rh)) + "px";
          } else {
            panel.style.height = "";
          }
        }
      }
    }

    if (custom) mountDriverIframe(mode);
    else if (getDriverFrame()) getDriverFrame().src = "about:blank";

    if (custom) updateReadout();
  }

  function onParamModeChange() {
    const sel = document.getElementById("param-mode");
    if (!sel || !api) return;
    api.setParamDriverMode(sel.value);
    applyParamDriverLayout();
    if (sel.value === "param") api.updateParamsUI();
    api.saveDriverUiPrefs({});
  }

  function initParamResizeHandles() {
    document.querySelectorAll(".param-v-resize").forEach((handle) => {
      if (handle.dataset.resizeBound) return;
      handle.dataset.resizeBound = "1";

      const driverWrap = document.getElementById("param-driver-wrap");
      const driverFrame = document.getElementById("param-driver-frame");
      const readoutPanel = document.getElementById("param-readout-panel");
      const readoutWrap = document.getElementById("param-readout-wrap");

      let dragging = false;
      let startY = 0;
      let startH = 0;
      let resizeTarget = null;

      function endDrag(e) {
        if (!dragging) return;
        dragging = false;
        resizeTarget = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        if (driverFrame) driverFrame.style.pointerEvents = "";
        if (readoutWrap) readoutWrap.style.pointerEvents = "";
        handle.style.pointerEvents = "";
        if (e && e.pointerId != null && handle.hasPointerCapture?.(e.pointerId)) {
          try {
            handle.releasePointerCapture(e.pointerId);
          } catch (_) {}
        }
        api.saveDriverUiPrefs({});
      }

      handle.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault();
        resizeTarget = handle.dataset.resize;
        const subject =
          resizeTarget === "driver"
            ? driverWrap
            : resizeTarget === "readout"
              ? readoutPanel
              : null;
        if (!subject) return;

        dragging = true;
        startY = e.clientY;
        startH = subject.offsetHeight;
        document.body.style.cursor = "row-resize";
        document.body.style.userSelect = "none";
        if (resizeTarget === "driver" && driverFrame) {
          driverFrame.style.pointerEvents = "none";
        }
        if (resizeTarget === "readout" && readoutWrap) {
          readoutWrap.style.pointerEvents = "none";
          handle.style.pointerEvents = "auto";
        }
        try {
          handle.setPointerCapture(e.pointerId);
        } catch (_) {}
      });

      handle.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        const dy = e.clientY - startY;
        if (resizeTarget === "driver" && driverWrap) {
          const next = clampDriverHeight(startH + dy);
          driverWrap.style.height = next + "px";
          driverWrap.style.maxHeight = driverHeightMax() + "px";
          api.setParamDriverHeight(next);
        } else if (resizeTarget === "readout" && readoutPanel) {
          const next = Math.max(40, Math.min(180, startH + dy));
          readoutPanel.style.height = next + "px";
          api.setParamReadoutHeight(next);
        }
      });

      handle.addEventListener("pointerup", endDrag);
      handle.addEventListener("pointercancel", endDrag);
      handle.addEventListener("lostpointercapture", () => {
        if (dragging) endDrag(null);
      });
    });

    const head = document.getElementById("param-readout-head");
    if (head) {
      head.addEventListener("click", () => {
        const collapsed = !api.getParamReadoutCollapsed();
        api.setParamReadoutCollapsed(collapsed);
        document.getElementById("param-readout-wrap").classList.toggle("collapsed", collapsed);
        api.saveDriverUiPrefs({});
      });
    }
  }

  function initDriverMessageBridge() {
    window.addEventListener("message", (ev) => {
      const fr = getDriverFrame();
      if (!fr || !fr.contentWindow || ev.source !== fr.contentWindow) return;
      const d = ev.data;
      if (!d || d.source !== DRIVER) return;

      if (d.type === "ready") {
        sendDriverSnapshot();
        return;
      }
      if (d.type === "send" && d.values) {
        if (api.getParamDriverMode() === "off") return;
        applyDriverParamPatch(d.values);
        return;
      }
      if (d.type === "button" && d.name) {
        onDriverButton(d.name);
        return;
      }
      if (d.type === "store-read" && d.requestId != null && d.file) {
        handleDriverStoreRead(d.requestId, d.file);
        return;
      }
      if (d.type === "store-write" && d.requestId != null && d.file && d.patch) {
        handleDriverStoreWrite(d.requestId, d.file, d.patch);
        return;
      }
      if (d.type === "api-key-read" && d.requestId != null) {
        handleApiKeyRead(d.requestId);
      }
    });
  }

  function postApiKeyResult(requestId, ok, key, error) {
    postToDriver({
      type: "api-key-result",
      requestId,
      ok: !!ok,
      key: key != null ? key : "",
      error: error || undefined,
    });
  }

  async function handleApiKeyRead(requestId) {
    const secrets = g.advPlatformSecrets;
    if (!secrets || typeof secrets.loadSecret !== "function") {
      postApiKeyResult(requestId, false, "", "Secrets unavailable");
      return;
    }
    try {
      const key = await secrets.loadSecret("xai-api-key");
      postApiKeyResult(requestId, true, key || "", null);
    } catch (e) {
      postApiKeyResult(requestId, false, "", String(e.message || e));
    }
  }

  function postStoreResult(requestId, ok, data, error) {
    postToDriver({
      type: "store-result",
      requestId,
      ok: !!ok,
      data: data != null ? data : undefined,
      error: error || undefined,
    });
  }

  function handleDriverStoreRead(requestId, file) {
    const mode = api && api.getParamDriverMode();
    if (!isCustomDriverMode(mode)) {
      postStoreResult(requestId, false, null, "No active driver");
      return;
    }
    fetch(
      "/parameters/" +
        encodeURIComponent(mode) +
        "/store?file=" +
        encodeURIComponent(file),
    )
      .then((r) => r.json())
      .then((body) => {
        if (body && body.ok) postStoreResult(requestId, true, body.data, null);
        else postStoreResult(requestId, false, null, (body && body.error) || "read failed");
      })
      .catch((e) => postStoreResult(requestId, false, null, String(e.message || e)));
  }

  function handleDriverStoreWrite(requestId, file, patch) {
    const mode = api && api.getParamDriverMode();
    if (!isCustomDriverMode(mode)) {
      postStoreResult(requestId, false, null, "No active driver");
      return;
    }
    fetch("/parameters/" + encodeURIComponent(mode) + "/store?file=" + encodeURIComponent(file), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
      .then((r) => r.json())
      .then((body) => {
        if (body && body.ok) postStoreResult(requestId, true, body.data, null);
        else postStoreResult(requestId, false, null, (body && body.error) || "write failed");
      })
      .catch((e) => postStoreResult(requestId, false, null, String(e.message || e)));
  }

  function init(hooks) {
    if (inited && api) return;
    api = hooks;
    inited = true;
    if (!api.getParamDriverMode()) api.setParamDriverMode("param");
    initDriverMessageBridge();
    initParamResizeHandles();
    const sel = document.getElementById("param-mode");
    if (sel && !sel.dataset.bound) {
      sel.dataset.bound = "1";
      sel.addEventListener("change", onParamModeChange);
    }
    applyParamDriverLayout();
    if (!g.__advParamDriverResizeBound) {
      g.__advParamDriverResizeBound = true;
      window.addEventListener("resize", () => {
        if (api && isCustomDriverMode(api.getParamDriverMode())) applyParamDriverLayout();
      });
    }
  }

  function onStateUpdated() {
    if (!api) return;
    applyParamDriverLayout();
    sendDriverSnapshot();
    updateReadout();
  }

  function onExternalParamChange(delta) {
    const mode = api && api.getParamDriverMode();
    if (isCustomDriverMode(mode)) {
      notifyDriverPatch(delta);
      updateReadout();
    }
  }

  g.advParamDriverHost = {
    init,
    onStateUpdated,
    onExternalParamChange,
    applyDriverParamPatch,
    applyParamsPatchToIframe,
    resetIframeParamLast,
    updateReadout,
    notifyDriverPatch,
    isCustomDriverMode,
  };
})(typeof window !== "undefined" ? window : globalThis);
