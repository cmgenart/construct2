# AsciiCore — specification (Construct²)

**Status:** v0.2 — experimental  
**Related:** [ASCII-CORE-INTEGRATION.md](./ASCII-CORE-INTEGRATION.md)

---

## 1. Overview

AsciiCore converts a **Canvas Core `Layer`** buffer into a transparent DOM **`<pre>` overlay** aligned to the main canvas. One object, short methods, PropMaster-strippable engines.

```js
//import<AsciiCore.js>

const acLayer = Layer(0.1);
const ac = AsciiCore(acLayer);
ac.sl(ScanGlitch);

// draw
acLayer.On(true);
// … CC drawing …
acLayer.On(false);
ac.txt(AlienFlood(acLayer.cnv.width, acLayer.cnv.height, time, ac.textBlend));
ac.upd();
```

---

## 2. Object API

### Constructor

```js
AsciiCore(layer, x?, y?, w?, h?)
```

| Arg | Default | Role |
|-----|---------|------|
| `layer` | required | `Layer` offscreen buffer |
| `x`, `y`, `w`, `h` | `0`, `0`, `PX`, `PY` | Canvas-space overlay rect |

### Properties (assign directly)

| Property | Default | Role |
|----------|---------|------|
| `layer` | — | Source `Layer` |
| `x`, `y`, `w`, `h` | full canvas | Overlay rect |
| `cols`, `rows` | set in `upd()` | Char grid (= layer pixel size) |
| `engine` | build-time | `"density"` \| `"edge"` \| `"bias"` |
| `ratio` | `0.6` | Monospace char width÷height (layout) |
| `jitter` | `0` | Ramp / edge noise |
| `contrast` | `0` | Brightness stretch before convert |
| `brightness` | `1` | Luminance gain (after contrast) |
| `levelOffset` | `0` | Additive luminance shift (−0.5…0.5) |
| `cutoff` | `0.08` | Below → space (transparent); bias uses this for black areas |
| `textBlend` | `0` | Text layer mix 0–1 |
| `dx`, `dy` | `0` | Pixel nudge (layout) |

### Methods

| Method | Role |
|--------|------|
| `upd()` | Convert layer → buffer → DOM; sync layout |
| `sl(fn)` | Scanline shader: `fn(ac, y, row)` mutates row |
| `ch(fn)` | Char shader: `fn(x, y, ch, …)` → char \| `null` |
| `txt(s)` | Text layer: string or `fn(ac)` |
| `vis(on)` | Show/hide overlay |

### Pipeline (`upd`)

1. **Engine convert** — `AsciiConvert(ac, cols, rows, img)`
2. **Text blend** — `_blendTxt` via `textBlend`
3. **Post** — `sl` then `ch`
4. **DOM** — `pre.textContent`

---

## 3. Engines (build-time)

Chosen via PropMaster **`//#<<Ascii>engine:…>`** in `setup.js`. Only one engine file is imported per build.

| Engine | File | Role |
|--------|------|------|
| **density** | `AsciiEngine_density.js` | Brightness → ramp ` .:-=+*#%@` |
| **edge** | `AsciiEngine_edge.js` | Sobel-lite gradients → `\|/-\` (+ optional directional) |
| **bias** | `AsciiEngine_bias.js` | 8×8 brightness×angle → 64-char lookup (`BIAS64`) |

### Property markers (`setup.js`)

```js
//#<<Ascii>engine:density>
//#<<Ascii>directional:off>
```

| Property | Values | Notes |
|----------|--------|-------|
| `engine` | `density`, `edge`, `bias` | Exactly one active per build |
| `directional` | `off`, `on` | Edge engine only; richer line chars when `on` |

Switch engines in **Properties** panel → rebuild. Unused engine files are stripped from output.

### Future: full bias map

Production bias engine will replace `BIAS64` with an offline-baked table (target under 2 KB encoded). Current `bias` engine validates the 8×8 angle×brightness grid approach.

---

## 4. Layout

- Overlay: `position: fixed`, placed via canvas `getBoundingClientRect()`
- `ratio` default **0.6** — horizontal `scaleX` so char grid matches square pixels
- Transparent host + `<pre>` — spaces show main canvas through overlay

---

## 5. Parameters (`defs.js`)

| Param | Default | Role |
|-------|---------|------|
| `textBlend` | `0` | Alien text flood |
| `jitter` | `0` | Conversion noise + scanline glitch |
| `contrast` | `0` | Sharper ramps / edges |
| `brightness` | `1` | Luminance gain |
| `levelOffset` | `0` | Shift which bias band / ramp tier applies |
| `cutoff` | `0.08` | Dark threshold → space (transparent overlay) |
| `charRatio` | `0.6` | Override layout ratio |

---

## 6. File layout

```
art/AsciiCore/
  AsciiCore.js              ← factory, layout, pipeline
  AsciiEngine_density.js    ← imported when engine:density
  AsciiEngine_edge.js       ← engine:edge
  AsciiEngine_bias.js       ← engine:bias
  setup.js                  ← //import + property markers
  functions.js              ← AlignTest, AlienFlood, ScanGlitch, …
  draw.js
  defs.js
```

**Import rule:** never write literal import-tag text inside comments in library files.

---

## 7. Size budget (indicative)

Measure **`output.output_min.html`** after rebuild (Full → Min in visualiser). Targets are for **AsciiCore stack only** (engines + overlay), not whole piece.

| Build profile | Engines included | Budget (guideline) |
|---------------|------------------|--------------------|
| **density only** | `AsciiEngine_density.js` | ~1.2–1.8 KB minified |
| **edge** | + edge + optional directional branch | ~1.6–2.2 KB |
| **bias** | + 64-char table + atan2 | ~2.0–2.8 KB |

Whole-piece on-chain target remains **≤14 KB** total HTML; AsciiCore should stay **≤3 KB** minified so hybrid pieces still have budget for draw + CC3.

Record actual sizes in Properties-driven builds:

| Profile | `engine` | `directional` | Min HTML (chars) | Notes |
|---------|----------|---------------|------------------|-------|
| Default | density | off | **7724** | Current dev default |
| Edge | edge | off | **7873** | +149 vs density |
| Edge+ | edge | on | **7938** | +214 vs density |
| Bias | bias | — | **7953** | +229 vs density |

Measure with `node construct2/build-ascii-profiles.js` (whole piece min HTML, CC3.23 base included).

---

## 8. Promotion path (Phase 6 — done)

Shared library at `construct2/lib/` (`AsciiCore.js`, `AsciiEngine_*.js`). Resolution: **project root → lib fallback**. Dev in `art/AsciiCore/` overrides lib until copied.

Optional later: inline into `cc3.24+` behind `//#<<Ascii>…`.

---

## 9. Construct Sequence

Drive from iframe art params: `textBlend`, `jitter`, `contrast`, `brightness`, `levelOffset`, `cutoff`, `charRatio`. Sequence groups post bare-map patches per [PARAM-SPEC.md](../PARAM-SPEC.md) §8.

---

## 10. References

| Resource | Path |
|----------|------|
| Integration | [ASCII-CORE-INTEGRATION.md](./ASCII-CORE-INTEGRATION.md) |
| PropMaster | [PROPERTIES-PANEL.md](../PROPERTIES-PANEL.md) |
| UTF8link | [UTF8LINK-METADATA.md](../UTF8LINK-METADATA.md) |
