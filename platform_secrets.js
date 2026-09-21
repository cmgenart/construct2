/**
 * Electron embed bridge for advBuilder secrets (dev-ui ↔ shell ↔ main).
 */
(function (g) {
  const pending = new Map();
  let reqId = 0;
  let platformElectron = null;
  let probeDone = false;

  function isEmbedded() {
    try {
      return (
        window.parent !== window &&
        new URLSearchParams(window.location.search).get("embed") === "1"
      );
    } catch (_) {
      return false;
    }
  }

  function waitForResult(id, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("platform bridge timeout"));
      }, ms);
      pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
    });
  }

  window.addEventListener("message", (ev) => {
    if (ev.source !== window.parent) return;
    const d = ev.data;
    if (!d || !d.type) return;

    if (d.type === "advBuilder:platform-info" && d.id != null) {
      const p = pending.get(d.id);
      if (p) {
        pending.delete(d.id);
        platformElectron = !!d.isElectron;
        probeDone = true;
        p.resolve(!!d.isElectron);
      }
      return;
    }

    if (d.type === "advBuilder:secret-result" && d.id != null) {
      const p = pending.get(d.id);
      if (!p) return;
      pending.delete(d.id);
      if (d.ok) p.resolve(d.value != null ? d.value : null);
      else p.reject(new Error(d.error || "secret operation failed"));
    }
  });

  async function probePlatform() {
    if (!isEmbedded()) {
      platformElectron = false;
      probeDone = true;
      return false;
    }
    if (probeDone) return !!platformElectron;
    const id = ++reqId;
    const resultPromise = waitForResult(id, 4000);
    try {
      window.parent.postMessage({ type: "advBuilder:platform-probe", id }, "*");
    } catch (_) {
      platformElectron = false;
      probeDone = true;
      return false;
    }
    try {
      return await resultPromise;
    } catch (_) {
      platformElectron = false;
      probeDone = true;
      return false;
    }
  }

  async function ensureElectron() {
    await probePlatform();
    return !!platformElectron;
  }

  async function loadSecret(name) {
    if (!(await ensureElectron())) return null;
    const id = ++reqId;
    const resultPromise = waitForResult(id, 10000);
    window.parent.postMessage({ type: "advBuilder:loadSecret", id, name }, "*");
    return resultPromise;
  }

  async function storeSecret(name, value) {
    if (!(await ensureElectron())) {
      throw new Error("Secrets require Construct² Electron app");
    }
    const id = ++reqId;
    const resultPromise = waitForResult(id, 10000);
    window.parent.postMessage(
      { type: "advBuilder:storeSecret", id, name, value: value != null ? value : null },
      "*",
    );
    await resultPromise;
  }

  async function getApiKeyStatus() {
    const key = await loadSecret("xai-api-key");
    return { hasKey: !!(key && String(key).trim()), label: key ? "xAI key set" : "No xAI key" };
  }

  g.advPlatformSecrets = {
    isEmbedded,
    probePlatform,
    isElectron: () => platformElectron,
    loadSecret,
    storeSecret,
    getApiKeyStatus,
  };
})(typeof window !== "undefined" ? window : globalThis);
