# Source

A Construct² piece is a **few small files**. The builder stitches them into Canvas Core and hands you one HTML file. You do not ship the folder.

## The usual cast

| File | Role |
|------|------|
| `setup.js` | Once. Call `Canvas(w, h, border)` here. |
| `draw.js` | Every frame. Return `0` or `1`. |
| `defs.js` | Parameters, property branches, constants |
| `functions.js` | Helpers |
| `cert.js` | Optional flip side of the canvas |
| `metadata.js` | How values become the JSON luggage |
| `collection.js` | Optional batch scripts |
| `project.json` | Name, runtime id |
| `dev.json` | Seed, panel state — workshop notes, not the art |

The dialect inside those files: [Canvas Core getting started](../../runtimes/cc-v3.23.getting-started.md).

## Importing extra files

```js
//import<AsciiCore.js>
//import<colours/palette.js>
```

Paths are from the **project folder**. If the file is missing there, Construct² looks in its own `lib/`. That is how [AsciiCore](../../lib/AsciiCore.getting-started.md) arrives without you copying it.

Do not `..` out of the project. Circular imports fail loudly.

## Runtime vs project core

The dropdown picks a **shared** runtime (`cc-v3.23`) or **Project core** (`core.html` in the project). Shared means many pieces can ride the same core; editing `runtimes/cc-v3.23.html` is a core-developer hobby, not a Tuesday. Older projects that still say `cc-v3` mean this same 3.23 file.

## Templates

See [Projects](./PROJECTS.md). Minimal is the honest blank page.
