# Audit — AsciiCore (`lib/`)

**Source of truth:** `lib/AsciiCore.js`, `AsciiEngine_density.js`, `AsciiEngine_edge.js`, `AsciiEngine_bias.js`  
**Old spec:** `docs/runtimes/ASCII-CORE-SPEC.md` — useful, slightly stale (art/AsciiCore layout, size table, Sequence).  
**Template in this release:** `templates/projects/cc-v3-ascii` — currently just `Canvas(1000,1000,0)` plus `//import` in the project files (check `functions.js` / `defs.js` when writing the getting-started; do not assume the spec’s AlienFlood sample is in the template).

## Resolve

`//import<AsciiCore.js>` → project root first, then `construct2/lib/`. Engines are imported from *inside* `AsciiCore.js` behind PropMaster branches, so switching **Properties → Ascii → engine** rebuilds which engine file is inlined.

## Constructor

`AsciiCore(layer, x?, y?, w?, h?)`

- `layer` — a CC3 `Layer` (offscreen canvas).
- Overlay rect defaults `0, 0, PX, PY`.
- Hosts a `position:fixed` `<div><pre>` after the main canvas (`z-index: 20`, `pointer-events: none`).
- Calls `OnResize(() => ac.upd())`.

## Properties (assign on the object)

| Name | Default | Role |
|------|---------|------|
| `layer` | arg | Source buffer |
| `x y w h` | full canvas | Overlay in canvas space |
| `cols rows` | set in `upd` | = layer pixel size |
| `engine` | build-time branch | `"density"` \| `"edge"` \| `"bias"` |
| `jitter` | 0 | Noise on convert |
| `contrast` | 0 | Stretch luminance / edge mag |
| `brightness` | 1 | Gain after contrast |
| `levelOffset` | 0 | Additive lum |
| `cutoff` | 0.08 | Below → space (transparent) |
| `textBlend` | 0 | Mix text layer |
| `ratio` | 0.6 | Monospace width/height for layout |
| `dx dy` | 0 | Pixel nudge |

## Methods

| Method | Role |
|--------|------|
| `upd()` | convert → blend text → sl/ch → `pre.textContent` |
| `sl(fn)` | scanline: `fn(ac, y, row)` |
| `ch(fn)` | per char: `fn(x,y,ch,…)` → char or null |
| `txt(s\|fn)` | text layer |
| `vis(on)` | show/hide host |

Pipeline in `upd`: `AsciiConvert` (from the active engine) → `_blendTxt` → `_post` → DOM.

## Engines

| Id | File | Convert |
|----|------|---------|
| density | `AsciiEngine_density.js` | lum → ramp ` .:-=+*#%@` |
| edge | `AsciiEngine_edge.js` | Sobel-ish → `-/|\` ; `//#<<Ascii>directional:on>` richer set |
| bias | `AsciiEngine_bias.js` | 8×8 brightness×angle → `BIAS64` (64 chars) |

Shared: `AsciiLum(img, cols, x, y)` average RGB.

## Not in the lib (spec-only / project art)

`ScanGlitch`, `AlienFlood`, PARAM rows in `defs.js`, Construct Sequence — those belong to a project (e.g. `art/AsciiCore`), not the shipped `lib/` files. User getting-started should use the **template + this API**, not the old art-folder tour unless that project is bundled as a demo.
