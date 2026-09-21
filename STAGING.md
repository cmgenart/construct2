# Construct² (advBuilder) — staging: foundations, features, choices, plan

Internal design notes from the genart fork. Not a user guide — start at [README.md](./README.md) or [docs/user/README.md](./docs/user/README.md).

The active toolchain lives in **`construct2/`** (this folder). It is a **separate builder** from [`.builder/`](../.builder/). You can evolve Construct² without risking [`.builder/builder.js`](../.builder/builder.js) or other art projects. Older docs may say `.advBuilder/` — same tree, renamed path.

---

## 1. Decisions made so far

| Decision | Detail |
|----------|--------|
| **Location** | **`construct2/`** (sibling to `.builder/`; formerly documented as `.advBuilder/`). |
| **Relationship to classic builder** | **Fork, not replace.** Classic `.builder` stays the production path until advBuilder proves out. **Reconciliation later** once core architecture choices are stable. |
| **Isolation** | **Vendored copies** of the classic toolchain live here (`builder.js`, `builder.pmaster*.js`, minifiers, `dev-ui.html`, `cc3*.html`, `package.json`). **advBuilder-only** modules live alongside them (`param_scan.js`, `param_scan.test.js`, `docs/PARAM-SPEC.md`). Edits in `.advBuilder` do **not** change `.builder` or project sources until you reconcile (see **§7**). |
| **First step scope** | **Design + foundation only:** folder layout, copied libs, this staging document. Feature design continues over the next few days. |
| **Project paths** | Today’s copied `builder.js` still resolves projects as **`../<projectName>`** (same as classic), e.g. `../art/AsciiCore` when run **with cwd = `construct2/`** and `--project-path`, or legacy `../<name>` from older layouts. |
| **Run command (today)** | `cd construct2` then `npm install`, then `npm start` (Electron) or `node builder.js --project-path ../art/<Project>` (classic). |

---

## 2. What is copied (foundation snapshot)

These files were duplicated from `.builder/` at bootstrap time (then evolved here):

- `builder.js` — entry (**advBuilder fork**; adds `param_scan`, `/params`, WS `params`, `dev.json` param fields, `output.params.md`, chokidar, etc.).
- `builder.pmaster_process.js`, `builder.pmaster.v1.js`, `builder.pmaster.v2.js` — Art pipeline / PropMaster.
- `builder.terser.min.js`, `builder.glslx.min.js` — minifiers.
- `dev-ui.html` — dev UI (**diverged**: collapsible sections, Parameters, vis toolbar + seed/zoom row, embed close, iframe param sync).
- Shared cores live in `runtimes/cc-v3.23.html` and `runtimes/cc-v3.22.html` (root `cc3.html` / `cc3.23.html` removed).
- `package.json` — dependencies + **Electron** devDependency; `npm run test:param` runs `param_scan` tests.

**Added in advBuilder (not in the original bootstrap copy):**

- `param_scan.js`, `param_scan.test.js` — `//PARAM-*` scanner + tests.
- `param_sendparams_patch.js`, `param_sendparams_patch.test.js` — normalize `SendParams` to `WINDOW.parent` in built HTML.
- `param_color.js`, `param_color.test.js` — colour wire conversion + migration.
- `color_picker.js`, `param_persist.js`, `param_persist.test.js` — dev-ui picker + ephemeral/deprecated key stripping.
- `vendor/iro.min.js` — Iro colour picker (see `docs/PARAM-COLOR-PLAN.md` §8).
- `docs/PARAM-SPEC.md`, `docs/PARAM-COLOR-PLAN.md`, `docs/PARAM-COLOR-IMPL.md`, `docs/PARAM-COLOR-TEST.md` — parameters + colour UX.
- `visualise_views.js`, `visualise_tabs.js`, `visualise_metadata_client.js`, `visualise_param_bridge.js`, `visualise_analysis_client.js` — preview shell HTML/JS for UTF8, Metadata, Analysis modes.
- `viewport_bg.js`, `viewport_bg_client.js`, `viewport_bg_patch.js`, `viewport_bg.test.js` — dev-only Full/Min preview background (solid/checker), `CanvasWall` layering, serve-time injection; settings in `dev.json` only.
- `docs/README.md`, `docs/VISUALISER.md`, `docs/VIEWPORT-BACKGROUND.md`, `docs/PROPERTY-ANALYSIS.md`, `docs/UTF8LINK-METADATA.md` — visualiser + viewport BG + utf8link + analysis docs.
- `docs/COLLECTION-DESIGN.md`, `docs/SAVED-PIECES-DESIGN.md` — planned Collection + Saved pieces modes (design examination only).

**Not copied (on purpose):** `node_modules` (install locally), `builder_old.js`, `upgradePlan.txt`, audit markdowns (stay next to classic templates or repo root).

**Specs (advBuilder-native):** [docs/PARAM-SPEC.md](./docs/PARAM-SPEC.md) — external `//PARAM-*` parameters, runtime **`cc_onParam`** / optional **`OnParam(fn)`** / **`SendParams`**, dev-ui collapsible sections (implementation phased).

---

## 3. Direction (longer term)

advBuilder is intended to **go further** than the classic builder. **Parameter tooling (P2–P3 partial)** and the **Electron dev shell (Phases 1–3)** are implemented here; classic `.builder` does not yet include `/params`, `param_scan`, or the new dev-ui behavior. Remaining topics:

- **Electron (or similar)** host: project picker, multi-project root, packaged app.
- **Process split:** **main** = filesystem, watches, optional full `ArtBuilder` + minify; **renderer** = UI like `dev-ui`, live preview, property controls; **IPC** instead of or in addition to localhost HTTP/WebSocket.
- **Stronger contracts:** single canvas template source, `dev.json` slimming, less `eval` surface, golden-build tests.
- **UX:** progress for long minify, clearer errors from `output.errors.json`, optional plugin hooks.

**Electron Phase 1** is implemented (`electron/` + `npm start`). The rest of this section is longer-term direction; Phases 2–3 cover project picker and dev UI.

---

## 4. Working notes (fill in as you decide)

### 4.1 Electron & UI roadmap (agreed sequence)

- [x] **Phase 1 — Electron foundations** — `electron/main.js`, `electron/preload.js`, `electron/renderer/test.html`; `npm start` runs Electron; `contextIsolation`, no `nodeIntegration`, `sandbox`; `window.advBuilder` from preload for a smoke test.
- [x] **Phase 2 — Project selection** — evolved to **unified project tree** (`project_tree.js`): multi-root accordion, recents, search, pins, details panel, dev rail; see [docs/PROJECTS-STARTUP-DESIGN.md](./docs/PROJECTS-STARTUP-DESIGN.md) §4.
- [x] **Phase 3 — Dev UI for open project** — `ADVBUILDER_NO_OPEN` in advBuilder `builder.js` skips `open()`; Electron spawns `node builder.js --project-path <abs>` (cwd `construct2/`), waits for HTTP on `ADVBUILDER_PORT` (default 3000); renderer loads classic `dev-ui` in an **iframe** (`?embed=1`); **Close** posts `postMessage` → `adv:stop-dev-ui`; IPC `adv:start-dev-ui` / `adv:stop-dev-ui` / `adv:get-dev-server-origin`; `before-quit` kills child. File changes: **chokidar** on source paths + `cc3*.html` (debounced rebuild); WS `rebuilding` + `update` for overlay.

### 4.2 Other features (backlog — check off when specified)

- [x] **Unified project tree** — `project_tree.js`, `project_search.js`, `project_details.js`; workspace pins, context menus, drag-drop, legacy read-only policy; full IPC surface in [PROJECTS-STARTUP-DESIGN.md](./docs/PROJECTS-STARTUP-DESIGN.md) §4.7.
- [x] **Runtime selection** — dev UI `<select>`; `GET /runtimes` / `POST /project/runtime`; shared cores vs project `core.html` without disk overwrite; `project_runtime.js`. See §4.9 in PROJECTS-STARTUP-DESIGN.
- [x] **Dev UI embed chrome** — Projects tab, Close, offline badge, theme toggle, section help (Track B — [NEXT-WORK-PLAN.md](./docs/NEXT-WORK-PLAN.md)).
- [ ] **Entry script name** — keep `builder.js` vs rename to `advBuilder.js` / `index.js` for clarity.
- [ ] **Dev server** — today: Node `http` + `ws` in `builder.js` (no Express in-tree). Longer term: IPC-only or hybrid per §3.
- [ ] **State file** — still `dev.json` per project, or split build cache out.
- [x] **Template / runtime selection** — shared runtimes from `runtimes/` + optional project `core.html`; selection in `project.json` (§4.9 PROJECTS-STARTUP-DESIGN).

### 4.3 Open choices

- **Rename vs shadow:** same `require('./builder.pmaster…')` paths keep diffs small; renames add clarity at cost of churn.
- **Git:** whether `construct2/node_modules` is gitignored (recommend yes; keep lockfile committed if you want reproducible installs).
- **Versioning:** independent `advBuilder` version string in UI vs tying to canvas `cc_version`.

### 4.4 Risks to avoid

- Drifting copies without a documented **sync policy** (date-stamped copies vs git submodule vs monorepo package).
- Running advBuilder `builder.js` **from the wrong cwd** (requires will resolve wrong `../` paths).

---

## 5. Plan (phased)

| Phase | Goal |
|-------|------|
| **0 — Done** | Create `.advBuilder`, copy libs, `STAGING.md`. |
| **1 — Done** | **Electron shell:** test renderer + secure preload; `package.json` `"main": "electron/main.js"`, `npm start` → Electron. |
| **2 — Done** | **Project selection:** `index.html` + IPC; workspace + window bounds persisted in `{userData}/window-state.json`. |
| **3 — Done** | **Dev UI:** spawn `node builder.js <name>`; iframe loads dev server (`?embed=1`); configurable port; stop IPC + quit cleanup. |
| **Phase 4 — Later** | Parity / merge: use **§7** checklist below; compare outputs with classic `.builder`; reconcile duplicated files if desired. |

### 5.1 Electron layout (Phases 1–3)

| File | Role |
|------|------|
| `electron/main.js` | `BrowserWindow`, IPC (`adv:*`), window state persistence, `loadFile` → `renderer/index.html`. |
| `electron/preload.js` | Exposes `advBuilder` API (`listProjects`, `setSelectedProject`, …) via `invoke`. |
| `electron/renderer/test.html` | Phase 1 smoke test (optional). |
| `electron/renderer/index.html` | App shell: start picker + dev iframe + projects rail; in-app `<dialog>` confirms. |
| `electron/renderer/app_dialog.js` | `showAppConfirm()` — HTML confirm dialog (avoids native `confirm()` focus bugs on Windows). |
| `electron/renderer/project_tree.js` | Unified scroll tree (start + dev rail modes). |
| `electron/renderer/project_details.js` | Start-page project details panel; Explorer actions on source files. |

### 5.2 IPC channels (Phases 2–3 + unified tree)

See [docs/PROJECTS-STARTUP-DESIGN.md](./docs/PROJECTS-STARTUP-DESIGN.md) §4.7 for the full `adv:*` surface. Core channels:

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `adv:get-workspace` | invoke → main | Load `workspace.json` (roots, recents, pins). |
| `adv:list-projects` | invoke → main | `{ roots: [{ id, label, path, readOnly, projects[] }] }`. |
| `adv:get-selected-project` | invoke → main | `{ name, path }` or `null`. |
| `adv:set-selected-project` | invoke → main | `{ name, path }` — validates path under root. |
| `adv:start-dev-ui` | invoke → main | `{ projectPath }` — legacy in-place upgrade or read-only policy; spawns builder; returns `{ url }`. |
| `adv:stop-dev-ui` | invoke → main | SIGTERM child builder process. |
| `adv:get-dev-server-origin` | invoke → main | e.g. `http://127.0.0.1:3000`. |
| `adv:get-project-details` | invoke → main | File sizes, collections, legacy provenance for details panel. |
| `adv:pin-project` / `adv:unpin-project` | invoke → main | Per-root pin list. |

*Legacy table below is historical; prefer §4.7 in PROJECTS-STARTUP-DESIGN.md.*

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `adv:get-projects-root` | invoke → main | **Deprecated** — first enabled root (compat). |

### 5.3 Env / builder tweak (Phase 3)

| Item | Detail |
|------|--------|
| `ADVBUILDER_NO_OPEN` | Set by Electron when spawning `builder.js` so the `open` package does not launch an external browser (dev UI is inside Electron). Implemented in advBuilder [builder.js](./builder.js) only; classic `.builder` unchanged unless you copy the same line. |
| `ADVBUILDER_PORT` | Optional. Dev server listen port and URL used by Electron wait + iframe (default `3000`). |
| `ADVBUILDER_NODE` | Optional. Executable used to run `builder.js` from Electron (default `node`). |
| `ADVBUILDER_VERBOSE` | Optional. Set to `1` on the **builder** process to log each load/save path. |
| `ADVBUILDER_POLL_WATCH` / `CHOKIDAR_USEPOLLING` | Optional. Set to `1` for chokidar polling if native file events miss edits. |

---

## 6. Changelog (this file)

| Date | Note |
|------|------|
| *(bootstrap)* | Folder created; files copied; staging doc added. |
| *Phase 1* | Electron `main` / `preload` / `test.html`; `package.json` scripts + `electron` devDependency; README. |
| *Electron bump* | `npm audit fix --force` raised **Electron to 42.x** (from 34.x); advisory list cleared at that time. Re-run `npm audit` periodically—new issues can appear on any version. |
| *Phase 2* | Project list + selection IPC; main loads `renderer/index.html`. |
| *Phase 3* | Spawn `builder.js` with `ADVBUILDER_NO_OPEN`; iframe dev-ui (`embed=1`); chokidar + WS rebuild overlay; `adv:start-dev-ui` / `adv:stop-dev-ui`; quit stops child. |
| *Tidy pass* | Removed unused `express` dep; `ADVBUILDER_PORT` / `ADVBUILDER_NODE` / `ADVBUILDER_VERBOSE`; IPC `adv:get-dev-server-origin`; safer JSON handlers; docs env table. |
| *PARAM P3 (partial)* | `/params` GET+POST, WS `params`, `paramValues` in `dev.json`; dev-ui **Parameters** section (collapsible stack); iframe `postMessage`; **`cc_onParam`** bridge in `cc3.23.html` (advBuilder + `.builder` copies); scanner: FLOAT 5-tuple, STRING `null`. |
| *Doc / UI pass* | Disclosure triangles (CSS borders, no Unicode); `localStorage` section expand/collapse; README + STAGING aligned with `param_scan` / PARAM-SPEC; STAGING §7 `.builder` parity checklist. |
| 2026-05-15 | **Colour params (phases 0–9):** Iro picker, swatches, commit-only preview, HSL, PARAM-COLOR deprecated, Electron clipboard IPC, legacy HSV migration; docs `PARAM-COLOR-*`. |
| 2026-05-16 | **Visualiser + analysis:** UTF8/Metadata tabbed shells, param bridge, pool.pm external open, lazy iframe mount; `PropertyAnalysis` + `GetStatsAsync` + `POST /analyze`; Analysis dev-ui mode; docs `VISUALISER`, `PROPERTY-ANALYSIS`. |
| 2026-05-16 | **Art → dev-ui:** `SendParams` via `parent.postMessage`; dev-ui coerce + panel sync; `param_sendparams_patch` for legacy builds; nested preview bubble in `visualise_param_bridge.js`. |
| 2026-05-16 | **Design docs:** `COLLECTION-DESIGN` (batch collection mode), `SAVED-PIECES-DESIGN` (snapshot folders + rebuild); docs index updated. |
| 2026-06-04 | **Viewport background:** seed-row BG checkbox + solid/checker swatches; `viewport_bg*` modules; `POST /viewport/settings`; Full/Min serve-time patch + `CanvasWall` wall layer; UTF8/Metadata/Analysis excluded; docs `VIEWPORT-BACKGROUND.md`. |
| 2026-06-18 | **Projects startup (Phases A–F):** multi-root workspace, unified tree, legacy lazy convert, templates, batch import; docs `PROJECTS-STARTUP-DESIGN.md`. |
| 2026-06-18 | **Runtime selection (E5):** dev UI dropdown; `project_runtime.js`; effective core for builds + collection `_source/`; IPC `adv:list-runtimes` / `adv:set-project-runtime`. |
| 2026-06-18 | **Dev UI chrome (Track B):** embed Projects tab, Close, offline badge, theme toggle, section help; docs `NEXT-WORK-PLAN.md`. |
| 2026-06-20 | **Source inventory unification:** `source_inventory.js` — single canonical list for builder watch, startup Source files panel, collection `_source/` + fingerprint; `cert.js` + transitive `//import<>` in inspect; `_source` prune on rebuild; tests `source_inventory.test.js`. |
| 2026-06-18 | **Shell UX polish:** in-app HTML confirm dialogs (`app_dialog.js`); window position/size persistence (`window-state.json`, Windows `contentBounds`); Explorer opens project folder + selectable source files; auto-hiding scrollbars on tree/details/piece list; legacy re-convert rebuilds single collection + extracts `cert.js`; tests `legacy_collection_import.test.js`. |

*(Append rows as you amend decisions.)*

---

## 7. Reconciling with classic `.builder` (parity checklist)

When porting advBuilder behavior to `.builder`, treat these as **atomic-ish** work units (order may vary slightly):

| Area | advBuilder artifacts | Classic `.builder` today |
|------|------------------------|---------------------------|
| Scanner | `param_scan.js`, `param_scan.test.js`, `package.json` script `test:param` | Absent |
| HTTP / WS | `GET`/`POST` `/params`, `broadcastParams`, `state.paramSchema` / `paramScanErrors` / `paramValues` in `dev.json` | Absent |
| Build | `refreshParamScan`, `output.params.md`, merge param defaults on load | Absent |
| dev-ui | Single scroll, collapsible **Parameters \| Values \| Properties** (grouped properties + level bar), vis toolbar mode tabs, seed/zoom/runtime row, iframe param patch + WS delta, thin scrollbars, column divider reflow | Older tabbed or minimal UI |
| Canvas core | `cc3.23.html`: `SendParams` → `parent.postMessage`, `cc_onParam`, `OnParam` | Partially synced; project `core.html` must match for source builds |
| Docs | `docs/PARAM-SPEC.md`, `docs/VALUES-PANEL.md`, `docs/PROPERTIES-PANEL.md`, `docs/VISUALISER.md`, `docs/PROPERTY-ANALYSIS.md`, `docs/UTF8LINK-METADATA.md` | Copy or symlink into `.builder/docs` if desired |
| Properties | `propertyLevels`, grouped `//#<<…>>` parse, `POST /propertyLevels`, unified dev-ui panel | Legacy `props` + split Hex DNA / Debug sections |
| Visualiser | `visualise_*.js`, `/visualise`, `/analyze`, `lastAnalysis` in `dev.json` | Absent |
| Viewport BG | `viewport_bg*.js`, `/viewport/settings`, seed-row UI (Full/Min only) | Absent |
| Metadata extras | `pool_pm_link` on `lastBuild`, metadata preview shell | Partial / absent |

**Policy:** Until parity is intentional, run **either** `node construct2/builder.js <proj>` **or** `node .builder/builder.js <proj>` from the respective cwd so `dev.json` / locks stay consistent with the server you used.

---

## 8. Quick commands

### Electron

```bash
cd .advBuilder
npm install
npm start
```

### Classic Node builder

```bash
cd .advBuilder
npm install
node builder.js --project-path ../art/AsciiCore
```

With `node builder.js <project>`, the dev UI is at `http://localhost:<port>` (default **3000**, or set `ADVBUILDER_PORT`). Electron embeds the same UI in an iframe when you use **Open builder dev UI**.
