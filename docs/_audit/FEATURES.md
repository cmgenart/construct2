# Audit — shipped features

Tick as each row is verified against the running UI. User pages are written from this list, not from old design docs.

## Picker

| Feature | Where | User-doc page | Notes |
|---------|--------|---------------|--------|
| Browse roots / Recent / Demos / Projects | tree | PROJECTS | Demos read-only |
| Search | tree | PROJECTS | |
| Double-click open | tree | GETTING-STARTED | |
| Details: path, runtime, source files, provenance | aside | SOURCE / PROJECTS | |
| New project + templates | dialog | SOURCE | includes cc-v3.22-minimal |
| Duplicate to my projects | button / details | PROJECTS | required for demos |
| Import one legacy | dialog | PROJECTS | |
| Batch import | dialog | PROJECTS | |
| Add workspace root | dialog | PROJECTS | |
| Report bug | dialog | TROUBLESHOOTING | GitHub |
| About | dialog | GETTING-STARTED | no Getting Started link today |

## Workbench — left

| Feature | Where | User-doc page | Notes |
|---------|--------|---------------|--------|
| Collections tabs, create/rename | `#section-collections` | COLLECTIONS | `?` exists |
| Piece list, orange/green | `#piece-list-col` | COLLECTIONS | |
| Build / Build all / + / Del | piece toolbar | COLLECTIONS | |
| Script menu | piece toolbar | COLLECTIONS | `collection.js` |
| Auto tab (brief, peers, xAI) | collection auto | COLLECTIONS (light) | extra modals OK |
| Parameters Off / PARAM / Driver | `#section-params` | PARAMETERS | `?` exists |
| PARAM widgets from `//PARAM-*` | panel | PARAMETERS | |
| Custom driver iframe | `parameters/*.html` | PARAMETERS | |
| Values levels + use + auto | `#section-values` | VALUES | `?` exists |
| Properties groups, lock, Random | `#section-props` | PROPERTIES | `?` exists |
| Property levels | level bar | PROPERTIES | |
| Seed | `#seedInput` | BUILD | |
| Runtime select | `#runtime-select` | SOURCE + runtime getting-started | **needs ?** |
| UI zoom | props zoom | THE-WORKBENCH | |
| Viewport BG | seed row | PREVIEW | |

## Workbench — preview

| Feature | Where | User-doc page | Notes |
|---------|--------|---------------|--------|
| Full / Min / UTF8 / Metadata / Analysis | `#visselect` | PREVIEW | **needs ?** |
| Pan / zoom / reset / fullscreen | `#vis-view-controls` | PREVIEW | Full & Min only |
| Theme | `#theme-toggle` | THE-WORKBENCH | |
| Offline badge | `#offline-badge` | TROUBLESHOOTING | |
| Console Build / Art / Both | `#vis-console` | PREVIEW | |
| Collection preview banner | vis area | COLLECTIONS | |

## Authoring (in the files, not a panel)

| Feature | Marker / file | User-doc page |
|---------|----------------|---------------|
| defs / functions / setup / draw / cert | project `.js` | SOURCE |
| metadata.js | CreateMetadata | BUILD (light) |
| `//#` / `/*#` properties | source | PROPERTIES |
| `//PARAM-*` | source | PARAMETERS |
| `/*[values.*]*/` / `/[values.*]/` | source | VALUES |
| `//import<path>` | source → lib fallback | SOURCE |
| `//PROCESS<minify>` | source | BUILD (deep) |

## Gaps (no help today)

- Help menu besides About
- Picker Help
- Runtime `?`
- Preview-mode `?`
- Viewer cannot load `/runtimes/*.md` or `/lib/*.md`
- Overlays point at architecture markdown
