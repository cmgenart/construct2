/**
 * In-app confirm dialog (HTML <dialog>) — avoids native confirm() focus bugs on Windows.
 */
(function (global) {
  let dlg = null;
  let titleEl = null;
  let messageEl = null;
  let detailEl = null;
  let okBtn = null;
  let cancelBtn = null;
  let resolvePending = null;

  function ensureDialog() {
    if (dlg) return dlg;
    dlg = document.getElementById("dlg-confirm");
    if (!dlg) return null;
    titleEl = dlg.querySelector("#dlg-confirm-title");
    messageEl = dlg.querySelector("#dlg-confirm-message");
    detailEl = dlg.querySelector("#dlg-confirm-detail");
    okBtn = dlg.querySelector("#dlg-confirm-ok");
    cancelBtn = dlg.querySelector("#dlg-confirm-cancel");

    cancelBtn?.addEventListener("click", () => {
      dlg.close("cancel");
    });
    okBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      dlg.close("ok");
    });
    dlg.addEventListener("close", () => {
      const confirmed = dlg.returnValue === "ok";
      const resolve = resolvePending;
      resolvePending = null;
      resolve?.({ ok: true, confirmed });
    });
    dlg.addEventListener("cancel", (e) => {
      e.preventDefault();
      dlg.close("cancel");
    });
    return dlg;
  }

  /**
   * @param {object} opts
   * @param {string} [opts.title]
   * @param {string} opts.message
   * @param {string} [opts.detail]
   * @param {string} [opts.okLabel]
   * @param {string} [opts.cancelLabel]
   * @param {boolean} [opts.danger]
   * @returns {Promise<{ ok: boolean, confirmed: boolean }>}
   */
  function showAppConfirm(opts = {}) {
    const el = ensureDialog();
    if (!el) {
      const ok = global.confirm(String(opts.message || "Are you sure?"));
      return Promise.resolve({ ok: true, confirmed: !!ok });
    }
    if (titleEl) titleEl.textContent = opts.title || "Confirm";
    if (messageEl) messageEl.textContent = opts.message || "";
    if (detailEl) {
      const detail = opts.detail != null ? String(opts.detail) : "";
      detailEl.textContent = detail;
      detailEl.hidden = !detail;
    }
    if (okBtn) {
      okBtn.textContent = opts.okLabel || "OK";
      okBtn.classList.toggle("danger", !!opts.danger);
    }
    if (cancelBtn) {
      cancelBtn.textContent = opts.cancelLabel || "Cancel";
    }
    return new Promise((resolve) => {
      resolvePending = resolve;
      el.returnValue = "cancel";
      el.showModal();
      okBtn?.focus();
    });
  }

  global.showAppConfirm = showAppConfirm;
})(typeof window !== "undefined" ? window : globalThis);
