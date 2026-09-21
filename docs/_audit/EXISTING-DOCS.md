# Audit — existing `docs/` pile

**Rule:** after user pages exist, `?` and Help must not link these unless marked user-facing.

| File | Verdict | Feeds |
|------|---------|--------|
| DOCUMENTATION-PLAN.md | keep — this programme | — |
| `_audit/*` | keep until Phase 5 | all user pages |
| README.md | rewrite as user vs internal index | — |
| CORE.md | internal architecture | SOURCE, BUILD, runtime getting-started |
| PARAM-SPEC.md | internal; rewrite into PARAMETERS.md | PARAMETERS |
| PARAM-COLOR-PLAN/IMPL/TEST.md | archive (plans / QA) | — |
| PARAM-VEC2-PLAN.md | archive — not shipped | — |
| UI-COLOUR-REVIEW.md | internal theming | — |
| UTF8LINK-METADATA.md | internal | BUILD (deep), PREVIEW UTF8 |
| VALUES-PANEL.md | rewrite → VALUES.md | VALUES |
| PROPERTIES-PANEL.md | rewrite → PROPERTIES.md | PROPERTIES |
| METADATA-BUILDER.md | internal | BUILD (light) |
| COLLECTION-SCRIPTS.md | internal / deep COLLECTIONS | COLLECTIONS |
| PROJECT-DATABASE.md | archive — not shipped | — |
| VISUALISER.md | rewrite → PREVIEW.md | PREVIEW |
| PIECE-LIST-UX.md | merge into COLLECTIONS | COLLECTIONS |
| VISUALIZER-CONSOLE.md | merge into PREVIEW | PREVIEW |
| VIEWPORT-BACKGROUND.md | merge into PREVIEW | PREVIEW |
| VIEW-NAVIGATION-CONTROLS.md | merge into PREVIEW | PREVIEW |
| PROPERTY-ANALYSIS.md | PREVIEW Analysis (deep) | PREVIEW |
| COLLECTION-DESIGN.md | archive (v1) | — |
| COLLECTION-DESIGN-V2.md | internal; rewrite → COLLECTIONS.md | COLLECTIONS |
| MINT-READY-BUNDLE.md | archive — no UI | — |
| CLOUD-MINTING-INTERFACE.md | archive — no UI | — |
| EXTRA-RUNTIMES.md | internal WIP — not user | — |
| docs/runtimes/ASCII-CORE-* | superseded by lib siblings | AsciiCore pages |
| COLLECTION-GENERATOR-PLUGINS.md | already superseded | — |
| AUTO-GENERATION.md | COLLECTIONS Auto (light) | COLLECTIONS |
| SAVED-PIECES-DESIGN.md | archive — not shipped | — |
| PARAMETER-DRIVERS-DESIGN.md | PARAMETERS Driver (deep) | PARAMETERS |
| MINOR-UPGRADES-PLAN.md | archive | — |
| PROJECTS-STARTUP-DESIGN.md | rewrite → PROJECTS.md | PROJECTS, GETTING-STARTED |
| DEMO-PROJECTS.md | merge into PROJECTS | PROJECTS |
| NEXT-WORK-PLAN.md | archive / keep as eng plan | — |
| RELEASE-FEATURES-PLAN.md | stale vs 0.1.1 — archive | — |
| runtimes/README.md | engineer note | — |
| lib/README.md | engineer note | — |
| templates/DRIVERS_README.txt | driver authors | PARAMETERS |

`audit_canvascore.md` / `audit_builder.md` referenced from CORE.md **do not exist** in this tree. This folder replaces them.
