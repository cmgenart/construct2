# Viewport background (dev preview only)

Dev-only control for how the **preview pane** looks behind generative art — solid colour or a checker pattern. Use it to test transparency, `CanvasWall`, and how pieces read when embedded over arbitrary HTML backgrounds.

**Scope:** Full and Min visualiser modes only. Settings persist in `dev.json` and are **never** written into built art HTML, `utf8link`, metadata exports, or on-chain payloads.

See also [VISUALISER.md](./VISUALISER.md) for preview modes and param forwarding.

---

## UI (dev-ui `#seed-zoom-row`)

Controls sit in `#seed-zoom-row` after `.seed-control` (seed button + number input) and before `#runtime-select` / `.zoom-control`:

| Region | Element | Role |
|--------|---------|------|
| Left | `.seed-control` | **seed** button (`newSeed()`) + `#seedInput` |
| Middle | `#viewport-bg-*` | **BG:** checkbox + solid/checker swatches (this section) |
| After BG | `#runtime-select` | Canvas runtime dropdown |
| Right | `.zoom-control` | **−** / **100%** / **+** — left-panel UI zoom (`.zoom-control-btn`, `#props-zoom-pct`) |

| Control | ID | Behaviour |
|---------|-----|-----------|
| **BG:** checkbox | `#viewport-bg-solid` | **On** (default) → solid fill from the fill swatch. **Off** → 20px checker using fill + alternate swatches. |
| Fill swatch | `#viewport-bg-solid-swatch` | Background fill colour — used in solid mode and as checker cell 1 / background when checkbox is off. Opens HSVA picker. |
| Alternate swatch | `#viewport-bg-checker-alt-swatch` | Second checker cell colour when checkbox is off. Hidden in solid mode. Opens HSVA picker. |

Swatches sit in a single `.viewport-bg-control` group (same chrome as seed/zoom). Picker title/description state **Preview only — not art build**. Header **Cancel** reverts; **×** accepts (see [PARAM-COLOR-IMPL.md](./PARAM-COLOR-IMPL.md)).

On change, dev-ui:

1. Updates in-memory `state.settings` and `POST /viewport/settings`.
2. Paints `#right` (preview chrome) via [`viewport_bg.js`](../viewport_bg.js) `buildViewportBgStyle`.
3. `postMessage`s `buildViewportBgMessage` into the Full/Min iframe (`#vis`).

Switching to UTF8, Metadata, or Analysis clears viewport styling from `#right` (`clearViewportBgFromPreview`).

---

## Settings (`dev.json` → `settings`)

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `viewportBgSolid` | boolean | `true` | Solid vs checker mode |
| `viewportBgSolidColor` | HSVA `{ h, s, v, a }` | black `{ h:0, s:0, v:0, a:1 }` | Background fill — solid mode and checker cell 1 / `backgroundColor` |
| `viewportBgCheckerAltColor` | HSVA | `{ h:0, s:0, v:0.54, a:1 }` | Checker alternate cell when checkbox is off |

**Migration:** legacy `settings.viewportBgColor` or `viewportBgCheckerColor` / `viewportBgCheckerFillColor` map through `resolveViewportBgSettings` on load, then obsolete keys are deleted.

**Build isolation:** `patchViewportBgClient` runs at **serve time** when `builder.js` serves Full/Min HTML (`patchVisualiseHtml`). Persisted `lastBuild.output` / `output_min` blobs are unchanged; the patch is appended before `</body>` only in the HTTP response.

---

## Preview layering (Full / Min)

Inside the artwork iframe, [`viewport_bg_client.js`](../viewport_bg_client.js) (injected by [`viewport_bg_patch.js`](../viewport_bg_patch.js)) builds a fixed full-window stack:

```
z-index 0  #adv-viewport-host-bg   ← dev viewport (solid or checker)
z-index 1  #adv-viewport-wall      ← CanvasWall / body.bgColor
z-index 2  <canvas>                ← art pixels on top
```

- **Opaque canvas** → art.
- **Transparent canvas** → wall layer.
- **Transparent or alpha wall** → viewport host shows through.

`CanvasWall` in project `core.html` is unchanged, e.g. `(col) => (DOCUMENT.body.bgColor = col)`. The client hooks `document.body.bgColor` so assignments paint `#adv-viewport-wall` instead of the document background. `body` itself stays transparent so the host layer remains visible.

### Art authoring pattern (transparent canvas)

Clear the canvas each frame, then set the wall when using see-through:

```javascript
ctx.clearRect(0, 0, PX, PY);
CanvasWall(cM(0, 1 - b));  // b = params.seethru
```

Optional micro-optimisation: call `CanvasWall` only when `b` changes.

---

## HTTP API

| Route | Method | Body | Response |
|-------|--------|------|----------|
| `/viewport/settings` | `POST` | `{ solid?, solidColor?, checkerAltColor? }` (HSVA objects) | `{ ok, solid, solidColor, checkerAltColor }` |
| `/viewport_bg.js` | `GET` | — | Browser bundle of `viewport_bg.js` (wrapped for `window.advViewportBg`) |

Dev-ui loads `/viewport_bg.js` in the host page; the artwork iframe receives settings via `postMessage`, not a separate script fetch.

### `postMessage` payload

```js
{
  type: "advBuilder:viewportBg",
  solid: true,
  solidColor: { h: 0, s: 0, v: 0, a: 1 },
  checkerAltColor: { h: 0, s: 0, v: 0.54, a: 1 }
}
```

Listener: `window.addEventListener("message", …)` in `viewport_bg_client.js`. Test hook: `window.__advApplyViewportBg(msg)`.

---

## Module map

| File | Role |
|------|------|
| [`viewport_bg.js`](../viewport_bg.js) | Shared logic: defaults, migration, HSVA→CSS, checker pattern, `buildViewportBgStyle`, `buildViewportBgMessage` |
| [`viewport_bg_client.js`](../viewport_bg_client.js) | Injected into Full/Min preview HTML only: DOM stack, `body.bgColor` hook, message handler |
| [`viewport_bg_patch.js`](../viewport_bg_patch.js) | `patchViewportBgClient(html)` at serve time; `patchViewportBgInLink` helper (not used for UTF8/Metadata shells) |
| [`viewport_bg.test.js`](../viewport_bg.test.js) | Unit tests — run `node viewport_bg.test.js` |
| [`dev-ui.html`](../dev-ui.html) | Seed-row UI, `applyViewportBgToPreview`, `initViewportBgControls` |
| [`builder.js`](../builder.js) | `saveViewportUiSettings`, `loadDevJson` defaults, `patchVisualiseHtml`, routes above |
| [`color_picker.js`](../color_picker.js) | `openSettingsColor` for non-parameter colour sessions |

---

## UTF8, Metadata, Analysis

These shell viewers **do not** use viewport background:

- No injection in [`visualise_views.js`](../visualise_views.js) shells.
- Dev-ui does not apply BG when `mode` is `utf8`, `metadata`, or `analysis`.
- Nested Run/Preview iframes use the param bridge only ([`visualise_param_bridge.js`](../visualise_param_bridge.js)).

**Why:** Inlining scripts that contain the literal substring `</script>` inside generated HTML breaks the parent `<script>` block. Shell viewers therefore avoid embedding `viewport_bg_client.js`. Full/Min patch at serve time avoids that issue.

---

## What this does *not* affect

| Artifact | Viewport BG |
|----------|-------------|
| `output.output.html` / `output.output_min.html` on disk | Unchanged |
| `lastBuild.output` in `dev.json` | Unchanged |
| `utf8link` / metadata JSON | Unchanged |
| `CanvasWall` / `core.html` source | Unchanged |
| Parameter schema or `paramValues` | Unchanged |

Exported or pool.pm previews reflect real deployment backgrounds unless you test in Full/Min dev preview.
