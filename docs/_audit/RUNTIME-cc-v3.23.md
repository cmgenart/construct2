# Audit — Canvas Core 3.23 (`runtimes/cc-v3.23.html`)

**Source of truth:** `runtimes/cc-v3.23.html` (`cc_version = "3.23"`)  
**Not user prose.** Feed `cc-v3.23.getting-started.md` + `cc-v3.23.reference.md`.

## Boot

1. Two `<canvas>` elements when `//#<<Debug>debug_cert:on>` (art + cert). Cert canvas is CONTEXT[1].
2. `BEGIN` → fixed-FPS `requestAnimationFrame` (`FPS` default 30).
3. First tick (or `Reset`) calls `ART()`: `RN = RNG()`, then inserts **defs → functions → setup**, defines per-frame `draw`, optional `MakeCert`.
4. Each frame: `time = frame++ * (dt = 1/FPS)`; `draw` until it returns `1` (done). `0` = keep drawing.

Art **must** call `Canvas(w, h, border)` in setup. That sets `PX`, `PY`, `HX`, `HY`.

## Build-time inserts (not browser syntax)

| Insert | Typical file |
|--------|----------------|
| `defs` | `defs.js` |
| `functions` | `functions.js` |
| `setup` | `setup.js` |
| `draw` | `draw.js` — return `0` or `1` |
| `cert` | `cert.js` — back of canvas when cert is on |

Builder also interprets `//#` properties, `//PARAM-*`, `/*[values.*]*/`, `//import`, `//PROCESS<minify>` (see FEATURES.md). Those are Construct², not this HTML.

## Core Debug properties (in the runtime itself)

| Property | Effect |
|----------|--------|
| `debug_cert` on/off | Second canvas + `MakeCert` / click-to-flip |
| `debug_canvas_input` on/off | Extra mouse/touch that drives cert visibility |

## Loop / globals art reads

| Name | Meaning |
|------|---------|
| `SEED` | Build insert `/*[piece.seed]*/`, default 0 |
| `RN` | `RNG()` created at ART() |
| `FPS`, `frame`, `time`, `dt` | Clock |
| `PX`, `PY`, `HX`, `HY` | Coord space after `Canvas()` |
| `mouseX`, `mouseY`, `mouseHeld`, `mousePos` | Always updated (even if cert input off) |
| `cc_InteractFn` | Default `() => 1`. Return truthy to show cert on click. Art may replace this. |
| `CONTEXT` | `[[canvas, ctx2d], …]` |
| `cnv`, `ctx` | Current canvas / context |
| `cc_version` | `"3.23"` |

## Parameters

| Name | Behaviour |
|------|-----------|
| `SendParams(map)` | `parent.postMessage` (typed messages ignored inbound) |
| `OnParam(fn)` | `fn(key, value)` for each pair. If a bare map arrived first, last map is held in `cc_paramHold` and flushed here. |
| `cc_onParam` | Same slot; assign directly if preferred |

## Canvas / frame

| Name | Signature / notes |
|------|-------------------|
| `Canvas(w, h, border)` | Required in setup. Frames all CONTEXT canvases. |
| `Frame(keep_current_res?)` | Fit canvas CSS to window |
| `CanvasShadow(col, radius)` | CSS box-shadow |
| `CanvasWall(col)` | `document.body.bgColor` |
| `Reset(delay=1)` | Re-run ART after n frames |
| `ResetTransform(r?)` | `setTransform` for resolution scale |
| `OnResize(fn)` | Replaces default resize hook |
| `cc_SaveImage(name)` | Download art PNG |
| `cc_PixelPerfect`, `cc_Resolution`, `cc_MaxDPR`, `cc_Border` | Display |

## Cxx abbreviations (ctx)

Prefix `C` + two-letter code. First list = **assign** `ctx.prop = v`. Second list = **call** `ctx.fn(...)`.

**Assign**

| Code | ctx |
|------|-----|
| `CGC` | `globalCompositeOperation` |
| `CGA` | `globalAlpha` |
| `CLC` | `lineCap` |
| `CSb` | `shadowBlur` |
| `CLW` | `lineWidth` |
| `CTA` | `textAlign` |
| `CTB` | `textBaseline` |
| `CSC` | `shadowColor` |
| `CSS` | `strokeStyle` |
| `CFS` | `fillStyle` |

**Call**

| Code | ctx |
|------|-----|
| `CLD` | `setLineDash` |
| `CLP` | `clip` |
| `CRT` | `rect` |
| `CGT` | `getTransform` |
| `CDI` | `drawImage` |
| `CFT` | `fillText` |
| `CEL` | `ellipse` |
| `CBP` | `beginPath` |
| `CCP` | `closePath` |
| `CMT` | `moveTo` |
| `CLT` | `lineTo` |
| `CST` | `stroke` |
| `CVS` | `save` |
| `CVR` | `restore` |
| `CTR` | `setTransform` |
| `CXT` | `translate` |
| `CXS` | `scale` |
| `CXR` | `rotate` |
| `CFR` | `fillRect` |
| `CRE` | `rect` (same as `CRT`) |
| `CFL` | `fill` |

Also: `CSB(e)` = shadow blur × `cc_Resolution`; `CCX(ctx)` switch context; `CTC` deprecated alias of `CLP`.

`Math.*` is copied onto `globalThis` (`sin`, `PI`, `round`, …).

## Loops

| Name | Args |
|------|------|
| `For(v, a, b)` | `v` from current to `< a`; `b(v, v/(a-1), v/a)` |
| `FoE(arr, fn)` | foreach; `fn(item, i, t, p)` |
| `FoP(obj, fn)` | entries; `fn(key, val, t, p)` |
| `Loop(n, f)` | `For(0, n, f)` |
| `Map(arr, f)` | map with extra `t`, `p` |
| `FillArray(n, fn)` | |

## Colour

**Prefer:** `cHSVA`, `cRGBA`, `cHSLA`, `cMono`, `cHex`  
**Retire:** `cR`, `cH`, `cM`, `cHx`

Converts: `HEX_to_RGB`, `RGB_to_HEX`, `RGB_to_HSV`, `HSV_to_RGB`.

Colour theory: `CT_HSV` → `.H` `.S` `.V` `.C()` `.HSV()` `.cpy()`; `CT_Cmp` `CT_Tri` `CT_Ana` `CT_Spl` `CT_Tet` `CT_Mon` `CT_Squ` `CT_Com` `CT_Viv` `CT_All` `CT_Palette` `CT_Make`.

Gradients: `RadialGrad`, `LinearGrad`, `FuncGrad`.

Named strings: `WHITE`, `BLACK`, `GREEN`, `GREY`, `LIGHTGREY`, plus `CENTER`, `LEFT`, `RIGHT`, `MIDDLE`, `ROUND`.

## Math / envelopes

`TAU`, `Lerp`, `Clamp`, `Ease`, `Wrap`, `Mapf`, `Quant`, `Lerpv`, `QPath`, `Slerp`, `FlipFlop`, `ArrOp`, `ArrMul`, `ArrLerp`, `ArrLerpSl`, `ArrAdd`, `ArrRound`.

`Ev_Linear`, `Ev_Quad`, `Ev_Cubic`, `Ev_Sine`, `Ev_Exp`, `Ev_Inv`, `Ev_Clamp`, `Ev_Ping`, `Ev_Wrap`, `Ev_Bounce`, `Ev_Step`, `Ev_Mul`.

Path helpers: `subDivWithWeights`, `weightedRelax`, `SubDivRelax`, `ForPath`.

## Draw helpers

`RECT(col, x, y, w, h)`, `TXT(col, size, …fillTextArgs)`, `ELI`, `Circle`, `CircleExt`, `Pill`, `CentreText`, `Shadow`, `Extents`, `ADD` (screen), `MUL` (source-over), `FNT`, `CWH`, `DCE`, `DGE`, `Log`, `CGX`, `CEV`, `Transform`, `Timer`, `ShowTransform`, `DrawTable`, `DrawCanvasInfo`, `GetCanvasInfo`.

## Layers / fields / vectors / RNG

| Name | Notes |
|------|--------|
| `Layer(maxR=16, "2d")` | `{ cnv, ctx, On(bool), Draw() }` |
| `LayerGL(maxRes, vert, frag)` | `{ layer, u, a, Draw }` |
| `Perlin(octaves, freq, size, am, fm)` | `.get(x,y)` → 0–1; `.phase` |
| `FlowField()` | `.add(x,y,c,d,s)`, `.get(x,y)` → `[fx,fy]` |
| `DrawFlowGrid(ff, …)` | debug draw |
| `GetFlowFieldDataGL(ff, MAX)` | shader upload |
| `V2(x,y)` | set, dot, norm, dist, rad, len, circ, add, sub, inc, mul, div, cpy |
| `V3(...)` | + cr, mv, sph |
| `VecDist`, `VecPlaneDist` | |
| `RNG(s=SEED)` | `.r()` `.f(l,h)` `.i(l,h)` `.c(p)` `.item(arr)` |

## Cert (when debug_cert:on)

`MakeCert` builds the back; click uses `cc_InteractFn()`. `SetCertVisibility` is local to the input block. Resolution buttons and Save live in the default cert insert.

## 3.22

Not extracted. If the 3.22 template stays, diff `cc-v3.22.html` against this list in a short sibling page. Do not duplicate this catalog.
