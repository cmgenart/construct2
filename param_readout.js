/**
 * Minimal parameter output readout (dev-ui only).
 */
(function (g) {
  function escapeHtml(s) {
    if (s === null || s === undefined) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatChipValue(type, val) {
    if (val === null || val === undefined) return "\u2014";
    if (type === "PARAM-BOOLEAN") return val ? "1" : "0";
    if (typeof val === "object") {
      try { return JSON.stringify(val); } catch (_) { return "\u2026"; }
    }
    const s = String(val);
    return s.length > 12 ? s.slice(0, 11) + "\u2026" : s;
  }

  function chipTitle(p, val) {
    const parts = [p.name];
    if (p.description) parts.push(p.description);
    parts.push("= " + formatChipValue(p.type, val));
    return parts.join(" \u2014 ");
  }

  function barTitle(p, val, lo, hi) {
    const parts = [p.name, String(val)];
    if (p.description) parts.push(p.description);
    parts.push("[" + lo + " \u2026 " + hi + "]");
    return parts.join(" \u2014 ");
  }

  function renderParamReadout(container, schema, values) {
    if (!container) return;
    const vals = values && typeof values === "object" ? values : {};
    const barParts = [];
    const chipParts = [];
    const pc = g.advParamColor;

    for (const p of schema || []) {
      if (p.type === "PARAM-BUTTON") continue;
      const raw = Object.prototype.hasOwnProperty.call(vals, p.name)
        ? vals[p.name]
        : p.default;

      if (p.type === "PARAM-FLOAT" || p.type === "PARAM-INT") {
        const lo = Number(p.low);
        const hi = Number(p.high);
        const v = Number(raw);
        const n = Number.isFinite(v) ? v : lo;
        const pct =
          hi <= lo ? 0 : Math.max(0, Math.min(100, ((n - lo) / (hi - lo)) * 100));
        const tip = escapeHtml(barTitle(p, n, lo, hi));
        barParts.push(
          "<div class=\"param-readout-bar\" role=\"meter\" aria-valuemin=\"" +
            lo +
            "\" aria-valuemax=\"" +
            hi +
            "\" aria-valuenow=\"" +
            escapeHtml(String(n)) +
            "\" aria-label=\"" +
            tip +
            "\" title=\"" +
            tip +
            "\"><div class=\"param-readout-bar-fill\" style=\"height:" +
            pct.toFixed(1) +
            "%\"></div></div>"
        );
      } else if (p.type === "PARAM-VEC2") {
        const vx =
          Array.isArray(raw) && raw.length >= 2
            ? Number(raw[0])
            : raw && typeof raw === "object"
              ? Number(raw.x != null ? raw.x : raw[0])
              : Array.isArray(p.default)
                ? Number(p.default[0])
                : NaN;
        const vy =
          Array.isArray(raw) && raw.length >= 2
            ? Number(raw[1])
            : raw && typeof raw === "object"
              ? Number(raw.y != null ? raw.y : raw[1])
              : Array.isArray(p.default)
                ? Number(p.default[1])
                : NaN;
        const label =
          (Number.isFinite(vx) ? vx.toFixed(2) : "?") +
          ", " +
          (Number.isFinite(vy) ? vy.toFixed(2) : "?");
        chipParts.push(
          '<span class="param-readout-chip" title="' +
            escapeHtml(chipTitle(p, raw)) +
            '">' +
            escapeHtml(label) +
            "</span>"
        );
      } else if (
        p.type === "PARAM-RGB" ||
        p.type === "PARAM-HSV" ||
        p.type === "PARAM-HSL" ||
        p.type === "PARAM-HEX"
      ) {
        let bg = "#808080";
        let label = formatChipValue(p.type, raw);
        if (pc) {
          const css = pc.toCssColor(p.type, raw);
          if (css) bg = css;
          label = pc.formatReadout(p.type, raw) || label;
        }
        chipParts.push(
          '<span class="param-readout-chip param-readout-swatch" style="background:' +
            escapeHtml(bg) +
            '" title="' +
            escapeHtml(chipTitle(p, raw)) +
            '">' +
            escapeHtml(label) +
            "</span>"
        );
      } else {
        chipParts.push(
          '<span class="param-readout-chip" title="' +
            escapeHtml(chipTitle(p, raw)) +
            '">' +
            escapeHtml(formatChipValue(p.type, raw)) +
            "</span>"
        );
      }
    }

    let html = "";
    if (barParts.length) {
      html += "<div class=\"param-readout-bars\">" + barParts.join("") + "</div>";
    }
    if (chipParts.length) {
      html += "<div class=\"param-readout-chips\">" + chipParts.join("") + "</div>";
    }
    container.innerHTML =
      html || '<p class="param-readout-empty">No parameters</p>';
  }

  g.advParamReadout = { renderParamReadout };
})(typeof window !== "undefined" ? window : globalThis);
