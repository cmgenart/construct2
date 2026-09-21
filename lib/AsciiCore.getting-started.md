# AsciiCore — getting started

AsciiCore turns a **Canvas Core layer** (an offscreen picture) into a grid of characters sitting on top of the art. The canvas still paints; the letters are a transparent overlay. Spaces are holes. You can see the painting through them.

It is a library, not a runtime. You still use [Canvas Core](../runtimes/cc-v3.23.getting-started.md). You pull AsciiCore in with:

```js
//import<AsciiCore.js>
```

Construct² looks in your project folder first, then in its own `lib/`.

The **Canvas Core v3 + AsciiCore** template already draws a drifting white circle as characters. Open it, then change **Properties → Ascii → engine** or the cutoff slider.

## One layer, one overlay

```js
// setup.js
Canvas(1000, 1000, 0);
//import<AsciiCore.js>

const src = Layer(0.15);          // small buffer = fewer characters
const ac = AsciiCore(src);
```

```js
// draw.js
src.On(true);
RECT(cMono(0));
Circle(cMono(255), HX, HY, 200 + 40 * sin(time));
src.On(false);

ac.upd();
return 0;
```

`upd()` reads the layer pixels, picks characters, and writes the `<pre>`. Call it when the layer has something new to say.

## Engines

In **Properties**, group **Ascii**, property **engine**:

| engine | Mood |
|--------|------|
| `density` | Classic ramp ` .:-=+*#%@` |
| `edge` | Lines — `/-\|` |
| `bias` | A 64-character weather map of brightness × angle |

Only one engine is baked into a build. Switching the property rebuilds. Edge has a second property, **directional**, for a slightly richer glyph set.

## Knobs on the object

Assign these on `ac` (or from `OnParam` if you expose them):

`jitter`, `contrast`, `brightness`, `levelOffset`, `cutoff` (dark → space), `textBlend`, `ratio` (default 0.6 — monospace is not square), `dx` / `dy`.

```js
ac.cutoff = 0.2;
ac.sl((ac, y, row) => { /* mutter at a scanline */ });
ac.ch((x, y, ch) => (ch === "@" ? "#" : ch));
ac.txt("HELLO");
```

The [reference](./AsciiCore.reference.md) is the rest of the furniture.
