(function () {
  const api = window.advBuilder;
  const dlg = document.getElementById("dlg-about");
  const versionEl = document.getElementById("about-version");
  const closeBtn = document.getElementById("about-close");
  if (!dlg) return;

  const buttons = document.querySelectorAll("[data-open-about]");

  async function openAbout() {
    if (versionEl && api?.getAppInfo) {
      try {
        const info = await api.getAppInfo();
        const ver = info?.version || "?";
        versionEl.textContent =
          "Construct²  " +
          ver +
          (info?.isPackaged ? "" : "  (dev)");
      } catch {
        versionEl.textContent = "Construct²";
      }
    }
    if (typeof dlg.showModal === "function") {
      if (!dlg.open) dlg.showModal();
    } else {
      dlg.setAttribute("open", "");
    }
  }

  function closeAbout() {
    if (dlg.open) dlg.close();
    else dlg.removeAttribute("open");
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      openAbout().catch(() => {});
    });
  });
  closeBtn?.addEventListener("click", () => closeAbout());
  dlg.addEventListener("cancel", () => closeAbout());

  api?.onShowAbout?.(() => {
    openAbout().catch(() => {});
  });
})();
