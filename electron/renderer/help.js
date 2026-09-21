(function () {
  const api = window.advBuilder;
  const viewer = window.advDocViewer;
  if (!viewer || typeof viewer.initDocViewer !== "function") return;

  if (api && typeof api.readHelpDoc === "function") {
    viewer.setDocLoader(async (rel) => {
      const r = await api.readHelpDoc(rel);
      if (!r || !r.ok) throw new Error((r && r.error) || "Not found");
      return r.text;
    });
  }

  viewer.initDocViewer();

  function openHelp(rel) {
    const target = rel || "docs/user/README.md";
    const href = target.startsWith("docs/")
      ? "/docs/" + target.slice("docs/".length)
      : "/" + target;
    viewer.openDoc(href, { title: "", pushHistory: false });
  }

  document.querySelectorAll("[data-open-help]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dlg = btn.closest("dialog");
      if (dlg && dlg.open) dlg.close();
      openHelp(btn.getAttribute("data-help-rel") || "docs/user/README.md");
    });
  });

  api?.onShowHelp?.((rel) => {
    openHelp(rel);
  });
})();
