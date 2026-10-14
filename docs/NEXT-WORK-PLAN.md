# Construct² — Next work plan

**Status:** Tracks A–C complete (picker/legacy, dev UI chrome, runtime switching E5)  
**Related:** [PROJECTS-STARTUP-DESIGN.md](./PROJECTS-STARTUP-DESIGN.md), [COLLECTION-DESIGN-V2.md](./COLLECTION-DESIGN-V2.md)

Living plan for picker follow-ups, dev UI chrome, and runtime switching (E5).

## Recently shipped (pre-phase)

- Project search focus preserved during tree refresh
- Parameter text field focus preserved during WS updates
- Collection `_source/` copies full `//import<>` graph including `construct2/lib/` files
- **Unified source inventory** ([`source_inventory.js`](../source_inventory.js)): startup Source files panel, builder watch, and collection `_source/` / fingerprint share one canonical list + import graph; stale `_source` files pruned on rebuild
- **Shell UX polish:** in-app HTML confirm dialogs; window bounds persistence (incl. Windows DPI via `contentBounds`); Explorer opens project folder and selectable source files; auto-hiding scrollbars on tree, details panel, and collection piece list
- **Legacy import fixes:** `cert.js` extraction; single-collection import from `collectiondata[]`; re-convert rebuilds collections by default

---

## Track A — Picker / legacy follow-ups

| # | Task | Status |
|---|------|--------|
| A1 | Re-convert menu when legacy data exists (not only `kind: legacy`) | Done |
| A2 | Disable re-convert on read-only roots | Done |
| A3 | Surface `needsReview` / warnings on dev open | Done |
| A4 | Persist `lastSelected` on row select | Done |
| A5 | Escape HTML in details panel | Done |
| A6 | Block silent mirror when legacy path has no writable owning root | Done |
| A7 | Tests for A6 + legacy data detection | Done |

## Track B — Dev UI chrome

| # | Task | Status |
|---|------|--------|
| B1 | Offline badge on visualizer; remove connected indicator; WS auto-reconnect | Done |
| B2 | Projects tab + close in dev UI top-left; window title `Construct² - art/Project` | Done |
| B3 | Section toolbar rows + `?` help overlay per panel | Done |
| B4 | Compact `xai` button + day/night theme toggle (now in `#vis-toolbar`; was top bar) | Done |

## Track C — Runtime switching (E5)

| # | Task | Status |
|---|------|--------|
| C1 | `GET /runtimes` + `POST /project/runtime` in `builder.js` | Done |
| C2 | Runtime dropdown in dev UI; selection stored in `project.json` (does not overwrite `core.html`) | Done |
| C3 | Legacy runtimes in dropdown (`optgroup`) | Dropped for alpha — import uses project-core from `*_data.json` |
| C4 | Active runtime in project details panel + Electron IPC (`adv:list-runtimes`, `adv:set-project-runtime`) | Done |

**Runtime model:** shared cores are resolved at build time from `construct2/runtimes/`; project `core.html` is only used when **Project core** is selected. Collection `_source/` snapshots the effective core.

**Order:** A → B1 → B2 → B4 → B3 → C

---

## Possible next tracks (not scheduled)

| Area | Doc | Notes |
|------|-----|-------|
| Saved pieces quick-save | [SAVED-PIECES-DESIGN.md](./SAVED-PIECES-DESIGN.md) | POST `/saved` + folder write (S1) |
| Collection V2.1 | [COLLECTION-DESIGN-V2.md](./COLLECTION-DESIGN-V2.md) | Remaining V2.1 contract items |
| Auto-generation | [AUTO-GENERATION.md](./AUTO-GENERATION.md) | xAI fill / platform prompts |
| PARAM-VEC2 | [PARAM-VEC2-PLAN.md](./PARAM-VEC2-PLAN.md) | 2D vector param + pad UI |
| Viewport capture | [VIEWPORT-CAPTURE.md](./VIEWPORT-CAPTURE.md) | Preview mp4 of the live canvas; research branch |
| Inkoder | [INKODER.md](./INKODER.md) | Demo line editor + string decoder; research branch |
