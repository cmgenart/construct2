# Canvas Core 3.23 — getting started

Canvas Core is a **small art kit** that lives inside one HTML file. Construct² drops your `setup` / `draw` / friends into that file and presses go.

You talk to the canvas in a two-letter dialect (`CRE`, `CFS`, `CBP`…) so the shipped file stays tiny. The [reference](./cc-v3.23.reference.md) is the dictionary. This page is the first afternoon.

## A blank piece

New project → **Canvas Core v3 — minimal** gives you something like:

```js
// setup.js
Canvas(1000, 1000, 0);
```

```js
// draw.js
return 1;
```

`Canvas(width, height, border)` is required. It sets the **coordinate space** — `PX`, `PY` (size) and `HX`, `HY` (the middle). The picture may be scaled to fit the window; your numbers stay in that space.

`draw` runs every frame. Return `0` to keep going, `1` when you are done (a still image). Forget to return and the core will keep asking politely forever.

## Paint something

```js
// setup.js
Canvas(1000, 1000, 40);
CanvasWall("grey");
```

```js
// draw.js
RECT(cMono(30), 0, 0, PX, PY);           // fill the room
Circle(cHSVA(200, 70, 90, 1), HX, HY, 120);
return 1;
```

- `RECT` / `Circle` take a **colour first**.
- `cMono(v)` is grey 0–255. `cHSVA(h, s, v, a)` is the one you will actually like.
- `CRE(x, y, w, h)` adds a rectangle to the *current path* (same as `ctx.rect`). Handy when you are batching a lot of squares — see the field demo.

## Time

```js
// draw.js
RECT(cHSLA(time * 20, 50, 40, 1));
return 0; // keep spinning
```

`time` is seconds. `frame` is ticks. `dt` is `1 / FPS` (default 30). `Reset()` starts the clock again — useful when a parameter should wipe a trail.

## The two-letter dialect

`CFS(col)` is `fillStyle`. `CBP()` is `beginPath`. `CFL()` is `fill`. You can still say `ctx.fill()` if you want to be formal at a dinner party.

`CRE` and `CRT` are both `ctx.rect`. Yes, both. Historical reasons; pick a favourite and keep it.

The full table lives at the top of the [reference](./cc-v3.23.reference.md).

## Talking to the Parameters panel

```js
// defs.js
//PARAM-FLOAT:["speed", 0, 2, 0.05]
let speed = 1;

OnParam((k, v) => {
  if (k === "speed") speed = v;
});
```

`OnParam` is how sliders reach the art **without a rebuild**. If Construct² posted values before your function existed, the last map is waiting and flushes when you assign it.

To send something *out* (a readout, a “I landed here”): `SendParams({ mood: "rain" })`.

## Click and the certificate

`mouseX`, `mouseY`, `mouseHeld` are always there.

If the piece has a **cert** (the flip side with title and Save), a click can show it. The core asks `cc_InteractFn()`. Default is “yes, always”. To paint on the canvas and only flip when the click misses the picture:

```js
cc_InteractFn = () => !(mouseX > 0 && mouseX < PX && mouseY > 0 && mouseY < PY);
```

## Random that agrees with itself

`SEED` comes from the workbench seed box at build time. `RN = RNG()` is created for you.

```js
let x = RN.f(0, PX);   // float
let n = RN.i(0, 10);   // int
if (RN.c(0.1)) { /* 10% */ }
```

Same seed, same universe. Change the seed, new universe, same laws.

## What next

- [Reference](./cc-v3.23.reference.md) — abbreviations, colour, layers, Perlin, the lot
- [Construct² — source files](../docs/user/SOURCE.md) — where `setup.js` lives
- [Parameters](../docs/user/PARAMETERS.md) — the `//PARAM-*` grocery list
