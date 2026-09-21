# AsciiCore — reference

Shipped files: `lib/AsciiCore.js` plus one engine (`AsciiEngine_density.js`, `_edge.js`, or `_bias.js`) chosen at build by `//#<<Ascii>engine:…>`.

See [getting started](./AsciiCore.getting-started.md) for the first overlay.

## `AsciiCore(layer, x?, y?, w?, h?)`

| Arg | Default | |
|-----|---------|--|
| `layer` | required | A Canvas Core `Layer` |
| `x, y, w, h` | `0, 0, PX, PY` | Overlay rectangle in canvas space |

Returns an object. Overlay is a `position:fixed` `<pre>` after the main canvas, `pointer-events: none`.

## Properties

| Name | Default | |
|------|---------|--|
| `layer` | — | Source |
| `x y w h` | full canvas | Placement |
| `cols rows` | set in `upd` | Layer pixel size |
| `engine` | build-time | `"density"` \| `"edge"` \| `"bias"` |
| `jitter` | 0 | Convert noise |
| `contrast` | 0 | Stretch lum / edge |
| `brightness` | 1 | Gain |
| `levelOffset` | 0 | Shift lum |
| `cutoff` | 0.08 | Below → `" "` |
| `textBlend` | 0 | Mix `txt` into the grid |
| `ratio` | 0.6 | Glyph aspect for layout |
| `dx dy` | 0 | Pixel nudge |

## Methods

| | |
|--|--|
| `upd()` | Convert → text blend → `sl` / `ch` → DOM. Returns `ac`. |
| `sl(fn)` | `fn(ac, y, row)` mutates a scanline |
| `ch(fn)` | `fn(x, y, ch, …)` → next char, or `null` to leave it |
| `txt(s \| fn)` | Extra text layer; `fn(ac)` allowed |
| `vis(on)` | Show / hide |

`OnResize` is hooked to `upd` for you.

## Engines

Each file defines `AsciiConvert(ac, cols, rows, img)` and `AsciiLum`.

| Engine | Glyphs |
|--------|--------|
| density | ` .:-=+*#%@` |
| edge | ` `, `-`, `\|`, `/`, `\` — or `+` when `directional:on` |
| bias | 64-char `BIAS64` table, brightness band × angle |

## Import

```js
//import<AsciiCore.js>
```

Project file wins over `construct2/lib/`. Do not put the literal import-tag text inside comments in library files — the expander is not a mind reader.
