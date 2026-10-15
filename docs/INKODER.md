# Inkoder — specification

**Status:** The editor demo is `workspaces/Charles/Inkoder003.html` on `cc-v3.23` (`construct-demos/construct/inkoder`). Playback is decoder-only.  
**Related:** [DEMO-PROJECTS.md](./DEMO-PROJECTS.md), [PARAM-SPEC.md](./PARAM-SPEC.md) (`PARAM-STRING`), [runtimes/cc-v3.23.reference.md](../runtimes/cc-v3.23.reference.md) (line fattening)

Inkoder turns a line drawing into a short data string. A piece pastes that string into a parameter. A small decoder redraws the same lines with the Canvas Core that already ships.

This is the stroke-as-code tool. Viewport video is a separate feature: [VIEWPORT-CAPTURE.md](./VIEWPORT-CAPTURE.md).

Inkoder is a **demo project**, not a builder panel and not a new runtime.

---

## 1. What a line is

Each line is a handful of control points. Every point has:

| Channel | Meaning |
|---------|---------|
| `x`, `y` | Position |
| `w` | Curvature weight. `0` holds the point, `32` is full smooth. `SubDivRelax` already uses this. |
| `s` | Width, carried beside the point and read when the strip is drawn. |

The editor shows the subdivided stroke (`subDivWithWeights` → `weightedRelax` → `SubDivRelax` in `runtimes/cc-v3.23.html`). Copy produces one string for the whole drawing. The shipped piece does not include the editor.

The demo is that line editor: radial menu, undo, a background image, line and fill shapes, SVG export, and the text window that holds the string. Freehand sketching — pen down, simplify the stroke into the same points, emit the same string — is a later pass. Do not describe the demo as a sketch tool.

## 2. Goals

- One frozen string format that the editor writes and a piece can decode.
- Editor and piece call the same `SubDivRelax` on `cc-v3.23`. Replay matches the editor.
- The encoder stays in the editor. The piece carries a short decoder plus the string.
- The editor keeps the string in its text window and in an `ink` `//PARAM-STRING`, so a preview rebuild restores the sketch. A playback piece reads a `//PARAM-STRING`.
- A `page` vector is the page size in pixels, a `PARAM-VEC2` with integer step `1`. Each axis runs from `0` to `3843` (the vertex range, `62 * 62 - 1`). `0` means use the canvas the art creates. A size set in the parameter panel replaces that canvas.

## 3. Non-goals

- A Construct² toolbar, preview inject, or change to `builder.js`.
- Shipping the encoder inside art HTML.
- Replacing Canvas Core. The editor moves onto the shared runtime. The older core embedded in the prototype is dropped.
- Freehand capture in the first demo.

## 4. String format

Freeze the `ENCODE` / `DECODE` grammar from `workspaces/Charles/Inkoder003.html` (the same grammar as `Inkoder001.html`). Drop the 5-character `V2Encoder` and the grammar experiment.

| Rule | Detail |
|------|--------|
| Shape type | `l` line (`w`, `s` channels) or `f` (its own extra channels) |
| Digits | Base62 alphabet `0-9A-Za-z` |
| Position | Two digits per axis, range 0–3843 (`62 * 62 - 1`) |
| Extra channel | One digit, range 0–61, default `w`/`s` of `10` when absent |
| Channels | A `_` then the channel letter, then one digit per point |
| Shapes | Joined with `$` |

A piece decoder is: split on `$`, read the type, decode integers and points, attach extra channels, run `SubDivRelax`, draw the strip. Positions quantize on encode. That quantization is the format, not a bug.

## 5. Where it lives

| Piece | Place |
|-------|--------|
| Editor demo | `construct-demos`, its own project, runtime `cc-v3.23` |
| Playback demo | A smaller demo that only decodes a baked `PARAM-STRING`, so the playback cost is visible without the editor |
| Particle playback | `inkoder-particles` stamps that sketch onto a layer, a few circles per frame, scaled by stroke width. Particles spawn inside each circle on the main canvas. The layer keeps the sketch. A clear toggle wipes the main canvas each frame. |
| Prototype source | `workspaces/Charles/Inkoder003.html` — the editor demo is this file, without its embedded core |

The editor project follows [DEMO-PROJECTS.md](./DEMO-PROJECTS.md): latest Canvas Core, comments aimed at the lesson, save-a-copy into the artist’s projects folder.

## 6. Follow-up

Freehand sketching stays later: pen down, simplify to these same points, emit this same string. The radial menu, undo, background image, shape types, and SVG export are already in the demo.

## 7. Acceptance

- [x] Editor runs on `cc-v3.23`. The embedded older core is gone.
- [x] One grammar. `V2Encoder` and the grammar experiment are not in the demo.
- [ ] Copy produces a string. Paste into a `PARAM-STRING` on a second piece redraws the same lines. (Needs a click-through.)
- [x] The playback piece does not contain the encoder.
- [ ] Subdivided strokes match between editor and playback at the same subdivision level. (Same `SubDivRelax` and `drawInkStrip`; needs eyes.)
- [x] The demo is listed as a line editor.
