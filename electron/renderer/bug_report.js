(function () {
  const api = window.advBuilder;
  if (!api || typeof api.openBugReport !== "function") return;

  const btn = document.getElementById("btn-bug-report");
  const dlg = document.getElementById("dlg-bug-report");
  const envEl = document.getElementById("bug-report-env");
  const descEl = document.getElementById("bug-report-description");
  const cancelBtn = document.getElementById("bug-report-cancel");
  const submitBtn = document.getElementById("bug-report-submit");
  const status = document.getElementById("status");
  if (!btn || !dlg || !envEl || !descEl) return;

  function setStatus(kind, text) {
    if (!status) return;
    status.className = kind ? `status ${kind}` : "status";
    status.textContent = text || "";
  }

  function formatEnv(info, ctx) {
    const lines = [
      `Version: ${info.version || "?"}`,
      `Packaged: ${info.isPackaged ? "yes" : "no"}`,
      `Profile: ${info.userDataProfile || "?"}`,
      `Builder host: ${info.builderHost || "?"}`,
      `OS: ${info.osType || "?"} ${info.osRelease || ""} (${info.platform || "?"} ${info.arch || "?"})`,
      `Electron: ${info.electronVersion || "?"}`,
    ];
    if (ctx && ctx.project) {
      lines.push(`Project: ${ctx.project.name} (${ctx.project.path})`);
    } else {
      lines.push("Project: (none selected)");
    }
    return lines.join("\n");
  }

  async function openDialog() {
    descEl.value = "";
    envEl.textContent = "Loading…";
    try {
      const [info, ctx] = await Promise.all([
        api.getAppInfo(),
        api.getBugReportContext(),
      ]);
      envEl.textContent = formatEnv(info || {}, ctx || {});
    } catch (e) {
      envEl.textContent = String(e.message || e);
    }
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");
    descEl.focus();
  }

  async function submit() {
    const description = String(descEl.value || "").trim();
    if (!description) {
      descEl.focus();
      return;
    }
    submitBtn.disabled = true;
    setStatus("", "Opening GitHub…");
    try {
      const r = await api.openBugReport({ description });
      if (!r || !r.ok) {
        setStatus("err", (r && r.error) || "Could not open GitHub");
        return;
      }
      dlg.close();
      setStatus("ok", "Opened a GitHub issue draft in your browser.");
    } catch (e) {
      setStatus("err", String(e.message || e));
    } finally {
      submitBtn.disabled = false;
    }
  }

  btn.addEventListener("click", () => {
    openDialog().catch((e) => setStatus("err", String(e.message || e)));
  });
  api?.onShowBugReport?.(() => {
    openDialog().catch((e) => setStatus("err", String(e.message || e)));
  });
  cancelBtn?.addEventListener("click", () => dlg.close());
  submitBtn?.addEventListener("click", () => {
    submit().catch((e) => setStatus("err", String(e.message || e)));
  });
})();
