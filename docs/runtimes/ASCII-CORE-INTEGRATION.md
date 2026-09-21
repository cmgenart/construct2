# AsciiCore — integration decisions (Construct²)

**Status:** **Decided** — Shape A (Canvas Core extension)  
**Related:** [ASCII-CORE-SPEC.md](./ASCII-CORE-SPEC.md), [CORE.md](../CORE.md)  
**Runtime starters:** [`construct2/runtimes/`](../../runtimes/README.md)

---

## 1. Decision summary

| Item | Decision |
|------|----------|
| **Integration shape** | **Shape A** — AsciiCore as a CC3 library module, not a separate runtime fork |
| **Buffer** | Wrap an existing **`Layer`** — `const ac = AsciiCore(acLayer)` |
| **API style** | Single object with short methods (like `Layer`, `Perlin`, `FlowField`) — `.upd()`, `.sl()`, `.ch()`, `.txt()`, `.vis()` |
| **Placement** | Direct properties `ac.x`, `ac.y`, `ac.w`, `ac.h` in canvas coordinates; default `0, 0, PX, PY` |
| **Dev location** | Experimental project `AsciiCore.js`, later promoted to `construct2/lib/` |
| **Import** | `//import<AsciiCore.js>` in `setup.js` (or any canonical file), immediately before usage |
| **Promotion path** | Stable lib → `construct2/lib/AsciiCore.js` (shared import); later optional inline in **`cc3.24+`** |
| **`core.html`** | Standard CC3 template; change only when shell needs ASCII DOM/CSS hooks |

**Rejected:** Shape B (dedicated AsciiCore runtime fork) — duplicates CC3 or re-embeds it without benefit.

---

## 2. Library delivery

### 2.1 Now — project-local import

```
art/AsciiCore/
  AsciiCore.js          ← library source (authoritative during dev)
  setup.js              ← //import<AsciiCore.js> before wiring
  core.html             ← CC3 template (minimal or no ASCII-specific edits initially)
  defs.js, draw.js, …
```

In `setup.js`:

```js
//import<AsciiCore.js>

const acLayer = Layer(0.1);
const ac = AsciiCore(acLayer);
```

advBuilder expands `//import` at build time ([CORE.md](../CORE.md) §4.2). The import graph is watched, fingerprinted, listed in the startup **Source files** panel (with a `(lib)` tag), and copied into collection `_source/` snapshots like any project file.

**Important:** never write a literal `//import<…>` string inside `AsciiCore.js` (even in comments) — the resolver will treat it as a nested import and may report a circular import.

### 2.2 Construct² shared lib ✅

Promoted copies live in:

```
construct2/lib/
  AsciiCore.js
  AsciiEngine_density.js
  AsciiEngine_edge.js
  AsciiEngine_bias.js
```

Projects keep the same tag:

```js
//import<AsciiCore.js>
```

**Import resolution:** project root first, then **`construct2/lib/`** fallback ([`import_resolve.js`](../../import_resolve.js)). A file in `art/MyPiece/AsciiCore.js` overrides the shared lib — use that while developing in `art/AsciiCore/`; other projects can omit local copies and pick up the lib automatically.

See [`construct2/lib/README.md`](../../lib/README.md).

### 2.3 Eventually — Canvas Core runtime

Merge into **`cc3.24+`** behind property gates (`//#<<Ascii>engine:density>` etc.) for pieces that need zero import overhead. The standalone `AsciiCore.js` file remains the readable source; promotion is a copy/refactor, not a redesign.

---

## 3. Object API

### 3.1 Constructor

```js
const acLayer = Layer(0.1);
const ac = AsciiCore(acLayer);                    // x=0, y=0, w=PX, h=PY

const ac = AsciiCore(acLayer, 100, 200, 400, 300);  // optional initial rect
```

### 3.2 Surface

| Member | Type | Role |
|--------|------|------|
| `layer` | `Layer` | Draw via `ac.layer.On(true)` … `On(false)` |
| `x`, `y`, `w`, `h` | number | Canvas-space rect; assign directly |
| `cols`, `rows` | number | Char grid (derived or explicit) |
| `engine` | string | `"density"` \| `"edge"` \| `"bias"` |
| `jitter`, `contrast`, `textBlend` | number | Conversion / text props |
| `upd()` | fn | Layer sample → char buffer → `<pre>`; sync overlay layout |
| `sl(fn)` | fn | Scanline shader `fn(ac, y, row)` |
| `ch(fn)` | fn | Char shader `fn(x, y, char, …)` → char \| `null` |
| `txt(s)` | fn | Procedural text into buffer |
| `vis(on)` | fn | Show/hide overlay |

No freestanding `AsciiCore_update(ac)` utilities.

### 3.3 Draw loop

```js
acLayer.On(true);
// RECT, CFS, Perlin, FlowField, LayerGL, …
acLayer.On(false);

ac.sl((ac, y, row) => { /* optional */ });
ac.upd();

// debug: acLayer.Draw()
```

### 3.4 Placement (canvas-relative)

`ac.upd()` maps `ac.x/y/w/h` to overlay CSS using main canvas display size from `Frame()`:

```
overlay.left   = (ac.x / PX) * displayW
overlay.top    = (ac.y / PY) * displayH
overlay.width  = (ac.w / PX) * displayW
overlay.height = (ac.h / PY) * displayH
```

Hook `OnResize` to re-run layout when the window changes.

---

## 4. DOM stack

```
z-index 0   optional wall (CanvasWall)
z-index 1   <canvas>                 ← main art
z-index 2   ascii overlay <pre>      ← created by AsciiCore.js (or core.html host)
z-index 3   optional cert canvas
```

Construct Sequence can drive wrapper `opacity` / `transform` / `filter` via the param bridge without owning AsciiCore internals.

---

## 5. Construct Sequence

- **P1 (primary):** AsciiCore inside the preview iframe; sequence posts params → `ac.upd()`.
- **P3 (optional):** Native DOM shim with shared conversion code for sites without a generative build.

---

## 6. Size & build

- Engines and charset tables stripped via PropMaster (`//#<<Ascii>…`).
- UTF8link remains ASCII-only ([UTF8LINK-METADATA.md](../UTF8LINK-METADATA.md)).
- `AsciiCore.js` may contain its own `//import<…>` for engine sub-modules (e.g. bias table) as they are added.

---

## 7. Open items (full spec)

| Topic | Notes |
|-------|-------|
| Fixed `cols`/`rows` vs derived from layer buffer | Pick default in spec |
| Colour in `<pre>` | ANSI spans vs single colour |
| Shared import resolver | `construct2/lib/` fallback |
| `cc_version` bump | When to inline vs import-only |

---

## 8. References

| Resource | Path |
|----------|------|
| Specification | [ASCII-CORE-SPEC.md](./ASCII-CORE-SPEC.md) |
| Canvas Core template | [`construct2/cc3.23.html`](../../cc3.23.html) |
| Import resolver | [`construct2/import_resolve.js`](../../import_resolve.js) |
| Layer / Perlin | [`cc3.23.html`](../../cc3.23.html) |
