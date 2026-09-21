# Canvas Core 3.23 — reference

This is the dictionary for `runtimes/cc-v3.23.html`. If you just wanted a circle, start with [getting started](./cc-v3.23.getting-started.md).

Everything below is **in the runtime**. Markers like `//PARAM-*` and `//#` are Construct² — they are stripped or chosen at build time and never reach the browser as magic comments.

---

## Abbreviations

Canvas Core nicknames the 2D context so a fill-and-stroke does not cost a novel. Prefix **`C`** plus two letters.

**Set a property** (`CFS("red")` → `ctx.fillStyle = "red"`):

| You type | Canvas means |
|----------|----------------|
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

**Call a method** (`CBP()` → `ctx.beginPath()`):

| You type | Canvas means |
|----------|----------------|
| `CBP` | `beginPath` |
| `CCP` | `closePath` |
| `CMT` | `moveTo` |
| `CLT` | `lineTo` |
| `CST` | `stroke` |
| `CFL` | `fill` |
| `CFR` | `fillRect` |
| `CRE` | `rect` |
| `CRT` | `rect` (same as `CRE`) |
| `CEL` | `ellipse` |
| `CFT` | `fillText` |
| `CDI` | `drawImage` |
| `CLD` | `setLineDash` |
| `CLP` | `clip` |
| `CVS` | `save` |
| `CVR` | `restore` |
| `CTR` | `setTransform` |
| `CXT` | `translate` |
| `CXS` | `scale` |
| `CXR` | `rotate` |
| `CGT` | `getTransform` |

`CRE` and `CRT` are twins. Use `CRE` when you are stuffing a path with many rectangles (the field demo does this). `CFR` fills a rectangle immediately and does not care about the path.

Also:

| Name | Meaning |
|------|---------|
| `CSB(e)` | shadow blur, scaled by resolution |
| `CCX(ctx)` | switch the current context (`ctx` / `cnv`) |
| `CTC` | old name for `CLP` — do not make new friends with it |

`Math.*` is copied onto the global object. `sin`, `PI`, `round` and the rest work without `Math.`.

---

## The loop

`setup` runs once (inside `ART()`). `draw` runs every frame until it returns `1`.

| Name | What it is |
|------|------------|
| `FPS` | Target frames per second (default 30). Set in setup. |
| `frame` | Ticks since last reset |
| `dt` | `1 / FPS` |
| `time` | `frame * dt` (seconds) |
| `Reset(delay?)` | Rebuild art after a few frames (trails, “start over”) |
| `SEED` | The workbench seed, baked at build |
| `RN` | `RNG()` created for you at `ART()` |

---

## Canvas

```js
Canvas(width, height, border); // required
CanvasShadow("black", 30);
CanvasWall("grey");
```

| Name | Notes |
|------|--------|
| `PX`, `PY` | Width / height of the coordinate space |
| `HX`, `HY` | Halves |
| `Frame(keep?)` | Fit the CSS box to the window |
| `ResetTransform(r?)` | Match context transform to resolution |
| `OnResize(fn)` | Your resize hook |
| `cc_PixelPerfect` | 1:1 display mode |
| `cc_Resolution` | Pixel multiplier |
| `cc_MaxDPR` | Cap (default 2) |
| `cc_Border` | Letterbox padding, from `Canvas` |
| `cc_SaveImage(name)` | Download a PNG of the art canvas |
| `CONTEXT` | `[[canvas, ctx], …]` — `[1]` is the cert when it exists |
| `cnv`, `ctx` | Whatever is current |

---

## Colour

Prefer these:

| Name | Example |
|------|---------|
| `cRGBA(r,g,b,a)` | `cRGBA(20, 40, 80, 1)` |
| `cHSVA(h,s,v,a)` | hue 0–360, s/v 0–100 |
| `cHSLA(h,s,l,a)` | |
| `cMono(v, a=1)` | `v` 0–255 |
| `cHex(hex, a=1)` | |

Converts: `HEX_to_RGB`, `RGB_to_HEX`, `RGB_to_HSV`, `HSV_to_RGB`.

Older `cR` / `cH` / `cM` / `cHx` still work. They are on the way out.

**Colour theory objects** if you enjoy a palette that argues with itself:

```js
let base = CT_HSV(120, 60, 60);
base.H(30).V(1.2).C();     // rgba string
CT_Cmp(base);              // complement
CT_All(base);              // the whole family
CT_Palette(CT_All(base));  // draw the swatches
```

`CT_Tri`, `CT_Ana`, `CT_Spl`, `CT_Tet`, `CT_Mon`, `CT_Squ`, `CT_Com`, `CT_Viv`.

Gradients: `RadialGrad(x,y,r, stops)`, `LinearGrad(x,y,X,Y, stops)`, `FuncGrad(fn, n)` where stops look like `[[0, col], [1, col]]`.

Named leftovers: `WHITE`, `BLACK`, `GREEN`, `GREY`, `LIGHTGREY`, `CENTER`, `LEFT`, `RIGHT`, `MIDDLE`, `ROUND`.

---

## Draw helpers

| Name | Role |
|------|------|
| `RECT(col, x=0, y=0, w=PX, h=PY)` | Fill a rectangle |
| `TXT(col, sizePx, …fillText args)` | Text (Arial) |
| `ELI(col, …ellipse args)` | Ellipse |
| `Circle(col, x, y, r)` | |
| `CircleExt(col, x, y, r, lw, lc)` | Circle plus optional stroke |
| `Pill(col, x, y, w, h)` | Capsule stroke |
| `CentreText()` | Center / middle align |
| `Shadow(col, blur)` | |
| `Extents(pad)` | `[pad, pad, PX-2pad, PY-2pad]` |
| `ADD()` / `MUL()` | Composite `screen` / `source-over` |
| `FNT(px)` | `px` + `"px Arial"` |
| `ShowTransform()` | Graph paper + mouse cross |
| `DrawCanvasInfo()` / `GetCanvasInfo()` | Debug table |
| `DrawTable(rows, …)` | Key/value overlay |

---

## Loops and math

| Name | Role |
|------|------|
| `Loop(n, fn)` | `fn(i, t, p)` — t and p are 0–1 flavours |
| `For(start, end, fn)` | |
| `FoE(arr, fn)` | for each |
| `FoP(obj, fn)` | for each key/value |
| `Map(arr, fn)` | |
| `FillArray(n, fn)` | |

`TAU`, `Lerp`, `Clamp`, `Ease`, `Wrap`, `Mapf`, `Quant`, `Lerpv`, `Slerp`, `QPath`, `FlipFlop`.

Envelopes (0–1 in, shapely out): `Ev_Linear`, `Ev_Quad`, `Ev_Cubic`, `Ev_Sine`, `Ev_Exp`, `Ev_Inv`, `Ev_Clamp`, `Ev_Ping`, `Ev_Wrap`, `Ev_Bounce`, `Ev_Step`, `Ev_Mul`.

Array colour maths: `ArrOp`, `ArrMul`, `ArrAdd`, `ArrLerp`, `ArrLerpSl`, `ArrRound`.

Line fattening: `subDivWithWeights`, `weightedRelax`, `SubDivRelax`, `ForPath`.

---

## Layers, fields, vectors, dice

**`Layer(maxR=16)`** — offscreen canvas.

```js
const L = Layer(0.5);
L.On(true);
// draw into L
L.On(false);
L.Draw(); // blit onto the main canvas
```

**`LayerGL(maxRes, vertSrc, fragSrc)`** — `{ u, a, Draw }` for a fullscreen triangle strip. `shader.u('1f', 'iTime', time)`.

**`Perlin(octaves=5, freq=1, …)`** — `noise.get(x, y)` → 0–1. Tweak `noise.phase`.

**`FlowField()`** — `ff.add(x, y, curl, div, strength)`, `ff.get(x, y)` → `[fx, fy]`. `DrawFlowGrid(ff)` if you want to see the weather.

**`V2(x, y)` / `V3(...)`** — `set`, `add`, `sub`, `mul`, `div`, `norm`, `len`, `dot`, `dist`, `circ`, `cpy`. V3 also `cr` (cross) and `sph`.

**`RNG(seed = SEED)`**

| Method | |
|--------|--|
| `.r()` | 0–1 |
| `.f(lo, hi)` | float |
| `.i(lo, hi)` | int |
| `.c(p)` | true with probability `p` |
| `.item(arr)` | pick |

`VecDist(a, b)`, `VecPlaneDist(pos, origin, norm)`.

---

## Mouse, cert, parameters

Always defined: `mouseX`, `mouseY`, `mouseHeld`, `mousePos`.

`cc_InteractFn()` — if it returns truthy, a click shows the **certificate** (when that Debug property is on). Replace it if the art needs the click.

```js
OnParam((key, value) => { /* sliders */ });
SendParams({ hello: 1 });
```

Messages with a `type` field are ignored. A map that arrives before `OnParam` is held and flushed when you register.

---

## Odds and ends

`CHAR`, `IsFunc`, `IsArray`, `OAS` (`Object.assign`), `SPLIT`, `ArrLength`, `DCE`, `DGE`, `Log`, `CGX`, `CEV`, `Transform`, `Timer`, `CWH`.

`cc_version` is `"3.23"`.
