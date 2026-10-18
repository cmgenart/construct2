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

  let promptDlg = null;
  let promptTitleEl = null;
  let promptMessageEl = null;
  let promptDetailEl = null;
  let promptInputEl = null;
  let promptOkBtn = null;
  let promptCancelBtn = null;
  let promptResolve = null;

  function ensurePrompt() {
    if (promptDlg) return promptDlg;
    promptDlg = document.getElementById("dlg-prompt");
    if (!promptDlg) return null;
    promptTitleEl = promptDlg.querySelector("#dlg-prompt-title");
    promptMessageEl = promptDlg.querySelector("#dlg-prompt-message");
    promptDetailEl = promptDlg.querySelector("#dlg-prompt-detail");
    promptInputEl = promptDlg.querySelector("#dlg-prompt-input");
    promptOkBtn = promptDlg.querySelector("#dlg-prompt-ok");
    promptCancelBtn = promptDlg.querySelector("#dlg-prompt-cancel");

    promptCancelBtn?.addEventListener("click", () => {
      promptDlg.close("cancel");
    });
    promptOkBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      const value = String(promptInputEl?.value || "").trim();
      if (!value) {
        promptInputEl?.focus();
        return;
      }
      promptDlg.close("ok");
    });
    promptInputEl?.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      promptOkBtn?.click();
    });
    promptDlg.addEventListener("close", () => {
      const confirmed = promptDlg.returnValue === "ok";
      const value = String(promptInputEl?.value || "").trim();
      const resolve = promptResolve;
      promptResolve = null;
      resolve?.({ ok: true, confirmed: confirmed && !!value, value });
    });
    promptDlg.addEventListener("cancel", (e) => {
      e.preventDefault();
      promptDlg.close("cancel");
    });
    return promptDlg;
  }

  /**
   * @param {object} opts
   * @param {string} [opts.title]
   * @param {string} opts.message
   * @param {string} [opts.detail]
   * @param {string} [opts.value]
   * @param {string} [opts.okLabel]
   * @param {string} [opts.cancelLabel]
   * @returns {Promise<{ ok: boolean, confirmed: boolean, value: string }>}
   */
  function showAppPrompt(opts = {}) {
    const el = ensurePrompt();
    const initial = opts.value != null ? String(opts.value) : "";
    if (!el) {
      const value = global.prompt(String(opts.message || ""), initial);
      const trimmed = value == null ? "" : String(value).trim();
      return Promise.resolve({ ok: true, confirmed: value != null && !!trimmed, value: trimmed });
    }
    if (promptTitleEl) promptTitleEl.textContent = opts.title || "Rename";
    if (promptMessageEl) promptMessageEl.textContent = opts.message || "";
    if (promptDetailEl) {
      const detail = opts.detail != null ? String(opts.detail) : "";
      promptDetailEl.textContent = detail;
      promptDetailEl.hidden = !detail;
    }
    if (promptInputEl) promptInputEl.value = initial;
    if (promptOkBtn) promptOkBtn.textContent = opts.okLabel || "OK";
    if (promptCancelBtn) promptCancelBtn.textContent = opts.cancelLabel || "Cancel";
    return new Promise((resolve) => {
      promptResolve = resolve;
      el.returnValue = "cancel";
      el.showModal();
      promptInputEl?.focus();
      promptInputEl?.select();
    });
  }

  global.showAppPrompt = showAppPrompt;
})(typeof window !== "undefined" ? window : globalThis);
