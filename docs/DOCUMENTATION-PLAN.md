# Construct² documentation plan

**Status:** Phase 4 wired — user pages, runtime/lib siblings, Help menu, picker Help, workbench `?`, viewer routes. Technical group lives on the user help home. Root `cc3.html` / `cc3.23.html` removed.
**Audience of this file:** us (Charles + agent). Not shipped as user help.  
**Shipped user help** starts after the audit locks the structure below.

The existing `docs/*.md` pile is mostly architecture and plans. It is useful for building the app and almost useless for someone who just installed Construct². The audit is the new source of truth. User-facing pages are written from the audit, not by polishing the old specs.

---

## 1. Voice

Every user-facing section:

1. **Opens simply.** A non-technical reader should know what the thing *is* and why they would touch it, in a few sentences. No `postMessage`, no `dev.json`.
2. **Goes deeper later.** Markers, APIs, levels, wire formats live under a heading like “If you write code” or “Reference”.
3. **Is nice to read.** Short, clear, a little amusing — not a joke book, not a compiler manual.

Audit pages can stay dry. They are inventories, not essays.

---

## 2. Where things live

Three homes, one rule: **docs sit next to the thing they describe.**

```
docs/user/                         Construct² the app
  README.md                        Help home / contents
  GETTING-STARTED.md
  PROJECTS.md                      picker, roots, demos, new / duplicate / import
  THE-WORKBENCH.md                 the open-project window
  COLLECTIONS.md
  PARAMETERS.md
  VALUES.md
  PROPERTIES.md
  PREVIEW.md                       Full / Min / UTF8 / Metadata / Analysis, pan/zoom, console
  SOURCE.md                        project files, //import, templates
  BUILD.md                         what a build is, seed, output
  TROUBLESHOOTING.md               offline badge, read-only demos, reporting a bug

runtimes/
  cc-v3.23.html
  cc-v3.23.getting-started.md      first hour of Canvas Core 3.23
  cc-v3.23.reference.md            full API + Cxx abbreviations (one file)

lib/
  AsciiCore.js
  AsciiCore.getting-started.md
  AsciiCore.reference.md

docs/_audit/                       inventories — source of truth until user pages exist
  APP.md
  FEATURES.md
  RUNTIME-cc-v3.md
  LIB-AsciiCore.md
  EXISTING-DOCS.md

docs/internal/                     leftover engineering notes (after archive)
```

**Abbreviations** stay inside `cc-v3.23.reference.md`. They are how CC3 talks to the canvas. Other runtimes will not have that table, so they should not be forced to ship an empty `_abbreviations.md`.

**cc-v3.22** is in the installer and as a New-project template, but it is hidden in the runtime dropdown. Write the full book only for **cc-v3 (3.23)**. If the 3.22 template stays in the release, add a short `cc-v3.22.getting-started.md` that says “same as 3.23 except …” after the audit lists the real diffs. Do not maintain two full references.

**p5 / Three / extra runtimes** are not in this release. No docs.

---

## 3. How the user opens help

Help has to be one click from wherever they are. The in-app viewer (`doc_viewer.js`) already renders markdown; it only serves `/docs/` today. Extend it so these also open in the same overlay:

| URL | Files |
|-----|--------|
| `/docs/user/…` | app help |
| `/runtimes/cc-v3.23.getting-started.md` (etc.) | runtime siblings |
| `/lib/AsciiCore.getting-started.md` (etc.) | lib siblings |

`?` overlays stay **short** (the friendly intro). A “Open the full guide” link opens the viewer. Do not dump architecture specs into the overlay.

### 3.1 New and changed buttons

| Where | Control | Opens |
|-------|---------|--------|
| **Help menu** (now only About) | Getting Started, User guide, Canvas Core, AsciiCore, Report a bug, About | viewer / existing dialogs |
| **Picker header** | **Help** next to About | `docs/user/README.md` |
| **Picker actions** | keep Report bug / About; Help is enough | — |
| **Runtime dropdown** | new `?` to the right of `#runtime-select` | current runtime’s getting-started, or project-core note |
| **Collections / Parameters / Values / Properties** | existing `?` | rewrite overlay → user page, not `COLLECTION-DESIGN-V2.md` |
| **Preview toolbar** | new `?` by Full / Min / UTF8 / … | `PREVIEW.md` |
| **Console bar** | small `?` or a line in Preview help | `PREVIEW.md` § console |
| **Project details (picker)** | “What’s a source file?” link | `SOURCE.md` |
| **New project dialog** | one-line help under Template | `SOURCE.md` § templates + runtime getting-started |
| **About** | one sentence + “Getting Started” | `GETTING-STARTED.md` |

Runtime `?` is the important new one: the dropdown already picks the core; help must follow that pick (`cc-v3` vs project `core.html`).

### 3.2 What we will not add

- A second documentation app.
- Tooltips on every slider (the `?` + viewer is enough for alpha).
- Shipping the old design pile as the user manual. Installer already includes `docs/**/*.md`; after rewrite, **only `docs/user/` plus runtime/lib siblings** should be linked from the UI. Internal notes can stay on disk without being advertised.

---

## 4. Documentation we still need to finish

### 4.1 Audit (write first — supersedes existing docs)

| File | What it captures |
|------|------------------|
| `_audit/APP.md` | Windows: picker vs workbench, userData (`Construct²` vs `-dev`), Documents projects, bundled Demos, menus, About, bug reporter |
| `_audit/FEATURES.md` | Every control that ships: New / Duplicate / Import / Batch / Add root; seed; viewport BG; theme; runtime select; four left panels; piece list; Script; preview modes; pan/zoom/fullscreen; console; xAI; auto-fill; property Random / lock / levels; values levels; param Off / PARAM / Driver |
| `_audit/RUNTIME-cc-v3.23.md` | Boot, inserts, `Canvas()`, loop (`time` / `draw` return), mouse + `cc_InteractFn`, `OnParam` hold, full public API extracted from `runtimes/cc-v3.23.html`, Cxx table |
| `_audit/LIB-AsciiCore.md` | Factory, engines, overlay, `//import` resolve, what the ascii template actually stubs |
| `_audit/EXISTING-DOCS.md` | Keep / rewrite / archive for each current `docs/*.md` |

If the code and an old spec disagree, **the code wins**. Update the audit, not the spec.

### 4.2 Construct² user pages (from the audit)

| Page | Covers | First-paragraph promise |
|------|--------|-------------------------|
| `GETTING-STARTED.md` | install → Demos → Duplicate → change a property → see it draw | “You installed a workshop. Open a demo and poke it.” |
| `PROJECTS.md` | roots, Recent, Demos vs your projects, New, Duplicate, Import, read-only | “Projects live in folders. Demos are ours; copies are yours.” |
| `THE-WORKBENCH.md` | left panels, preview, console, theme, zoom, Close / Duplicate | “This is the desk. Art on the right, knobs on the left.” |
| `COLLECTIONS.md` | tabs, piece list colours, Build, Auto (lightly) | “A collection is a numbered set of cousins of the same piece.” |
| `PARAMETERS.md` | live knobs vs build-time values; PARAM vs Driver | “These change the art *now*, without a rebuild.” |
| `VALUES.md` | default / collection / piece; inserts in prose | “These get baked in when you build — name, seed, story.” |
| `PROPERTIES.md` | branches, lock, Random, groups | “Properties are forks in the code. Random walks the unlocked ones.” |
| `PREVIEW.md` | Full vs Min vs UTF8 vs Metadata vs Analysis; pan/zoom; console | “Full is the picture. The other tabs are the luggage label.” |
| `SOURCE.md` | defs / functions / setup / draw / cert / metadata; `//import`; templates | “A piece is a few small files the builder stitches together.” |
| `BUILD.md` | seed, rebuild, output, what Min means | “Build is ‘make the file someone else can open’.” |
| `TROUBLESHOOTING.md` | no demos, read-only, offline, ARM/x64, report a bug | “When it sulks.” |

### 4.3 Runtime (released cores only)

| File | Covers |
|------|--------|
| `runtimes/cc-v3.23.getting-started.md` | `Canvas()`, `time`, `draw` returning 0/1, first rectangle, seed, cert-on-click, talking to Parameters |
| `runtimes/cc-v3.23.reference.md` | Abbreviations (Cxx) first — they are the dialect — then loops, colour, math, draw helpers, layers, fields, RNG, params, mouse |

Optional: `cc-v3.22.getting-started.md` (diff only).

### 4.4 Lib (what ships)

| File | Covers |
|------|--------|
| `lib/AsciiCore.getting-started.md` | Why an overlay, the ascii template, one density pass |
| `lib/AsciiCore.reference.md` | Constructor, engines, properties, methods — rewritten from `docs/runtimes/ASCII-CORE-SPEC.md` after audit |

---

## 5. What we are *not* documenting for this release

These exist as design notes. They are not in the user help set until they ship in the UI.

- Saved pieces, cloud minting, mint-ready zip export (no export button yet)
- Project lore database
- PARAM-VEC2
- Extra runtimes (p5, Three, ASCII-as-a-runtime)
- Classic `.builder` vs advBuilder
- Collection generator plugins (already marked superseded)
- Colour-implementation / QA checklists (keep as internal if still useful)

---

## 6. How the audit supersedes the old pile

| Current file | After rewrite |
|--------------|----------------|
| `CORE.md` | Internal architecture only; user never sees it from `?` |
| `PARAM-SPEC.md`, `PROPERTIES-PANEL.md`, `VALUES-PANEL.md`, `COLLECTION-DESIGN-V2.md`, `VISUALISER.md`, … | Feed the audit, then the user page. Move to `docs/internal/` or leave unlinked |
| `PARAM-COLOR-PLAN.md`, `NEXT-WORK-PLAN.md`, `RELEASE-FEATURES-PLAN.md`, `COLLECTION-DESIGN.md` (v1) | Archive — plans, not manuals |
| `docs/runtimes/ASCII-CORE-SPEC.md` | Replaced by `lib/AsciiCore.reference.md` |
| `docs/README.md` | Becomes a pointer: user help vs internal |
| `runtimes/README.md` | Keep as engineer note; user uses sibling `.md` |
| `SECTION_HELP` in `dev-ui.html` | Rewritten to the short intro + user-page links |

Do not rewrite Charles’s wording in old files. Copy facts into the audit; leave the old file until the user page exists, then mark it **Superseded**.

---

## 7. Phases

| Phase | Done when |
|-------|-----------|
| **1. Audit** | Five `_audit/*.md` files match the running 0.1.1 app, `cc-v3.23.html`, and `lib/AsciiCore*.js` |
| **2. Lock structure** | This plan’s paths and help buttons confirmed (tweak if the audit found a missing surface) |
| **3. Write** | All §4.2–4.4 pages exist, with a simple intro on each |
| **4. Wire** | Help menu, picker Help, runtime `?`, preview `?`, overlays retargeted, viewer serves `/runtimes/` and `/lib/` |
| **5. Retire** | `SECTION_HELP` no longer links design specs; `docs/README.md` splits user vs internal |

Installer already packs `docs/**/*.md` and `runtimes/**/*`. Sibling runtime/lib markdown ships for free. `doc_viewer` and the Help menu are the work in Phase 4.

---

## 8. Help button map (target)

```
Picker
  [Help] [About]
  tree actions: New  Duplicate  Import  Batch  Add root  Report bug

Workbench
  runtime-select [?]          →  runtimes/<id>.getting-started.md
  Collections [?]             →  docs/user/COLLECTIONS.md
  Parameters  [?]             →  docs/user/PARAMETERS.md
  Values      [?]             →  docs/user/VALUES.md
  Properties  [?]             →  docs/user/PROPERTIES.md
  Full Min UTF8 Metadata Analysis [?]  →  docs/user/PREVIEW.md

Menu bar
  Help → Getting Started | User guide | Canvas Core | AsciiCore | Report a bug | About
```
