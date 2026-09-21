# Visualiser modes (dev UI preview pane)

The right-hand preview column in `dev-ui.html` loads `/visualise?mode=…` from `builder.js` in `#vis` inside `#vis-area`. Modes are selected with the **tab-style radio strip** `#visselect` in `#vis-toolbar` (folder tabs above the preview).

## Preview chrome (`#vis-toolbar`)

Slim bar above `#vis-area`:

| Region | Element | Role |
|--------|---------|------|
| Left | `#visselect` | **Full \| Min \| UTF8 \| Metadata \| Analysis** — tab-style labels; active tab merges visually with the preview |
| After tabs | `#metasize` | Cardano metadata size label (Metadata mode) |
| Before theme | `.vis-view-controls` | Pan/zoom toggle, reset view, fullscreen; RMB peek zoom — [VIEW-NAVIGATION-CONTROLS.md](./VIEW-NAVIGATION-CONTROLS.md); Full/Min only |
| Right | `#theme-toggle` | Day/night theme (`advBuilder:theme` + `localStorage` in embed) |

`#vis-area` also hosts `#offline-badge`, `#collection-preview-banner`, `#overlay`, and `#section-help-overlay` (stacked over `#vis`).

## Modes

| Mode | URL | Content |
|------|-----|---------|
| **Full** | `?mode=full` | Live `lastBuild.output` HTML (full artwork, not minified) |
| **Min** | `?mode=min` | `lastBuild.output_min` (Terser-minified artwork) |
| **UTF8** | `?mode=utf8` | Tabbed shell: raw `utf8link` + **Run** (sandboxed iframe) |
| **Metadata** | `?mode=metadata` | Tabbed shell: raw JSON + **Preview** (pool.pm-style layout) |
| **Analysis** | `?mode=analysis` | Property distribution tester (no artwork iframe) |

Full and Min require a successful build (`state.lastBuild`). UTF8 and Metadata require a build with `utf8link` / `metadata`. **Analysis** uses current source files only and does not need a full build.

## Shell viewers (UTF8, Metadata, Analysis)

Implemented in [`visualise_views.js`](../visualise_views.js), which inlines client scripts at serve time. Scrollable shell regions use the shared `.thin-scroll` pattern (auto-hide 6px scrollbars).

| Script | Role |
|--------|------|
| [`visualise_tabs.js`](../visualise_tabs.js) | Tab switching, `?tab=` URL param, lazy iframe mount when panel visible |
| [`visualise_metadata_client.js`](../visualise_metadata_client.js) | Metadata preview DOM, blob URL for nested artwork iframe |
| [`visualise_param_bridge.js`](../visualise_param_bridge.js) | Forwards dev-ui `postMessage` params to nested artwork iframes |
| [`visualise_analysis_client.js`](../visualise_analysis_client.js) | Analysis UI: run, filters, results, expert node graph |

### UTF8 mode

- **Raw link** — full `data:text/html;utf8,…` string from `lastBuild.utf8link`.
- **Run** — loads the link in a sandboxed iframe. `data:` URIs are converted to a **blob URL** for reliable loading. Mount is deferred until the Run tab is visible (avoids blank iframe when parent was `display:none`).

See [UTF8LINK-METADATA.md](./UTF8LINK-METADATA.md) for how `utf8link` is produced.

### Metadata mode

- **Raw** — pretty-printed JSON for the selected metadata file (`lastBuild.metadata` / `metadata_outputs`).
- **Preview** — local layout mimicking pool.pm metadata test (policy, badges, title, artwork iframe, traits).
- **File** — dropdown when `CreateMetadata` returns multiple outputs (e.g. `metadata.json` + `metadata.readable.json`); switches Raw, Preview, and pool.pm link.
- **Cardano split** (toolbar checkbox, default on) — toggles `settings.cardanoMetadataSplit` in `dev.json`, rebuilds, and applies or skips [`cardano_metadata_split.js`](../cardano_metadata_split.js) post-processing. See [METADATA-BUILDER.md](./METADATA-BUILDER.md).
- **pool.pm** button (red) — opens `lastBuild.pool_pm_link` in the system browser via `advBuilder:open-external` (Electron uses a temp HTML redirect for very long URLs on Windows).
- If `metadata.js` is missing — setup card and **Create default builder** (`POST /metadata/create-default`).

Nested preview iframe receives live parameters through the param bridge (same as UTF8 Run).

### Analysis mode

Documented in [PROPERTY-ANALYSIS.md](./PROPERTY-ANALYSIS.md). Summary: Monte-Carlo property sampling, responsive **CSS Grid** card layout (`repeat(auto-fill, minmax(260px, 1fr))`), persisted UI prefs in `dev.json`.

## Tab memory

`dev-ui.html` keeps `visTabMemory` per shell mode (`utf8`, `metadata`). Switching modes restores `?tab=raw|preview|run` on the iframe URL. Child viewers notify the parent with:

```js
{ type: "advBuilder:vis-tab", mode: "utf8", tab: "run" }
```

## Parameter forwarding

| Direction | Full / Min | UTF8 Run / Metadata Preview |
|-----------|------------|-------------------------------|
| **Host → art** | dev-ui `postMessage` → `#vis` | dev-ui → visualiser shell → [`visualise_param_bridge.js`](../visualise_param_bridge.js) → nested iframe |
| **Art → host** | `SendParams` → `WINDOW.parent` → dev-ui | nested iframe `SendParams` → bridge → dev-ui |

Art must use **`WINDOW.parent.postMessage`** in canvas core (not `WINDOW.postMessage` on self). See [PARAM-SPEC.md](./PARAM-SPEC.md) §8.1.

Analysis mode does not use the param bridge (no artwork iframe).

## Lazy mount pattern

Nested iframes must not load while their tab panel is hidden. `visualise_tabs.js` calls `__utf8LoadRunFrame` / `__metaMountVizFrame` on tab activation with a double `requestAnimationFrame` defer. Each mount sets `dataset.mounted = "1"` to avoid duplicate loads.

## Viewport background (dev preview only)

Compact controls in `#seed-zoom-row` on the left (**BG:** checkbox + fill/alternate colour swatches in `.viewport-bg-control`, between `.seed-control` and `.zoom-control`) let you preview art over a solid or checker background. Settings live in `dev.json` → `settings` only; they are **not** baked into builds, `utf8link`, or metadata.

| Checkbox | Background |
|----------|------------|
| On (default) | Solid fill from the **fill** swatch (default black) |
| Off | 20px checker: **fill** swatch = cell 1 / `backgroundColor`; **alternate** swatch = second cell (hidden while checkbox is on) |

**Modes:** Full and Min only. Dev-ui paints `#right` and `postMessage`s `advBuilder:viewportBg` into `#vis`. `builder.js` injects [`viewport_bg_client.js`](../viewport_bg_client.js) at **serve time** via [`viewport_bg_patch.js`](../viewport_bg_patch.js) (not into persisted `lastBuild` HTML). UTF8, Metadata, and Analysis clear host chrome and do not inject the client (shell `<script>` safety — see [VIEWPORT-BACKGROUND.md](./VIEWPORT-BACKGROUND.md)).

**Layering inside Full/Min iframe:** viewport host → `#adv-viewport-wall` (`CanvasWall` / `body.bgColor` hook) → canvas.

Full reference: [VIEWPORT-BACKGROUND.md](./VIEWPORT-BACKGROUND.md) (API, modules, `CanvasWall` authoring, build isolation).

| Route | Purpose |
|-------|---------|
| `GET /viewport_bg.js` | Host-page helpers (`window.advViewportBg`) |
| `POST /viewport/settings` | Persist `{ solid?, solidColor?, checkerAltColor? }` |

## View navigation (dev preview only)

**Implemented (F1.11).** Toolbar controls in `.vis-view-controls` (left of `#theme-toggle`) pan and zoom the preview iframe via a host-side CSS transform on `#vis-transform-root`. An invisible `#vis-nav-overlay` (class `nav-capture` when active) intercepts drag and wheel when pan/zoom mode is on (or while Control is held). Wheel zoom is **cursor-anchored** — the point under the mouse stays fixed while scaling. Fullscreen expands `#right` and hides the left column.

**RMB peek zoom (F1.11b).** Hold **right mouse button** for a smooth ~2× zoom at the pointer on the unzoomed canvas; **drag while held** to reposition the peek focal point; wheel adjusts scale during hold; release returns to default view and clears nav pan/zoom. Implemented via serve-time [`view_nav_client.js`](../view_nav_client.js) injection — see [VIEW-NAVIGATION-CONTROLS.md](./VIEW-NAVIGATION-CONTROLS.md) §4.5.

**Modes:** Full and Min only — same gating as viewport background. Distinct from `.zoom-control` (left-panel UI zoom) and canvas core `Frame()` (art fit inside iframe).

Full reference: [VIEW-NAVIGATION-CONTROLS.md](./VIEW-NAVIGATION-CONTROLS.md).

## Related HTTP routes

| Route | Purpose |
|-------|---------|
| `GET /visualise?mode=…` | Serves mode HTML |
| `GET /state` | Full dev state (includes `lastBuild`, `lastAnalysis`) |
| `GET/POST /params` | External parameter schema and values |

WebSocket `update` refreshes the visualiser after rebuilds; Analysis mode is not reloaded on every build if it stays selected (see `dev-ui.html` `connectWebSocket`).

## Rebuild overlay

`#vis-area` has a semi-transparent cover (`#overlay` in `dev-ui.html`, over `#vis`) during builds:

| Context | Overlay text |
|---------|----------------|
| Solo rebuild (props, seed, group Random, global Random) | `Building...` |
| Collection batch (per piece) | `Building: '0001 Piece Name' (3 of 10)` — from WS `collectionBuildProgress` |
| Parameter analysis | `Running parameter analysis (N samples)…` |

- `showRebuilding(message)` / `hideRebuilding()` are exported on `window` for `collection_ui.js`.
- Text uses ASCII `...` (not Unicode ellipsis) to avoid garbled characters in some fonts.
- The piece-list `#piece-build-progress` bar is **not** used for batch detail (overlay only).
