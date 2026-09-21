/**
 * Tab UI for UTF8 / Metadata viewer shells: URL ?tab=, parent state sync, lazy mounts.
 */
(function () {
  var params = new URLSearchParams(window.location.search);
  var visMode = params.get("mode") || "";

  function notifyParentTab(tab) {
    if (!visMode) return;
    try {
      window.parent.postMessage(
        { type: "advBuilder:vis-tab", mode: visMode, tab: tab },
        window.location.origin,
      );
    } catch (_) {}
  }

  /** Wait until the tab panel is visible before loading nested iframes. */
  function deferArtMount(fn) {
    if (typeof fn !== "function") return;
    requestAnimationFrame(function () {
      requestAnimationFrame(fn);
    });
  }

  function onTabActivated(id) {
    if (id === "preview") {
      deferArtMount(window.__metaMountVizFrame);
    }
    if (id === "run") {
      deferArtMount(window.__utf8LoadRunFrame);
    }
  }

  function activateTab(id) {
    var tabs = document.querySelectorAll(".tab[data-tab]");
    var panels = document.querySelectorAll(".panel[data-panel]");
    tabs.forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-tab") === id);
    });
    panels.forEach(function (p) {
      p.classList.toggle("active", p.getAttribute("data-panel") === id);
    });
    onTabActivated(id);
  }

  document.querySelectorAll(".tab[data-tab]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-tab");
      activateTab(id);
      notifyParentTab(id);
    });
  });

  var initial = params.get("tab");
  var valid = false;
  document.querySelectorAll(".tab[data-tab]").forEach(function (b) {
    if (b.getAttribute("data-tab") === initial) valid = true;
  });
  activateTab(valid ? initial : "raw");
})();
