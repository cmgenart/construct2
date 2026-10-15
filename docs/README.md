# Construct² documentation

**User help:** [user/README.md](./user/README.md) — Getting Started, the workbench, and a Technical group that links back here.

**Engineering start here:** [CORE.md](./CORE.md) — unified architecture for **Canvas Core**, **PropMaster (PMaster)**, and **advBuilder**. Plan: [DOCUMENTATION-PLAN.md](./DOCUMENTATION-PLAN.md). Audit: [`_audit/`](./_audit/).

| Document | Contents |
|----------|----------|
| [CORE.md](./CORE.md) | **System overview** — Canvas Core, PropMaster, advBuilder, `//import`, property JSON options, art project layout, build pipeline, state; canonical sources via [`source_inventory.js`](../source_inventory.js) |
| [PARAM-SPEC.md](./PARAM-SPEC.md) | `//PARAM-*` authoring, runtime `cc_onParam` / `SendParams`, dev-ui parameters |
| [PARAM-COLOR-PLAN.md](./PARAM-COLOR-PLAN.md) | Colour parameter UX design |
| [PARAM-COLOR-IMPL.md](./PARAM-COLOR-IMPL.md) | Colour implementation notes |
| [PARAM-COLOR-TEST.md](./PARAM-COLOR-TEST.md) | Colour QA checklist |
| [UI-COLOUR-REVIEW.md](./UI-COLOUR-REVIEW.md) | **UI theming** — control inventory, consolidation map, palette schema; test page [`ui-colour-review.html`](../ui-colour-review.html) |
| [PARAM-VEC2-PLAN.md](./PARAM-VEC2-PLAN.md) | **Planned** — 2D vector parameter (`look` pad UI, wire `{ x, y }`) |
| [UTF8LINK-METADATA.md](./UTF8LINK-METADATA.md) | `utf8link` escaping, Terser quotes, Cardano metadata chunking |
| [VALUES-PANEL.md](./VALUES-PANEL.md) | Build-time value levels, merge, override → metadata and canvas inserts |
| [PROPERTIES-PANEL.md](./PROPERTIES-PANEL.md) | PropMaster properties: groups, levels, **group Random**, global Random, post-build sync |
| [METADATA-BUILDER.md](./METADATA-BUILDER.md) | Project `metadata.js`, Cardano split post-process, `finalizeMetadataForBuild` |
| [COLLECTION-SCRIPTS.md](./COLLECTION-SCRIPTS.md) | Project `collection.js`, Script menu, batch piece list builders |
| [PROJECT-DATABASE.md](./PROJECT-DATABASE.md) | **Design** — Project-scoped lore DB (entities, JSON blobs), collection script access, AI refinement loops |
| [VISUALISER.md](./VISUALISER.md) | Preview modes (Full, Min, UTF8, Metadata, Analysis), `#vis-toolbar` tabs, param bridge |
| [PIECE-LIST-UX.md](./PIECE-LIST-UX.md) | **Planned (F1.2)** — Error dot, piece context menu (Show errors, Build, Explorer, browser) |
| [VISUALIZER-CONSOLE.md](./VISUALIZER-CONSOLE.md) | **Implemented (F1.3)** — Build/Art/Both log panel, capture toggles, windowed history, disk persistence, scroll-to-tail on expand |
| [VIEWPORT-BACKGROUND.md](./VIEWPORT-BACKGROUND.md) | Dev-only preview BG (solid/checker: shared fill + alternate swatch), `CanvasWall` layering, Full/Min only, build isolation |
| [VIEW-NAVIGATION-CONTROLS.md](./VIEW-NAVIGATION-CONTROLS.md) | **Implemented (F1.11 + F1.11b)** — Preview pan/zoom, Ctrl-hold, reset, fullscreen, RMB peek zoom; Full/Min only |
| [VIEWPORT-CAPTURE.md](./VIEWPORT-CAPTURE.md) | **Research** — Preview camera: record the live art canvas to `<project>/captures/`; serve-time inject only |
| [INKODER.md](./INKODER.md) | **Research** — Demo line editor: subdivision strokes to a `PARAM-STRING`, decoder on `cc-v3.23` |
| [PROPERTY-ANALYSIS.md](./PROPERTY-ANALYSIS.md) | Property distribution sampler API, `GetStats`, dev-ui Analysis mode |
| [COLLECTION-DESIGN.md](./COLLECTION-DESIGN.md) | **Design (v1, planned)** — Collection visualiser mode, manifest in `dev.json` |
| [COLLECTION-DESIGN-V2.md](./COLLECTION-DESIGN-V2.md) | **Collections v2 (implemented)** — On-disk collections, piece records, piece list UI, build batch, source fingerprint, effective core in `_source/` |
| [MINT-READY-BUNDLE.md](./MINT-READY-BUNDLE.md) | Offline mint-ready bundle export: zip handoff, marketing, previews, preflight |
| [CLOUD-MINTING-INTERFACE.md](./CLOUD-MINTING-INTERFACE.md) | Future — cloud vending API integration + quick self-mint |
| [runtimes/README.md](../runtimes/README.md) | Shared canvas cores (`cc-v3`, legacy shells), manifest, selection model |
| [EXTRA-RUNTIMES.md](./EXTRA-RUNTIMES.md) | **WIP** — p5.js & Three.js framework runtimes (deactivated under `wip/extra-runtimes/`) |
| [runtimes/](./runtimes/) (design notes) | [ASCII-CORE-INTEGRATION.md](./runtimes/ASCII-CORE-INTEGRATION.md), [ASCII-CORE-SPEC.md](./runtimes/ASCII-CORE-SPEC.md) |
| [COLLECTION-GENERATOR-PLUGINS.md](./COLLECTION-GENERATOR-PLUGINS.md) | **Superseded** — pointer to AUTO-GENERATION |
| [AUTO-GENERATION.md](./AUTO-GENERATION.md) | **Implemented (A1–A6)** — Per-field value auto prompts, collection brief, peer examples, Electron xAI; A7–A9 future |
| [SAVED-PIECES-DESIGN.md](./SAVED-PIECES-DESIGN.md) | **Design (planned)** — Saved snapshots: folder layout, rebuild, shortcuts |
| [PARAMETER-DRIVERS-DESIGN.md](./PARAMETER-DRIVERS-DESIGN.md) | Custom HTML parameter drivers, readout, `ParamMessenger` |
| [MINOR-UPGRADES-PLAN.md](./MINOR-UPGRADES-PLAN.md) | Global drivers, value key reorder, Debug-first Properties |
| [PROJECTS-STARTUP-DESIGN.md](./PROJECTS-STARTUP-DESIGN.md) | **Implemented** — Multi-root workspace, startup screen, templates, legacy import, runtime selection (E5), dev UI chrome, shell UX (dialogs, window state, Explorer) |
| [DEMO-PROJECTS.md](./DEMO-PROJECTS.md) | **Design** — Installer demos (latest Canvas Core), Documents vs bundled originals, save-a-copy policy, help-docs packaging |
| [icons/](./icons/) | Hex Vortex v2 — app `icon.ico` (spectrum), installer `icon-mono.ico`; runtime copies in `electron/icons/` |
| [NEXT-WORK-PLAN.md](./NEXT-WORK-PLAN.md) | **Tracks A–C done** — Picker/legacy, dev UI chrome, runtime switching; possible next tracks listed |

Repo entry points: [../README.md](../README.md), [../STAGING.md](../STAGING.md).

**Project-specific docs** (e.g. voice drivers, collection batch scripts, lore DB) live under each art project's `docs/` folder, not here.
