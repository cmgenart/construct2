# Extra runtimes — p5.js & Three.js (WIP)

**Status:** experimental, **deactivated** in the live Construct² toolchain.

Prototype framework runtimes and templates live under [`wip/extra-runtimes/`](../wip/extra-runtimes/). They are **not** registered in:

- [`runtimes/manifest.json`](../runtimes/manifest.json) — runtime dropdown, effective core resolution
- [`templates/projects/manifest.json`](../templates/projects/manifest.json) — New project scaffolds

Canvas Core (`cc-v3`) remains the only supported first-class runtime for production work.

---

## 1. What exists

Four runtime shells (embedded vs external lib loading) and four matching demo templates:

| Runtime ID | Lib loading | Demo |
|------------|-------------|------|
| `p5-embedded` | p5 v2.2.3 inlined at build via `//import<p5.min.js>` | Noise flow-field particle trails |
| `p5-external` | p5 from jsDelivr CDN | Same art |
| `three-embedded` | Three v0.177.0 inlined via `//import<three.module.min.js>` + blob URL loader | Breathing colour cube grid |
| `three-external` | Three ES module + import map from CDN | Same art |

**On disk:** a deactivated `wip/extra-runtimes/` folder (not shipped). Layout, CDN URLs, and manual test steps stay with that folder when it exists.

---

## 2. Why deactivated

These runtimes were scaffolded to explore **non–Canvas-Core** frameworks inside Construct²’s insert / build pipeline. They are useful as reference but are **not production-ready** because several platform assumptions still target Canvas Core only:

| Area | Gap |
|------|-----|
| **Runtime registry** | `project_runtime.js` only loads `construct2/runtimes/manifest.json`; no WIP path |
| **Template picker** | `project_scaffold.js` only reads `templates/projects/manifest.json` |
| **Insert contract** | Builder expects CC insert names; p5 uses global `setup()` / `draw()`; Three uses ES module scope |
| **Size / mint profiles** | Embedded p5 adds ~940 KB; no preflight warnings wired for framework shells |
| **Dev UI** | Runtime dropdown has no “Framework” group; no runtime-specific help docs |
| **Lib resolution** | Embedded `//import<>` resolves from `construct2/lib/`; WIP libs live in `wip/extra-runtimes/lib/` until copied |
| **Minify / modules** | Three external uses `type="module"`; Terser / quote-normalization behaviour untested on these shells |
| **Collections / fingerprint** | Effective-core snapshots and `_source/` not validated with framework cores |
| **Cert / params** | OnParam bridge copied from CC; cert insert not implemented for p5/three |

Keeping assets under `wip/` avoids accidental selection in the dev UI, broken scaffolds, and oversized builds until the gaps above are addressed.

---

## 3. Runtime design

### 3.1 Embedded vs external

| Mode | Build output | View requirement |
|------|--------------|------------------|
| **Embedded** | Single HTML; library inlined at build via `//import<>` | Offline OK |
| **External** | Small HTML; `<script src>` or import map points at CDN | Network required at view time |

**CDN (jsDelivr):**

- p5: `https://cdn.jsdelivr.net/npm/p5@2/lib/p5.min.js` (pin `@2.2.3` for reproducibility)
- Three: `https://cdn.jsdelivr.net/npm/three@0.177.0/build/three.module.min.js`
- Three addons: `https://cdn.jsdelivr.net/npm/three@0.177.0/examples/jsm/`

### 3.2 Codeblocks

Both families expose the standard Construct insert names:

| Insert | p5.js | Three.js |
|--------|-------|----------|
| `defs` | Globals, constants | Module-scope vars |
| `functions` | Helpers | Helpers |
| `setup` | Full `function setup() { … }` | Scene, camera, renderer, meshes |
| `draw` | Full `function draw() { … }` | Per-frame body inside `requestAnimationFrame` loop |

`cert` is not used in the WIP templates. `SEED` comes from `/*[values.seed]*/`; `OnParam` / `SendParams` mirror Canvas Core.

### 3.3 Embedded library inlining

Embedded shells use `//import<>` tags. At build time, [`import_resolve.js`](../import_resolve.js) inlines files from the project root or **`construct2/lib/`**.

**Important:** WIP vendored files are in `wip/extra-runtimes/lib/`. For embedded builds to work, copy them into `construct2/lib/` (or extend import resolution — see §5).

A fix in `import_resolve.js` uses a replacer function for `String.replace` so minified libs containing `$` sequences (common in p5) do not corrupt inlined output. That fix applies to all `//import<>` usage, including Canvas Core.

---

## 4. Manual experimentation

Without activating the WIP manifests:

1. Copy a runtime from `wip/extra-runtimes/runtimes/*.html` into a project as `core.html`.
2. Copy JS from the matching folder under `wip/extra-runtimes/templates/projects/<id>/`.
3. For embedded variants, copy `wip/extra-runtimes/lib/*.min.js` → `construct2/lib/`.
4. Set `"runtime": "project-core"` in `project.json`.
5. Open the project in advBuilder and build.

External variants need CDN access in the preview iframe.

---

## 5. Activation checklist (future)

When promoting these to first-class runtimes:

### 5.1 File moves & manifests

- [ ] Copy `wip/extra-runtimes/runtimes/*.html` → `construct2/runtimes/`
- [ ] Merge `wip/extra-runtimes/runtimes/manifest.json` entries into `construct2/runtimes/manifest.json`
- [ ] Copy template folders → `construct2/templates/projects/`
- [ ] Merge `wip/extra-runtimes/templates/projects/manifest.json` entries into live template manifest
- [ ] Copy `p5.min.js` / `three.module.min.js` → `construct2/lib/` (embedded only)
- [ ] Run `project_runtime.test.js` and scaffold smoke tests

### 5.2 Platform work

- [ ] **Runtime groups** — optional `framework` group in dev UI dropdown ([`project_runtime.js`](../project_runtime.js), `dev-ui.html`)
- [ ] **Scaffold** — ensure `resolveRuntimeFile()` resolves new manifest ids ([`project_scaffold.js`](../project_scaffold.js))
- [ ] **Build validation** — test full/minify pipeline on embedded p5 (large output) and three module scripts
- [ ] **Mint preflight** — size warnings for embedded framework cores ([MINT-READY-BUNDLE.md](./MINT-READY-BUNDLE.md))
- [ ] **Lib manifest** — optional `lib/manifest.json` for framework deps and export reproducibility
- [ ] **Runtime help** — `docs/runtimes/p5.md`, `docs/runtimes/three.md`
- [ ] **WIP import path** (optional) — allow `//import<>` fallback from `wip/extra-runtimes/lib/` during development without copying libs

### 5.3 Optional cleanup

- [ ] Remove or archive `wip/extra-runtimes/` after promotion (or keep as staging for the next framework)
- [ ] Add example projects under `art/` using promoted templates

---

## 6. Related docs

| Document | Relevance |
|----------|-----------|
| [CORE.md](./CORE.md) §6.1.1 | Runtime selection model (Canvas Core today) |
| [runtimes/README.md](../runtimes/README.md) | Live runtime registry |
| [MINT-READY-BUNDLE.md](./MINT-READY-BUNDLE.md) | Offline mint-ready bundle |
| [PROJECTS-STARTUP-DESIGN.md](./PROJECTS-STARTUP-DESIGN.md) | Templates and runtime dropdown |

---

*Last updated: 2026-06-28 — p5/three prototypes moved to `wip/extra-runtimes/`.*
