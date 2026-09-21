/**
 * ParamMessenger — driver iframe API (injected by advBuilder dev-ui).
 * @see docs/PARAMETER-DRIVERS-DESIGN.md
 */
(function (g) {
  const HOST = "advBuilder-param-host";
  const DRIVER = "advBuilder-param-driver";

  class ParamMessenger {
    /**
     * @param {{ onMessage?: (values: object) => void }} [opts]
     */
    constructor(opts) {
      if (new.target === undefined) {
        throw new Error("ParamMessenger must be called with new");
      }
      this._onMessage = typeof opts?.onMessage === "function" ? opts.onMessage : null;
      this._onReady = typeof opts?.onReady === "function" ? opts.onReady : null;
      this._values = {};
      this._schema = [];
      this._storePending = new Map();
      this._storeReq = 0;
      this._bound = this._onWindowMessage.bind(this);
      window.addEventListener("message", this._bound);
      this._post({ type: "ready" });
    }

    _post(msg) {
      try {
        window.parent.postMessage({ source: DRIVER, ...msg }, "*");
      } catch (_) {}
    }

    _onWindowMessage(ev) {
      if (ev.source !== window.parent) return;
      const d = ev.data;
      if (!d || d.source !== HOST) return;
      if (d.type === "message" && d.values && typeof d.values === "object") {
        for (const k of Object.keys(d.values)) {
          this._values[k] = d.values[k];
        }
        if (this._onMessage) this._onMessage({ ...d.values });
      } else if (d.type === "schema" && Array.isArray(d.schema)) {
        this._schema = d.schema.slice();
      } else if (d.type === "snapshot") {
        if (d.values && typeof d.values === "object") this._values = { ...d.values };
        if (Array.isArray(d.schema)) this._schema = d.schema.slice();
        if (this._onReady) this._onReady();
      } else if (d.type === "store-result" && d.requestId != null) {
        const pending = this._storePending.get(d.requestId);
        if (pending) {
          this._storePending.delete(d.requestId);
          if (d.ok) pending.resolve(d.data != null ? d.data : {});
          else pending.reject(new Error(d.error || "store failed"));
        }
      } else if (d.type === "api-key-result" && d.requestId != null) {
        const pending = this._storePending.get(d.requestId);
        if (pending) {
          this._storePending.delete(d.requestId);
          if (d.ok) pending.resolve(d.key != null ? String(d.key) : "");
          else pending.reject(new Error(d.error || "api key unavailable"));
        }
      }
    }

    _apiKeyCall() {
      return new Promise((resolve, reject) => {
        const requestId = ++this._storeReq;
        this._storePending.set(requestId, { resolve, reject });
        this._post({ type: "api-key-read", requestId });
      });
    }

    /** xAI API key from advBuilder Electron secrets (empty string if unset). */
    getApiKey() {
      return this._apiKeyCall();
    }

    _storeCall(type, filename, patch) {
      return new Promise((resolve, reject) => {
        const requestId = ++this._storeReq;
        this._storePending.set(requestId, { resolve, reject });
        const msg = { type, requestId, file: filename };
        if (patch != null) msg.patch = patch;
        this._post(msg);
      });
    }

    /** @param {string} filename e.g. "xaiChat.memory.json" */
    readDriverStore(filename) {
      if (typeof filename !== "string" || !filename) {
        return Promise.reject(new Error("Invalid filename"));
      }
      return this._storeCall("store-read", filename);
    }

    /**
     * @param {string} filename
     * @param {object} patch shallow merge on host
     */
    writeDriverStore(filename, patch) {
      if (typeof filename !== "string" || !filename) {
        return Promise.reject(new Error("Invalid filename"));
      }
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
        return Promise.reject(new Error("Invalid patch"));
      }
      return this._storeCall("store-write", filename, patch);
    }

    /** @param {object} patch bare { name: value } */
    send(patch) {
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) return;
      this._post({ type: "send", values: patch });
    }

    /** @param {string} name PARAM-BUTTON name */
    sendButton(name) {
      if (typeof name !== "string" || !name) return;
      this._post({ type: "button", name });
    }

    /** Full coerced value map. */
    getValues() {
      return { ...this._values };
    }

    /** Schema rows with type, ranges, description, default, value. */
    getSchema() {
      const byName = new Map(this._schema.map((r) => [r.name, { ...r }]));
      for (const row of byName.values()) {
        if (Object.prototype.hasOwnProperty.call(this._values, row.name)) {
          row.value = this._values[row.name];
        }
      }
      return [...byName.values()];
    }

    destroy() {
      window.removeEventListener("message", this._bound);
      this._onMessage = null;
    }
  }

  g.ParamMessenger = ParamMessenger;
})(typeof window !== "undefined" ? window : globalThis);
