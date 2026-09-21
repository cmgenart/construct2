# UI colour review — control inventory, consolidation, and palette schema

**Status:** Living design doc for Construct² UI theming. **Test page:** [`../ui-colour-review.html`](../ui-colour-review.html) (open in browser; no server required).

**Related:** [PARAM-COLOR-PLAN.md](./PARAM-COLOR-PLAN.md), [PROJECTS-STARTUP-DESIGN.md](./PROJECTS-STARTUP-DESIGN.md), [VISUALISER.md](./VISUALISER.md).

---

## 1. Purpose

Construct² UI is spread across monolithic HTML surfaces with **CSS custom properties** for light/dark themes, but tokens are **duplicated and divergent** between shells. Some controls still use **hardcoded hex** values.

This document:

1. Catalogues **every control type** used across the platform.
2. Maps **duplicate implementations** to proposed shared generic elements.
3. Defines a **3-tier colour palette schema** for consistent theming.

The companion test page renders all themed controls in light and dark side-by-side so palette changes can be developed in one place before migrating production files.

### Variant themes on the test page

In addition to the **Light** and **Dark** baselines (copied from current `dev-ui.html`), the test page includes three experimental palettes for comparison:

| Theme | Intent | Notes |
|-------|--------|-------|
| **Light+** | Improved light | Higher text/background contrast, clearer panel vs surface separation, `#2563eb` focus ring |
| **Dark+** | Improved dark | Elevated surface stack (`#13151a` → `#2a2f38`), softer mint accent, reduced glow fatigue |
| **Nord** | Researched third scheme | [Nord](https://www.nordtheme.com/) arctic palette — sixteen dimmed pastels designed for flat UI and readability (`nord0`–`nord15`) |
| **Light+S** / **Dark+S** | Depth variants | Light+/Dark+ with deepened surfaces, gradient panel fill, and layered box shadows |
| **Nord 1–10** | Hue-shift variants | Full wheel from base Nord; numbered **1–10**; warning and danger tokens unchanged; depth shadows like +S themes |
| **Nord swatches** | Header controls | Rounded `--bg` preview buttons (base Nord + shifts **1–10**) replace numeric labels |

Use view modes: **Nord all** (11-column Nord compare), individual swatches in the header pill, or **All** (full grid).

**Out of scope for initial palette work (listed in §3G):** visualiser iframes, legacy runtime shells, Iro.js vendor internals.

---

## 2. Theme contract

| Mechanism | Value |
|-----------|-------|
| Attributes | `html[data-theme="light\|dark"][data-palette="default\|nord\|nord-N"].theme-depth` |
| Storage | `localStorage['advBuilder.theme']` + `localStorage['advBuilder.palette']` |
| Default | `theme=light`, `palette=default` → **Light+S** (see §8) |
| Toggle | Left-click: light ↔ dark on default palette; right-click: Nord swatch picker |
| Electron sync | iframe posts `advBuilder:theme` / listens for `advBuilder:themeChange` (both include `palette`) |

**Primary token sources:**

| Surface | File |
|---------|------|
| Shared palettes | [`ui/tokens-default.css`](../ui/tokens-default.css), [`ui/tokens-nord.css`](../ui/tokens-nord.css), [`ui/tokens-nord-variants.css`](../ui/tokens-nord-variants.css) |
| Depth shadows | [`ui/theme-depth.css`](../ui/theme-depth.css) |
| Theme logic | [`ui/theme.js`](../ui/theme.js) |
| advBuilder dev shell | [`dev-ui.html`](../dev-ui.html) — component CSS referencing `var(--*)` |
| Electron startup shell | [`electron/renderer/index.html`](../electron/renderer/index.html) — shell layout + shared token imports |
| Project tree | [`electron/renderer/project_tree.css`](../electron/renderer/project_tree.css) — tree-specific vars + fallbacks |

---

## 3. Platform control inventory

Checklist of control types across Construct². Source files in parentheses.

### 3A. Chrome and layout (dev-ui + Electron)

| Control | CSS / markup | Source |
|---------|--------------|--------|
| Preview vis toolbar | `#vis-toolbar`, `.vis-toolbar-spacer` | `dev-ui.html` |
| View nav controls | `.vis-view-controls`, `#vis-nav-mode`, `#vis-nav-reset`, `#vis-nav-fullscreen` | `dev-ui.html`, [`view_nav_controls.js`](../view_nav_controls.js) |
| View nav overlay / exit | `#vis-nav-overlay`, `#vis-nav-exit-fullscreen`, `#vis-transform-root` | `dev-ui.html`, [`view_nav_controls.js`](../view_nav_controls.js) |
| Preview stack | `#vis-area`, `#vis` iframe | `dev-ui.html` |
| Runtime `<select>` | `#runtime-select.runtime-select` (#seed-zoom-row) | `dev-ui.html` |
| Embed chrome — projects tab | `#btn-projects-embed.embed-chrome-tab` | `dev-ui.html` |
| Embed chrome — Close | `.embed-chrome-close` | `dev-ui.html` |
| xAI key status button | `#btn-xai-key` (+ `.loaded` / `.missing`) | `dev-ui.html` |
| Theme toggle switch | `.theme-toggle`, `.theme-toggle-knob` | `dev-ui.html` (#vis-toolbar + shell) |
| Column divider (dev panels) | `#divider` (default `--border`; hover/drag `--accent`) | `dev-ui.html` |
| Param driver/readout resizer | `.param-v-resize` | `dev-ui.html` |
| Electron split handle | `#split-handle` | `index.html` |
| Collapsible section header | `.dev-section-head` | `dev-ui.html` |
| Section toolbar (with inline controls) | `.section-toolbar`, `.param-section-toolbar` | `dev-ui.html` |
| Section help button | `.section-help-btn` | `dev-ui.html` |
| Thin scrollbar | `.thin-scroll` | `dev-ui.html`, `visualise_views.js` |
| Preview metadata size label | `#metasize` | `dev-ui.html` |
| Collection preview banner | `#collection-preview-banner` | `dev-ui.html` |
| Building overlay | `#overlay` | `dev-ui.html` |
| Offline badge | `#offline-badge` | `dev-ui.html` |

### 3B. Buttons (all variants)

| Control | CSS / markup | Source |
|---------|--------------|--------|
| Generic `<button>` base | `button { … }` | `dev-ui.html` |
| Muted / icon buttons | `--btn-muted-*`, circular help | `dev-ui.html` |
| Seed control button | `.seed-control-btn` | `dev-ui.html` |
| Zoom +/- buttons | `.zoom-control-btn` | `dev-ui.html` |
| Zoom percentage readout | `.zoom-control-pct` | `dev-ui.html` |
| Properties Random | `.props-toolbar-random` | `dev-ui.html` |
| Prop group Random | `.prop-group-random` | `dev-ui.html` |
| Piece list toolbar | `.piece-list-toolbar button` | `dev-ui.html` |
| Values add-row button | `.values-add-row button` | `dev-ui.html` |
| Auto sub-mode buttons | `.values-auto-sub-btn` | `dev-ui.html` |
| Auto action buttons | `.values-auto-reset`, `.values-auto-preview`, `.values-auto-generate`, `.values-auto-fill-empty` | `dev-ui.html` |
| Dialog actions | `.dialog-actions button`, `.primary`, `.danger` | `index.html` |
| Tree actions | `.tree-actions button` | `project_tree.css` |
| Choice toggle group | `.choice-container button`, `.param-choice-btn` | `dev-ui.html` |
| Active / locked states | `.active`, `.locked` | `dev-ui.html` |
| Level bar buttons | `.values-level-btn` | `dev-ui.html` (Values + Properties) |
| Preview mode tabs | `#visselect label` (radio tab strip) | `dev-ui.html` |
| Collection tabs | `.collection-tab`, `.collection-tab-add` | `dev-ui.html`, `collection_ui.js` |
| Collection from-viewer | `.collection-tab-from-viewer` (△/▽) | `dev-ui.html` |
| Project tree row buttons | `.project-tree-btn--folder`, `.project-tree-btn--project` | `project_tree.css` |
| Tree back column | `.project-tree-back-col` (gradient strip, no chevron) | `project_tree.css` |
| Details panel actions | Open / Explorer / Pin buttons | `project_details.js` |
| Source file list buttons | clickable file rows | `project_details.js` |
| Context menu items | `.collection-ctx-menu button` | `collection_ui.js` |
| Color picker toolbar | `.color-picker-toolbar button` | `color_picker.js` + `dev-ui.html` |
| Color picker header | `.color-picker-header-actions`, `.color-picker-cancel`, `.color-picker-close` (× = accept) | `color_picker.js` + `dev-ui.html` |
| Nudge buttons | `.nudge` (`<` / `>`) | `dev-ui.html` |
| Shuffle property name | `.prop-name` (button styled) | `dev-ui.html` |
| PARAM-BUTTON fire | `.param-btn-fire` | `dev-ui.html` |

### 3C. Form inputs

| Control | CSS / markup | Source |
|---------|--------------|--------|
| Text input | panel inputs, dialog inputs | `dev-ui.html`, `index.html` |
| Number input | seed, param values, analysis samples | `dev-ui.html`, `visualise_views.js` |
| `<select>` | runtime, param mode, param dropdown, dialog selects | `dev-ui.html`, `index.html` |
| Textarea | param JSON, values table, auto prompts, collection brief | `dev-ui.html`, `collection_ui.js` |
| Checkbox | viewport BG, use-column, param bool, auto-mode | `dev-ui.html` |
| Search input | `.project-tree-search input` | `project_tree.css` |
| Seed number + button combo | `.seed-control` | `dev-ui.html` |
| Disabled / readonly | `:disabled`, `.readonly-bg` contexts | `dev-ui.html` |
| Batch import candidate checkboxes | `#batch-candidate-list` | `index.html` |

### 3D. Parameter panel widgets

| Control | CSS / markup | Source |
|---------|--------------|--------|
| Custom range slider | `.param-range-wrap`, `.param-range-fill`, `.param-range-thumb` | `dev-ui.html` |
| PARAM-VEC2 pad | `.param-vec2-pad`, `.param-vec2-marker` | `dev-ui.html` |
| PARAM-VEC2 axis inputs | `.param-vec2-axis .param-num` | `dev-ui.html` |
| Colour swatch + readout | `.param-color-swatch`, `.param-color-readout` | `dev-ui.html` |
| Iro floating picker | `.color-picker-dialog` (+ backdrop) | `color_picker.js` |
| PARAM-JSON textarea | `.param-json` | `dev-ui.html` |
| Param readout bars | `.param-readout-bar`, `.param-readout-bar-fill` | `param_readout.js` |
| Param readout chips | `.param-readout-chip` | `param_readout.js` |
| Param errors banner | `.param-errors` | `dev-ui.html` |
| Param empty / adhoc rows | `.param-empty`, `.param-adhoc` | `dev-ui.html` |
| Param driver iframe host | `#param-driver-wrap` | `param_driver_host.js` |

### 3E. Data display

| Control | CSS / markup | Source |
|---------|--------------|--------|
| Values table | `.values-table` (use, key, value, grip) | `dev-ui.html` |
| Values auto table | `.values-auto-table` | `dev-ui.html` |
| Properties grouped rows | `.prop-group`, `.property`, `.property-row-inactive` | `dev-ui.html` |
| Piece list rows | built/unbuilt colour states | `dev-ui.html`, `collection_ui.js` |
| Collection status text | `#collection-status` | `collection_ui.js` |
| Definition lists | project details `<dl>` | `project_details.js` |
| Table headers | `--table-head` | `dev-ui.html` |
| Monospace raw panels | visualiser `<pre>` | `visualise_views.js` |
| Metadata cards / badges | `.meta-card`, `.badge` | `visualise_views.js` |
| Pin badges | `.project-tree-pin-corner` | `project_tree.css` |
| Drop-zone banners | tree drag-drop UI | `project_tree.css` |

### 3F. Overlays and feedback

| Control | CSS / markup | Source |
|---------|--------------|--------|
| Section help overlay | `#section-help-overlay` | `dev-ui.html` |
| Collection new modal | `#collection-new-modal-back` | `dev-ui.html` |
| Bulk create modal | `#piece-bulk-create-modal-back` | `dev-ui.html` |
| xAI key modal | `#xai-key-modal-back` | `dev-ui.html` |
| Auto help modal | `#auto-help-modal-back` | `dev-ui.html` |
| Auto preview modal | `#auto-preview-modal-back` | `dev-ui.html` |
| Peer help modal | collection peer help | `collection_ui.js` |
| Electron native `<dialog>` | New / Import / Batch / Confirm | `index.html`, `app_dialog.js` |
| Warning banners | `--warning-*`, `.values-auto-badge` | `dev-ui.html` |
| Success styling | `--success-*`, `.values-auto-fill-empty` | `dev-ui.html` |
| Danger hover | `--danger-hover-*` | `dev-ui.html` |
| Disabled styling | `--disabled-*` | `dev-ui.html` |
| Context menu popup | `.collection-ctx-menu` | `collection_ui.js` |

### 3G. Out of initial palette scope

| Area | Notes |
|------|-------|
| **Visualiser shells** | [`visualise_views.js`](../visualise_views.js) + [`ui/visualise-shell.css`](../ui/visualise-shell.css) — themed via shared tokens + `localStorage` theme boot. **Runtimes unchanged.** |
| **Iro.js vendor** | `vendor/iro.min.js` — wheel rendering not themed via CSS vars. |
| **Color picker chrome (partial)** | `.color-picker-dialog` — **themed** via shared tokens (Iro wheel internals still not CSS-themeable). |

### 3H. Test page coverage map

Cross-check: each row below maps a [`ui-colour-review.html`](../ui-colour-review.html) section to inventory groups above.

| Test page section | Inventory groups covered |
|-------------------|-------------------------|
| 1. Token swatch grid | All Tier 2 semantic tokens |
| 2. Typography and surfaces | 3A chrome backgrounds |
| 3. Buttons | 3B (default, primary, danger, muted, icon, toolbar, disabled) |
| 4. Choice groups | 3B choice + active/locked; 3E inactive row |
| 5. Level bar and tabs | 3B level bar + visselect tabs |
| 6. Inputs | 3C all input types + compact param row |
| 7. Range slider | 3D param range |
| 8. VEC2 pad and colour swatch | 3D vec2 + swatch |
| 9. Tables and lists | 3E values/property/piece/collection |
| 10. Section collapse | 3A section headers + prop groups |
| 11. Modals and menus | 3F modal panel mock + context menu |
| 12. Feedback | 3F banners, xAI states, offline badge, param error |
| 13. Scrollbars and dividers | 3A thin-scroll, divider (hover accent), resize handle |
| 14. Electron-only | 3B tree actions, 3C search, tree row mock, pin badge, back-column gradient |
| Chrome extras | 3A vis toolbar + theme toggle, embed chrome, seed/zoom row, 3D param readout bars/chips |

**Gaps (doc-only until Phase 2):** visualiser tab/card **colours** (3G — scrollbars shipped), Iro picker live widget (3G), param driver iframe (3D — host chrome only), building overlay (3A), collection preview banner (3A), color picker dialog chrome (3G), `#vis-toolbar` / `.seed-control` / `.zoom-control` samples on test page.

---

## 4. Consolidation map — shared generic elements

Proposed shared classes for a future `construct2/ui/` component layer. Production migration is a follow-up track.

| Pattern | Current locations | Proposed shared element | Notes |
|---------|-------------------|-------------------------|-------|
| Choice button group | `.choice-container button`, `.param-choice-btn`, property `.active`/`.locked` | `.ui-choice-group` + `.ui-choice-btn` (+ `--active`, `--locked`) | Same visual in Parameters and Properties |
| Level bar tabs | `.values-level-btn` (Values + Properties) | `.ui-level-btn` | Already shared — rename only |
| Section collapse header | `.dev-section-head`, `.section-toolbar`, `.collection-auto-section` | `.ui-section-head` | Single chevron + gradient tokens |
| Tab bar | `#visselect` radio labels, visualiser `.tab` | `.ui-tab` + `.ui-tab--active` | Visualiser is migration target |
| Primary / secondary / danger buttons | generic `button`, `.dialog-actions`, piece toolbar | `.ui-btn`, `--primary`, `--danger`, `--muted` | Unify padding/radius tiers |
| Icon / circular button | `.section-help-btn`, zoom, collection help | `.ui-btn--icon` | Uses muted button tokens |
| Text inputs | topbar, param rows, tree search, dialogs | `.ui-input`, `.ui-input--compact` | 16px param height variant |
| Select / textarea | param dropdown, JSON, auto prompts | `.ui-select`, `.ui-textarea` | |
| Checkbox row | param bool, values use-col, viewport BG | `.ui-check-row` | Shared `accent-color` token |
| Modal shell | 6+ `*-modal-back` divs vs native `<dialog>` | `.ui-modal-panel` + `.ui-modal-actions` | Two hosts; shared inner tokens |
| Context menu | `.collection-ctx-menu` | `.ui-menu` + `.ui-menu-item` | Replace hardcoded hover |
| Status banner | warning, param-errors, xAI key states | `.ui-banner--warning/success/danger` | |
| Scrollbar | `.thin-scroll`, visualiser scroll | `.ui-scroll` | Single utility |
| Theme CSS variables | `dev-ui.html` vs `index.html` | `ui/tokens.css` | Single source (future) |
| Built / unbuilt row state | `.piece-built-*`, unbuilt orange | `--state-built-*`, `--state-pending-*` | Semantic aliases |
| Colour swatch | viewport BG, param swatches | `.ui-swatch` | Shared focus ring |

### 4.1 Hardcoded colours — migration status (2026-06)

| Location | Status |
|----------|--------|
| `dev-ui.html` component CSS | **Done** — uses shared tokens; see intentional exceptions below |
| `electron/renderer/index.html` | **Done** |
| `electron/renderer/project_tree.css` | **Done** |
| `visualise_views.js` shells | **Done** — links `/ui/tokens-*.css` + [`ui/visualise-shell.css`](../ui/visualise-shell.css) |
| `ui/tokens-default.css`, `ui/tokens-nord.css` | **Source of truth** for palette hex |
| `runtimes/**` | **Out of scope** (unchanged) |
| Iro.js vendor internals | **Out of scope** |

**Intentional exceptions (not themed):**

| Location | Value | Reason |
|----------|-------|--------|
| `.param-color-swatch`, `.param-readout-swatch` | `#fff` + black text-shadow | Legibility on arbitrary swatch colours |
| `dev-ui.html` viewport default | `#808080` in JS | Neutral default colour value, not UI chrome |
| `color-mix(..., #000)` in tokens | primitive black | Depth / start-bg shading |

**Previously listed items — all migrated:**

- Collection context menu hover → `var(--row-highlight)`
- xAI key loaded/missing → success/danger tokens
- Focus rings → `var(--color-focus-ring)`
- Offline badge, preview banner → warning/danger tokens
- Color picker dialog → modal/surface/head tokens (now follows theme)
- Electron dialog danger + status classes → `--danger-btn-*`, `--status-*-text`
- Visualiser ~90 inline hex → `visualise-shell.css`

---

## 5. Colour palette schema

Three tiers: **primitives** (raw scales) → **semantic** (theme-mapped roles) → **component** (thin aliases).

Components must reference Tier 2 or Tier 3 only — never raw hex.

### 5.1 Tier 1 — Primitives (theme-independent scales)

Not used directly in component CSS. Values derived from current light/dark palettes during migration.

```css
/* Neutral scale (backgrounds, borders, text) */
--primitive-neutral-0:   #ffffff;
--primitive-neutral-50:  #f4f6fa;   /* ≈ light --bg */
--primitive-neutral-100: #eceff5;
--primitive-neutral-200: #d0d5de;   /* ≈ light --border */
--primitive-neutral-400: #5c6578;   /* ≈ light --muted */
--primitive-neutral-700: #3a404a;
--primitive-neutral-900: #1a1d24;   /* ≈ light --text */
--primitive-neutral-950: #0f1012;   /* ≈ dark --bg */

/* Accent (green) */
--primitive-green-400: #1f9d65;     /* light accent */
--primitive-green-300: #6ae3b0;     /* dark accent */
--primitive-green-900: #145a38;

/* Amber (locked state) */
--primitive-amber-300: #d9c56a;
--primitive-amber-700: #7a6b2e;

/* Red (danger) */
--primitive-red-400: #a44;
--primitive-red-700: #800;

/* Blue (highlight / focus — replaces #06c, #e8f0ff) */
--primitive-blue-100: #e8f0ff;
--primitive-blue-500: #0066cc;
--primitive-blue-900: #1e2838;      /* ≈ dark --row-highlight */
```

### 5.2 Tier 2 — Semantic tokens (theme-mapped)

Set on `html[data-theme="light"]` / `html[data-theme="dark"]`. Proposed canonical names:

| Role group | Proposed token | Current dev-ui alias |
|------------|----------------|----------------------|
| **Canvas** | `--color-bg` | `--bg` |
| | `--color-text` | `--text` |
| | `--color-text-muted` | `--muted` |
| | `--color-text-control` | `--control-text` |
| **Surfaces** | `--color-surface-panel` | `--panel` |
| | `--color-surface-card` | `--card-bg` / `--surface` |
| | `--color-surface-raised` | `--modal-bg` |
| | `--color-surface-hover` | `--surface-hover` |
| | `--color-surface-inset` | `--readonly-bg`, `--readout-wrap-bg` |
| | `--color-surface-header` | `--head-bg` (gradient) |
| | `--color-surface-header-hover` | `--head-hover` |
| | `--color-surface-header-collapsed` | `--head-collapsed` |
| **Borders** | `--color-border` | `--border` |
| | `--color-border-strong` | `--border-strong` |
| | `--color-divider` | `--divider-color` |
| | `--color-field` | `--field-border` |
| | `--color-field-soft` | `--field-border-soft` |
| **Accent** | `--color-accent` | `--accent` |
| | `--color-accent-subtle` | `--accent-soft` |
| **Interactive** | `--color-interactive-active-bg` | `--state-active-bg` |
| | `--color-interactive-active-text` | `--state-active-text` |
| | `--color-interactive-locked-bg` | `--state-locked-bg` |
| | `--color-interactive-locked-text` | `--state-locked-text` |
| | `--color-interactive-disabled-bg` | `--disabled-bg` |
| | `--color-interactive-disabled-text` | `--disabled-text` |
| | `--color-interactive-disabled-border` | `--disabled-border` |
| **Level / selection** | `--color-level-active-bg` | `--level-active-bg` |
| | `--color-level-active-border` | `--level-active-border` |
| | `--color-level-active-text` | `--level-active-text` |
| **Highlight** | `--color-highlight-subtle` | `--row-highlight` |
| **Focus** | `--color-focus-ring` | *(new — replaces `#06c`)* |
| **Feedback — warning** | `--color-warning-bg` | `--warning-bg` |
| | `--color-warning-text` | `--warning-text` |
| | `--color-warning-border` | `--warning-border` |
| | `--color-warning-hover` | `--warning-hover` |
| **Feedback — success** | `--color-success-bg` | `--success-bg` |
| | `--color-success-border` | `--success-border` |
| | `--color-success-subtle` | *(new — xAI loaded, piece built)* |
| **Feedback — danger** | `--color-danger-bg` | `--danger-hover-bg` |
| | `--color-danger-border` | `--danger-hover-border` |
| | `--color-danger-text` | `--danger-hover-text` |
| | `--color-danger-subtle` | *(new — xAI missing, offline badge)* |
| **Chrome** | `--color-shell-panel` | `--shell-panel` |
| | `--color-shell-panel-hover` | `--shell-panel-hover` |
| | `--color-shell-border` | `--shell-border` |
| | `--color-shell-tab-icon` | `--shell-tab-icon` |
| | `--color-chrome-close-bg` | `--chrome-close-bg` |
| | `--color-chrome-close-hover` | `--chrome-close-hover` |
| **Scrollbar** | `--color-scrollbar` | `--scrollbar` |
| **Chevron** | `--color-chevron` | `--chevron` |
| **Table** | `--color-table-head` | `--table-head` |

#### Electron shell alignment

| Electron token (`index.html`) | Maps to semantic |
|-------------------------------|------------------|
| `--details-bg` | `--color-surface-panel` (secondary panel) |
| `--card` | `--color-surface-card` |
| `--card-hover` | `--color-surface-hover` |
| `--folder-bg` | `--color-surface-card` |
| `--accent-bg` | `--color-accent-subtle` |
| `--btn-bg` | `--color-surface-card` |
| `--btn-text` | `--color-text` |
| `--tree-back-*` (4 vars) | `--color-tree-back-*` (tree-specific Tier 2) |

### 5.3 Tier 3 — Component tokens (alias Tier 2)

```css
--btn-muted-bg: var(--color-surface-card);
--btn-muted-hover: var(--color-surface-hover);
--btn-muted-text: var(--color-text-control);
--btn-muted-border: var(--color-border-strong);

--param-track-bg: var(--color-surface-inset);
--param-track-border: var(--color-accent);
--param-fill: var(--color-accent-subtle);
--param-thumb: var(--color-accent);
--param-thumb-border: var(--color-interactive-active-bg);
--param-grid-line: var(--color-border);  /* with alpha via color-mix */

--piece-built-bg: var(--color-success-subtle);
--piece-built-border: var(--color-success-border);
--piece-unbuilt-bg: var(--color-warning-bg);
--piece-unbuilt-border: var(--color-warning-border);

--readout-bar-bg: var(--color-surface-inset);
--readout-bar-border: var(--color-border-strong);
--chip-bg: var(--color-surface-card);
--chip-border: var(--color-border-strong);

--auto-row-bg: var(--color-surface-inset);
```

Legacy names (`--bg`, `--accent`, etc.) remain as **aliases** during migration:

```css
--bg: var(--color-bg);
--accent: var(--color-accent);
/* … */
```

### 5.4 Full migration table (dev-ui variables)

All variables defined in [`dev-ui.html`](../dev-ui.html) L24–167.

| Current variable | Tier | Proposed semantic / component | Keep alias? |
|------------------|------|------------------------------|-------------|
| `--bg` | 2 | `--color-bg` | Yes |
| `--text` | 2 | `--color-text` | Yes |
| `--panel` | 2 | `--color-surface-panel` | Yes |
| `--border` | 2 | `--color-border` | Yes |
| `--border-strong` | 2 | `--color-border-strong` | Yes |
| `--head-bg` | 2 | `--color-surface-header` | Yes |
| `--head-hover` | 2 | `--color-surface-header-hover` | Yes |
| `--head-collapsed` | 2 | `--color-surface-header-collapsed` | Yes |
| `--muted` | 2 | `--color-text-muted` | Yes |
| `--control-text` | 2 | `--color-text-control` | Yes |
| `--input-bg` | 2 | `--color-surface-inset` | Yes |
| `--card-bg` | 2 | `--color-surface-card` | Yes |
| `--surface` | 2 | `--color-surface-card` | Merge → alias |
| `--surface-hover` | 2 | `--color-surface-hover` | Yes |
| `--accent` | 2 | `--color-accent` | Yes |
| `--accent-soft` | 2 | `--color-accent-subtle` | Yes |
| `--shell-panel` | 2 | `--color-shell-panel` | Yes |
| `--shell-panel-hover` | 2 | `--color-shell-panel-hover` | Yes |
| `--shell-border` | 2 | `--color-shell-border` | Yes |
| `--shell-tab-icon` | 2 | `--color-shell-tab-icon` | Yes |
| `--scrollbar` | 2 | `--color-scrollbar` | Yes |
| `--state-active-bg` | 2 | `--color-interactive-active-bg` | Yes |
| `--state-active-text` | 2 | `--color-interactive-active-text` | Yes |
| `--state-locked-bg` | 2 | `--color-interactive-locked-bg` | Yes |
| `--state-locked-text` | 2 | `--color-interactive-locked-text` | Yes |
| `--level-active-bg` | 2 | `--color-level-active-bg` | Yes |
| `--level-active-border` | 2 | `--color-level-active-border` | Yes |
| `--level-active-text` | 2 | `--color-level-active-text` | Yes |
| `--divider-color` | 2 | `--color-divider` | Yes |
| `--modal-bg` | 2 | `--color-surface-raised` | Yes |
| `--chrome-close-bg` | 2 | `--color-chrome-close-bg` | Yes |
| `--chrome-close-hover` | 2 | `--color-chrome-close-hover` | Yes |
| `--piece-built-bg` | 3 | `--color-success-subtle` | Yes |
| `--piece-built-border` | 3 | `--color-success-border` | Yes |
| `--piece-unbuilt-bg` | 3 | `--color-warning-bg` | Yes |
| `--piece-unbuilt-border` | 3 | `--color-warning-border` | Yes |
| `--field-border` | 2 | `--color-field` | Yes |
| `--field-border-soft` | 2 | `--color-field-soft` | Yes |
| `--chevron` | 2 | `--color-chevron` | Yes |
| `--param-track-border` | 3 | `--param-track-border` | Yes |
| `--param-track-bg` | 3 | `--param-track-bg` | Yes |
| `--param-fill` | 3 | `--param-fill` | Yes |
| `--param-thumb` | 3 | `--param-thumb` | Yes |
| `--param-thumb-border` | 3 | `--param-thumb-border` | Yes |
| `--param-grid-line` | 3 | `--param-grid-line` | Yes |
| `--table-head` | 2 | `--color-table-head` | Yes |
| `--btn-muted-bg` | 3 | `--btn-muted-bg` | Yes |
| `--btn-muted-hover` | 3 | `--btn-muted-hover` | Yes |
| `--btn-muted-text` | 3 | `--btn-muted-text` | Yes |
| `--btn-muted-border` | 3 | `--btn-muted-border` | Yes |
| `--row-highlight` | 2 | `--color-highlight-subtle` | Yes |
| `--readonly-bg` | 2 | `--color-surface-inset` | Yes |
| `--auto-row-bg` | 3 | `--auto-row-bg` | Yes |
| `--warning-bg` | 2 | `--color-warning-bg` | Yes |
| `--warning-text` | 2 | `--color-warning-text` | Yes |
| `--warning-border` | 2 | `--color-warning-border` | Yes |
| `--warning-hover` | 2 | `--color-warning-hover` | Yes |
| `--success-bg` | 2 | `--color-success-bg` | Yes |
| `--success-border` | 2 | `--color-success-border` | Yes |
| `--danger-hover-bg` | 2 | `--color-danger-bg` | Yes |
| `--danger-hover-border` | 2 | `--color-danger-border` | Yes |
| `--danger-hover-text` | 2 | `--color-danger-text` | Yes |
| `--disabled-bg` | 2 | `--color-interactive-disabled-bg` | Yes |
| `--disabled-text` | 2 | `--color-interactive-disabled-text` | Yes |
| `--disabled-border` | 2 | `--color-interactive-disabled-border` | Yes |
| `--readout-wrap-bg` | 3 | `--readout-wrap-bg` | Yes |
| `--readout-wrap-border` | 3 | `--readout-wrap-border` | Yes |
| `--readout-bar-bg` | 3 | `--readout-bar-bg` | Yes |
| `--readout-bar-border` | 3 | `--readout-bar-border` | Yes |
| `--chip-bg` | 3 | `--chip-bg` | Yes |
| `--chip-border` | 3 | `--chip-border` | Yes |

---

## 6. Workflow

1. **Develop palette** on [`ui-colour-review.html`](../ui-colour-review.html) — edit CSS variables in the page `<style>` block.
2. **Validate** contrast and state clarity in Both mode (light | dark side-by-side).
3. **Extract** approved tokens to shared files under [`construct2/ui/`](../ui/) (see §8).
4. **Migrate** remaining hardcoded hex (§4.1), unify shell vars (§5.2 Electron alignment), add legacy aliases (§5.3).
5. **Extend** to visualiser shells (§3G) once core palette is stable.

---

## 8. Production integration (shipped)

**Default palettes:** `light` → **Light+S**, `dark` → **Dark+S** (with depth shadows). These replace the former inline `dev-ui.html` token blocks.

### Storage

| Key | Values | Purpose |
|-----|--------|---------|
| `advBuilder.theme` | `light` \| `dark` | Ambiance (left-click toggle + Electron shell) |
| `advBuilder.palette` | `default` \| `nord` \| `nord-1` … `nord-10` | Colour scheme |

If `advBuilder.palette` is missing on load, it defaults to `default` (existing users get Light+S / Dark+S automatically).

### Toggle behaviour

| Action | Result |
|--------|--------|
| **Left-click** `#theme-toggle` | Sets `palette = default`, flips `light` ↔ `dark`, applies Light+S or Dark+S |
| **Right-click** `#theme-toggle` | Opens Nord swatch picker; selecting a swatch sets `palette`, forces `theme = dark`, applies Nord variant |

When a Nord palette is active, the toggle shows a subtle accent ring (`.theme-toggle--palette-nord`).

### DOM attributes

```html
<html data-theme="light|dark" data-palette="default|nord|nord-N" class="theme-depth">
```

- `default` + `light` / `dark` → tokens from `tokens-default.css`
- `nord` / `nord-N` → tokens from `tokens-nord.css` + `tokens-nord-variants.css` (always dark-ambient UI)

### File map

| File | Role |
|------|------|
| [`ui/tokens-default.css`](../ui/tokens-default.css) | Light+S / Dark+S |
| [`ui/tokens-nord.css`](../ui/tokens-nord.css) | Base Nord |
| [`ui/tokens-nord-variants.css`](../ui/tokens-nord-variants.css) | Nord hue shifts 1–10 (generated) |
| [`ui/theme-depth.css`](../ui/theme-depth.css) | Elevation shadows on key controls |
| [`ui/theme-picker.css`](../ui/theme-picker.css) | Right-click swatch menu |
| [`ui/theme.js`](../ui/theme.js) | `applyTheme`, toggle, picker, `postMessage` sync |
| [`ui/visualise-shell.css`](../ui/visualise-shell.css) | UTF8 / Metadata / Analysis iframe chrome |
| [`ui/generate-nord-variants.js`](../ui/generate-nord-variants.js) | Regenerate `tokens-nord-variants.css` |

Wired in: [`dev-ui.html`](../dev-ui.html), [`electron/renderer/index.html`](../electron/renderer/index.html), [`visualise_views.js`](../visualise_views.js) shells, static route `/ui/*` in [`builder.js`](../builder.js).

### Electron sync

`postMessage` payloads include both fields:

```js
{ type: 'advBuilder:themeChange', theme: 'dark', palette: 'nord-3' }
{ type: 'advBuilder:theme', theme: 'dark', palette: 'nord-3' }
```

When `palette !== 'default'`, the Electron shell forces dark ambiance (`data-theme="dark"`) while storing the chosen Nord palette.

### Manual test checklist

- [ ] Fresh load: light → Light+S appearance with shadows
- [ ] Toggle → Dark+S; reload persists
- [ ] Right-click toggle → picker shows; select Nord 5 → Nord palette applied
- [ ] Left-click while on Nord 5 → returns to default; flips to Light+S or Dark+S
- [ ] Electron embed: rail + dev-ui stay in sync; Nord palette darkens shell
- [ ] Browser-only dev-ui (no parent): toggle + picker work without errors
- [ ] Old `localStorage` with only `advBuilder.theme=light` still loads Light+S

### Out of scope (follow-up)

- Iro.js vendor wheel rendering (not CSS-themeable)
- Import shared CSS into [`ui-colour-review.html`](../ui-colour-review.html) to avoid drift with production tokens
- **`runtimes/**`** — legacy canvas shells (explicitly excluded)

---

## 7. Verification checklist

- [ ] Every inventory item in §3A–3F has a representative sample on the test page (§3H) or is listed in §3G gaps.
- [ ] Every hardcoded colour in §4.1 appears in the test page “Known debt” subsection.
- [ ] Light and dark columns render identically structured; theme toggle works (Light / Dark / Both).
- [ ] Choice buttons cycle normal → active → locked on click (interactive demo).
- [ ] Section collapse demo toggles expanded/collapsed header gradients.
