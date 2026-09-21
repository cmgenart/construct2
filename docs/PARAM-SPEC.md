# External parameters (`//PARAM-*`) — authoring specification

This document defines **build-time** parameter markers in art source code, the **runtime** API for art (`cc_onParam` / optional `OnParam(fn)` alias, `SendParams`), and how **advBuilder dev-ui** surfaces them. Implementation is phased; this file is the **contract** between authors, the Node scanner, canvas core hooks, and host applications.

---

## 1. Goals

1. **Discoverable:** Parameter definitions live in source as special **whole-line** `//` comments so they are easy to read and edit, and do not change JavaScript semantics where they appear.
2. **Stripped from minified output:** Line comments are removed during the normal build pipeline; definitions are **not** shipped as comments. Only the **extracted schema**, **current values**, and **injected runtime glue** appear in built artifacts (see §8).
3. **Controllable:** A host (advBuilder preview, Electron shell, chatbot bridge, etc.) can push values in; art can push values out (`SendParams`).
4. **Dev-ui:** A **Parameters** collapsible section (alongside **Values** and **Properties**) lists all parameters with type-appropriate controls and live updates (see §7). Rows are **tidy and single-line** where possible, aligned with the Properties panel (name column width, choice strips). **Ad hoc keys** (values without a `//PARAM-*` definition) still get a basic control (see §7.1). Defined parameters show **descriptions** and **tooltips** from §4.1.

---

## 2. Non-goals (v1)

- Parsing or executing arbitrary expressions inside `//PARAM-*` payloads (no `eval`). Payloads are **data literals** only.
- Automatic UI for every possible custom widget beyond the types listed in §4.
- On-chain Cardano metadata carrying full param schemas (size-sensitive); schemas may live only in **dev** `state` / `dev.json` unless explicitly opted in later.

---

## 3. Detection rule (what counts as a definition)

A line is a parameter definition **only if** all of the following hold:

1. After optional leading whitespace, the line starts with **`//PARAM-`** (no space between `//` and `PARAM`).
2. The token continues with an **uppercase type name** and a **colon**, e.g. `//PARAM-FLOAT:`.
3. After the type name, a **colon** and a **JSON array in square brackets** (`:[...]`) define the payload. The array must parse as valid JSON; the closing `]` that ends the array follows normal JSON rules (a `]` inside a string does not terminate the array).
4. **Optional description:** Any text on the **same line** after that closing `]` is the **description** (§4.1).

**Not definitions (examples):**

- `// PARAM-FLOAT:[a,0,1,0.1]` — space after `//` → treated as a normal comment, ignored by the scanner.
- `const x = "//PARAM-FLOAT:[trap]"` — not at line start as a whole-line comment marker in the scanner’s line-based model (implementation may still ignore inside strings by only scanning “comment-only” lines).

**Authoring hint:** Put the machine-readable payload in the brackets; use the rest of the line for a short human-readable **description** (§4.1, §9).

---

## 4. Parameter types and payloads

Payload is always `:[...]` immediately after the type name. **v1 encoding:** the inside of the brackets is a **JSON array** (so commas inside strings are unambiguous). The first element is always the **parameter name** (`string`), except `PARAM-BUTTON` where the array is a single-element array containing the name: `["name"]`.

### 4.1. Description and tooltip (trailing text)

After the JSON array’s closing `]`, the remainder of the line (trimmed) becomes:

- **`description`** in the scanned schema, in **dev-ui** (subtitle, **`title`** tooltip, `aria-label` where useful), and in **`output.params.md`** (§9).

Example:

```text
//PARAM-BUTTON:["recalibrate"]  Tap to reset mouth tracking
//PARAM-FLOAT:["mouthOpen",0,1,0.05]  How wide the mouth is (0 closed, 1 full)
//PARAM-BUTTON:["reset"]  any text here is the trimmed description and tooltip
```

If there is no trailing text (or only whitespace), `description` is empty and the UI shows the parameter **name** only.

| Marker | JSON array shape | Notes |
|--------|------------------|--------|
| `PARAM-BUTTON` | `[name]` | Momentary action. **dev-ui:** monotonic **trigger count** integer starting at **1** per dev-ui page load (1, 2, 3, …). **Not persisted** in `dev.json`. Art: compare `>` previous value or any positive integer — see [PARAM-COLOR-PLAN.md](./PARAM-COLOR-PLAN.md) §2. |
| `PARAM-STRING` | `[name, default]` | `default` is a JSON string or **`null`**. |
| `PARAM-NUMBER` | `[name, default]` | `default` is number (JSON number). |
| `PARAM-ARRAY` | `[name, default]` | `default` is JSON array or object (any JSON value). |
| `PARAM-BOOLEAN` | `[name, default]` | `default` in source may be JSON **`true` / `false`** or the integers **`0` / `1`**. The scanner **normalizes** to **`0` or `1`** in `paramSchema` / persisted values (see §4.2). |
| `PARAM-FLOAT` | `[name, low, high, step]` or `[name, default, low, high, step]` | `low <= high`, `step > 0`; optional explicit default (second element). |
| `PARAM-INT` | `[name, low, high, step]` or `[name, default, low, high, step]` | Integers; `step >= 1`; optional explicit default. |
| `PARAM-CHOICE` | `[name, "c0", "c1", ...]` | At least one choice after `name`. **dev-ui:** same **segmented-button** strip as **Properties** (see §7.2). |
| `PARAM-DROPDOWN` | `[name, "c0", "c1", ...]` | Same shape and validation as **`PARAM-CHOICE`**; **dev-ui** uses a **`<select>`** dropdown instead of the button strip (better for long option lists). |
| `PARAM-RGB` | `[name, R, G, B, A]` | Five numbers: **R/G/B** 0–255, **A** 0–1. Wire: `{ r, g, b, a }`. |
| `PARAM-HSV` | `[name, H, S, V, A]` | Five numbers: **H** 0–360, **S/V/A** **normalized 0–1**. Wire: `{ h, s, v, a }`. |
| `PARAM-HEX` | `[name, hex]` | `hex` string, e.g. `"#aabbcc"` or `"aabbcc"` (normalize in scanner). |
| `PARAM-HSL` | `[name, H, S, L, A]` | **H** 0–360, **S/L/A** **normalized 0–1**. Wire: `{ h, s, l, a }`. Same swatch + HSVA picker as HSV (conversion at boundary). |
| `PARAM-VEC2` *(planned)* | `[name, [dx, dy], [minX, minY], [maxX, maxY], step]` | 2D vector. Wire: `{ x, y }`. **dev-ui:** ~3-line square pad + marker + stacked **x** / **y** fields; click = absolute jump, drag = relative delta from press. Not yet in scanner — see [PARAM-VEC2-PLAN.md](./PARAM-VEC2-PLAN.md). |
| ~~`PARAM-COLOR`~~ | — | **Deprecated.** Do not use in new art. Scanner should **error** (use RGB, HSV, HSL, or HEX). See [PARAM-COLOR-PLAN.md](./PARAM-COLOR-PLAN.md) §6. |

**Colour dev-ui (swatches, floating HSVA picker, commit-only `dev.json`):** [PARAM-COLOR-PLAN.md](./PARAM-COLOR-PLAN.md), [PARAM-COLOR-IMPL.md](./PARAM-COLOR-IMPL.md), manual QA [PARAM-COLOR-TEST.md](./PARAM-COLOR-TEST.md).

**Unknown type:** e.g. `//PARAM-FOO:[...]` — scan error with line context.

Each scanned parameter record includes at minimum: **`name`**, **`type`**, type-specific fields (defaults, `low`/`high`/`step`, choices, etc.), **`description`** (from §4.1), and **`declaredIn`** (file + line for errors).

### 4.2. Boolean parameters as **`0` / `1`** (not JSON booleans on the wire)

For **minified artwork** and tiny `OnParam` handlers, treating flags as **numbers** saves bytes (`0` / `1` vs `true` / `false`) and matches common `if (param.x)` patterns.

**Authoring:** `//PARAM-BOOLEAN` may still use **`true` / `false`** in the JSON array (readable), or **`0` / `1`** directly.

**Canonical value:** After scan and in **dev state** / **`dev.json`** / **`postMessage`** maps to the iframe, boolean parameters are always the **numbers** **`0`** or **`1`**, never JSON booleans.

**`OnParam` / art:** Callbacks receive **`1`** for on and **`0`** for off for `PARAM-BOOLEAN` keys.

**`SendParams`:** Prefer sending **`0` / `1`** for the same keys; hosts should accept either and may normalize.

**dev-ui:** Renders a checkbox but **POST**/**persist** values as **`0` | `1`**.

---

## 5. Example (authoring)

```javascript
//PARAM-FLOAT:["mouthOpen", 0, 1, 0.05]  Opens the mouth; 0 closed, 1 fully open
//PARAM-CHOICE:["mood", "neutral", "happy", "angry"]  Current emotional state for blend shapes
//PARAM-DROPDOWN:["preset", "A", "B", "C"]  Compact preset when many labels would crowd the row
//PARAM-BOOLEAN:["debugOverlay", false]  or  //PARAM-BOOLEAN:["flag", 1]
//PARAM-BUTTON:["recalibrate"]  Tap to reset mouth calibration

let param = {};

OnParam((key, val) => {
  param[key] = val;
  // drive visuals from param.*
});

function onChatbotEnergy(e) {
  SendParams({ energy: e });
}
```

---

## 6. Runtime API (art side)

These names are **reserved** for author code and for definitions in **canvas core** (§8.1 below) or a **tiny** injected prelude. If the canvas already provides `SendParams` / `cc_onParam` (and optional `OnParam`), the build must **not** inject conflicting globals; extend or thin-wrap with **minimal** added bytes only.

The build may inject a small prelude (exact signatures TBD in implementation) that defines:

### `OnParam(callback)` / `cc_onParam`

- In **canvas core** (§8.1), prefer **`cc_onParam = (key, value, action) => { ... }`** (one `message` listener is installed at core init). **`OnParam(callback)`** is a thin alias that assigns **`cc_onParam`** (last assignment wins; no stacked listeners).
- `callback` is `(key, value) => void` or `(key, value, action) => void` (`action` from `MessageEvent` when present).
- Registering **replays** current values so late registrants still see state.
- For **`PARAM-BOOLEAN`**, `value` is always **`0` or `1`** (never JSON `true`/`false` from the host bridge); see §4.2.
- Multiple calls: implementation may **chain** or **replace** last only — v1 recommendation: **single consumer** or last registration wins; document choice in release notes. **Canvas core** uses **replace** (single slot).

### `SendParams(object)`

- `object` is a plain object `{ name: value, ... }`.
- Sends toward the **host** (see §8). No-op or console-only when no host is connected (TBD per environment).
- Prefer **`0` / `1`** instead of JSON booleans for flags (§4.2).

### `param` (or internal `__param`)

- Authors may use a conventional global `param` object; injected code may implement it as `const param = {}` with `OnParam` updating it.

**Order:** injected prelude should define `SendParams` / `cc_onParam` or `OnParam` / `param` **before** author codeblocks run, so author `OnParam(...)` or `cc_onParam = ...` at top level works.

---

## 7. dev-ui behavior (advBuilder)

### Left panel (collapsible sections)

- The left column is **one scrollable stack** of collapsible sections: **Parameters**, **Values**, **Properties**. Each section has a **thin title bar** (small type); **click the title** to expand or collapse the body. Any combination may be open at once.
- **Properties:** one panel with a **level bar** (`viewer` / `collection` / `piece` / `override` / `result`) and **collapsible groups** (`base` plus artist-defined groups from `//#<<Group>name:value>` in source). **Override** is disabled until a collection is open. See [PROPERTIES-PANEL.md](./PROPERTIES-PANEL.md).
- **Parameters:** built from **scan result** (`schema` + validation errors). Detailed layout, slider behavior, and choice vs dropdown UI are specified in **§7.2** (implementation should match after review).
- **Live updates:** changing a control issues **POST** to `/params` (and WebSocket `params` for multi-client sync); the server updates stored values and signals the **preview iframe** via bare `postMessage` map (§8) so art updates **without** a full rebuild.

### Errors

- Scan errors list at the top of the **Parameters** section body (duplicate name, bad JSON, invalid ranges).

### 7.1. Ad hoc parameters (no `//PARAM-*` definition)

Hosts or art may introduce **keys that were never declared** in source (e.g. `SendParams({ energy: 0.7 })` or host push before schema exists).

**dev-ui behavior:**

1. **Infer a basic control** from the **runtime type** of the current value:
   - `number` → number input (step `any` or coarse default).
   - `boolean` → toggle if inferred (legacy); **declared** `PARAM-BOOLEAN` values are always **`0` / `1`** on the wire (§4.2).
   - `string` → single-line text.
   - `object` / `array` → read-only JSON snippet or compact textarea (implementation choice; keep simple).
2. **Label:** use the key name as the row title; mark visually as **ad hoc** (e.g. subtle “unlisted” badge or tooltip) so authors can add a proper `//PARAM-*` later.
3. **Clear / remove:** If the user **clears** the entry control (empty string / empty number state) **and** there is **no** scanned definition for that key, **remove** the key from persisted runtime values and from the UI list (and optionally notify the iframe so art drops the key). Keys that **have** a definition cannot be removed by clearing; reset to default instead.

**Server state:** merge rule = union of **schema-defined names** ∪ **keys present in last applied values** ∪ **keys received from `SendParams` relay** (with caps / sanitization TBD if abuse is a concern).

### 7.2. Parameters panel — layout, sliders, choices (target UI)

This section is the **contract** for a tidy **Parameters** section body: **one horizontal row per parameter**, visually aligned with **Properties** (`dev-ui.html` uses `.property` + `.prop-name` at **50px** width + `.choice-container` for property choices).

**Row layout (all types)**

- Each parameter is a **single flex row**: `display:flex; align-items:center;` with modest vertical margin (match or mirror `.property` spacing).
- **Name column (first):** same **width and typographic role** as Properties’ **`.prop-name`**: fixed **50px**, `flex-shrink:0`, bold small label, centered text. Show the declared **`name`** string (Parameters do not use PropMaster’s display-name munging unless we add a separate field later). Optional **`description`** from §4.1 on **`title`** / `aria-label` on the name cell or row.
- **Control region (middle):** `flex:1; min-width:0` so sliders and text fields use remaining width without forcing wrap.
- **Properties parity:** do **not** add PropMaster **nudge** (`<` / `>`) buttons to parameter rows unless a future type needs stepping; nudges imply rebuild/shuffle semantics that do not apply to external params.

**`PARAM-FLOAT` / `PARAM-INT` (slider + value)**

- One row: **`[ name | range input | value field ]`**.
- **Range:** occupies the flexible middle. **Interaction:** dragging must **not** cancel when the pointer strays slightly off the control (native `<input type="range">` often loses tracking). **Required behavior:** use **Pointer Events** — on `pointerdown` on the range control, call **`setPointerCapture(pointerId)`** on the element (or a stable wrapper), handle `pointermove` / `pointerup` / `pointercancel` to update value, and **`releasePointerCapture`** when done. (Equivalent document-level mouse listeners are acceptable if capture is unavailable in a host, but capture is preferred.)
- **Value column (end):** a numeric control or readout showing the current value, **right-aligned** in the row, with:
  - **`min-width`:** enough for a sample like **`0.00`** (use **~`5ch`** or the computed width for `low`/`high`/`step` — implementation picks one consistent rule).
  - **`max-width`:** about **double** that minimum (e.g. **~`10ch`**) so wide numbers can grow but the column does not dominate.
- **Styling:** **thicker** track than the browser default; **thumb** (handle) **contrasting fill** vs track; **thumb height** should match the **visible track thickness** (same “diameter” feel). Implement with **`accent-color`** plus **`::-webkit-slider-*` / `::-moz-range-*`** (and any Electron/Chromium quirks) as needed. Touch targets should feel comfortable (~18–22px tall control is a reasonable target).

**`PARAM-CHOICE` vs `PARAM-DROPDOWN`**

- **`PARAM-CHOICE`:** same data model as today (`[name, ...choices]`). **dev-ui** must match **Properties** choice UI: after the 50px name, a **`.choice-container`** flex wrap with **one `<button>` per choice**, reusing the same **button classes / active styling** as Properties (`active`, and **`locked` only if** a future feature adds param locks — v1 may use **`active` only**). Clicking a choice applies that string value via `/params` (no full rebuild).
- **`PARAM-DROPDOWN`:** identical payload and validation to **`PARAM-CHOICE`**, but **dev-ui** renders a **`<select>`** (dropdown) for compact editing when there are many options or long labels.
- **Migration note:** earlier implementations may have used **`<select>` for `PARAM-CHOICE`**. Per this spec, **CHOICE = buttons**, **DROPDOWN = select**; authors who want the old control rename the marker to **`PARAM-DROPDOWN`**.

**Other types (brief)**

- **String / number-only / boolean / button / JSON-ish types:** still one row: name column + control; no extra value column unless the control itself is compact (e.g. checkbox + “on” label). **`PARAM-BOOLEAN`** persists **`0` / `1`** (§4.2).
- **Colour types (`PARAM-RGB`, `PARAM-HSV`, `PARAM-HSL`, `PARAM-HEX`):** one row with **swatch** (CSS fill from `param_color.js`) and **readout** overlay. Click opens a single shared floating **HSVA** picker (Iro.js): wheel + H/S/V/A sliders. **Live preview:** each changed frame → bare-map `postMessage` to the preview iframe only (no `POST /params`, no `dev.json`, no WS). **Accept:** × header button, backdrop click, **Enter**, or opening another colour swatch → `POST /params` (default `persist: true`) → `dev.json` + WS `{ type: 'params' }`. **Cancel** (header/toolbar button, **Esc**): restore pre-open value to iframe only. **Undo / redo** (toolbar, **Ctrl+Z/Y** while picker focused): per-property stack of **committed** colours; resets on project load. Clipboard: **HSVA** JSON in picker only. Same header **Cancel** / **×** behaviour for settings pickers (e.g. viewport background). **`PARAM-COLOR` is deprecated** (scanner error, no row). Manual checklist: [PARAM-COLOR-TEST.md](./PARAM-COLOR-TEST.md). Spec: [PARAM-COLOR-PLAN.md](./PARAM-COLOR-PLAN.md).
- **`PARAM-VEC2` *(planned)*:** ~**3-line** row (~48px): **50px name** + **square pad** (y-up: bottom = `min.y`, top = `max.y`) with **marker** at current `{ x, y }` + stacked **x** / **y** numeric fields (same column sizing as slider value fields). **Click** pad → jump vector to clicked position (clamp + snap). **Drag** → relative move: `newVec = startVec + (currentPadValue − startPadValue)` per axis, then clamp/snap — avoids marker jumping under the pointer on drag start. Pointer capture on pad; live iframe preview during drag (`broadcast: false`); persist on release / field commit. Wire `{ x, y }`; marker accepts `[x, y]`. Full spec: [PARAM-VEC2-PLAN.md](./PARAM-VEC2-PLAN.md).

**Ad hoc rows (§7.1)** should follow the same **row + 50px name** pattern where the inferred control allows it.

---

## 8. Host bridge (controlling application)

**Direction: host → art**

- **`postMessage` data:** bare map `{ name: value, ... }` only (no `source` / `type` / `values` wrapper, no schema or ranges). Target origin: dev host origin (same as preview iframe). Art may ignore unknown keys; clamping / typing is optional in the piece. **`PARAM-BOOLEAN` values** are always **`0` or `1`** (see §4.2), not JSON booleans.
- **Incremental vs full:** advBuilder **dev-ui** sends a **shallow patch** (only keys changed in that interaction, or a **value-aware** diff after a remote `params` WS message so array/object values re-parsed from JSON are not treated as changed) so logging and **`cc_onParam`** stay cheap. Identical consecutive bare maps to the iframe are skipped when safe. After a **preview reload** / full **`update`**, the host may send the **full** current map (possibly `{}`) so the piece can resync. Removed keys may appear as **`name: null`** in a patch (e.g. ad hoc key cleared); art may treat that as “drop key” if desired.
- **Colour picker:** live drag uses **iframe `postMessage` only** (no `POST /params`, no WS). **`POST /params`** + WS `{ type: 'params' }` run on colour **accept** (×, backdrop, Enter, other swatch), undo/redo in the open picker, and other param edits — see §7.2 and [PARAM-COLOR-PLAN.md](./PARAM-COLOR-PLAN.md).
- Transport: `iframe.contentWindow.postMessage` in Electron/advBuilder; other hosts should mirror the same minimal shape if space-constrained.

**Direction: art → host**

- **`SendParams(data)`** — same minimal contract when possible: `data` as the bare `{ name: value, ... }` map via `window.parent.postMessage` (target is host-defined). Hosts may still accept legacy wrapped shapes if they implement a relay. Prefer **`0` / `1`** for boolean-like flags (§4.2).
- **advBuilder dev-ui:** listens for the same **bare map** from the preview iframe (`#vis`). Only keys declared in `paramSchema` are applied. Values are **coerced/clamped** per marker type (`param_coerce.js`). If the stored value changes, the panel updates and the host **relays the coerced map** back to the art via `postMessage` (so out-of-range art values are corrected in the piece). Server memory: **`POST /params`** with **`persist: false`** (no `dev.json`). Art must not send type metadata in the map — only values.

**Origins:** Electron shell must validate `event.origin` the same way as existing **Close** dev-ui messaging (dev server origin, possibly configurable port).

---

## 8.1. Canvas core (`cc3.23.html` / `cc3.html`) — existing hooks

The advBuilder canvas template already defines minimal **parameter messaging** (verify and align with this spec during implementation):

```918:921:.advBuilder/cc3.23.html
            const SendParams = (data) => WINDOW.parent.postMessage(data, "*");
            CEV("message", (e) => {
                const d = e.data ?? {};
                if (d && d.type) return;
                cc_onParam
                    ? FoP(d, (k, v) => cc_onParam(k, v, e.action))
                    : (cc_paramHold = d);
            }, WINDOW);
            let cc_onParam;
            let cc_paramHold;
            const OnParam = (fn) => (
                (cc_onParam = fn),
                cc_paramHold && FoP(cc_paramHold, (k, v) => fn(k, v)),
                (cc_paramHold = 0)
            );
```

- **`SendParams(data)`** — posts the bare map to **`WINDOW.parent`** with target `"*"`. When the piece is the top-level document, `parent === window` and the host still receives the message. **Do not** use `WINDOW.postMessage` on self only — that updates `cc_onParam` inside the iframe but **never reaches** dev-ui.
- **`cc_onParam`** — optional callback assigned by the piece (e.g. `cc_onParam = (key, value, action) => { ... }`). The core registers **one** `message` listener up front; it forwards bare maps (messages with a `type` field are ignored) and calls `cc_onParam(key, value, e.action)`. A map that arrives before the handler is assigned is held and replayed by **`OnParam(fn)`**. Assign **outside** the per-frame draw path so the handler is not recreated every tick.
- **`OnParam(fn)`** — assign `cc_onParam` and flush any held map (same slot, no listener stacking). Prefer **`cc_onParam`** when authoring new pieces.

**Audit items (implementation phase):**

1. **Origin / spoofing:** core does not filter `event.origin`; tight hosts should validate before forwarding bare maps into art if needed.
2. **`FoP` payload:** host should send a **plain object** map; non-objects passed through may throw inside `FoP` — acceptable tradeoff for minified size.
3. **Minify size:** keep edits **short** (one-liners, `CEV`, `FoP`).

**Sync:** If [`.builder/cc3.23.html`](../../.builder/cc3.23.html) is the canonical template, apply the same minimal edits there when reconciling forks (per STAGING).

---

## 9. Build pipeline interaction

- **Scan input:** canonical project source files (`core.html`, `setup.js`, `defs.js`, `functions.js`, `draw.js`, `cert.js`, `metadata.js`) **plus** any files reached via **`//import<path>`** (transitive closure; `collection.js` is scanned for imports when present), using raw on-disk content from `state.files` and resolved import paths. Canonical list: [`source_inventory.js`](../source_inventory.js). Scanned **before** line comments are stripped for minified bundles.
- **Output (dev state):** `paramSchema` (and errors) stored in dev `state` / `dev.json`; optional attachment to build metadata is a separate product decision.
- **Output (artifact for end users):** each successful build writes a **Markdown catalog** of all scanned parameters next to other piece outputs, e.g. **`{projectPath}/output.params.md`** (exact name fixed in implementation; must follow the existing `output.<name>.<ext>` naming habit used by [`builder.js`](./builder.js)). If the scan finds **no** parameters, still write the file with a short heading and a line such as “No `//PARAM-*` definitions in this piece.” so hosts can rely on the path existing.
- **Content of `output.params.md`:** human-readable reference for **hosts and integrators** of the compiled artwork — list every parameter with **name**, **type**, type-specific **constraints** (ranges, steps, choices, defaults), and **description** (§4.1). Treat **`PARAM-DROPDOWN`** like **`PARAM-CHOICE`** in the catalog (same constraints line: list of allowed strings), with wording that the **author-facing** difference is **UI** (dropdown vs strip). Suggested structure:
  - Title + one-line intro (piece / build id optional).
  - Table or section per parameter: columns or bullets for **Name | Type | Constraints | Default | Description**.
  - Short note that runtime control uses **`cc_onParam`** / **`SendParams`** (optional **`OnParam(fn)`**) and points to this spec or a shorter “integration” appendix.
- **Minified artwork:** contains injected small runtime + initial values baked or loaded; **no** `//PARAM-*` lines in shipped JS. The **`.md` file is not** embedded in the minified bundle unless separately desired; it ships as a **sibling file** for documentation and host UI generation.

---

## 10. Implementation phases (checklist)

| Phase | Deliverable |
|-------|-------------|
| **P1 (this doc)** | PARAM-SPEC.md committed; team alignment on JSON-in-brackets and duplicate-name policy. |
| **P2** | `param_scan.js` + tests; `state.paramSchema` / `paramScanErrors`; **`output.params.md`** each build. |
| **P3 (partial)** | **`GET` / `POST /params`**, `state.paramValues` + `dev.json`; WS `{ type: 'params', values }` (advBuilder dev shell); dev-ui **Parameters** section (collapsible stack, persisted section state, iframe sync); **`postMessage`** bare `{k:v}`; canvas **`cc_onParam`** + single `message` listener + **`FoP(e.data ?? {}, …)`** (host must send a plain map). |
| **P4** | dev-ui **§7.2** (row layout, slider capture + styling, CHOICE vs DROPDOWN); `param_scan` + tests for **`PARAM-DROPDOWN`**; tighten host origin policy if needed; **§7.1** polish. |
| **P5** | Minified path + host docs for voice/API puppeteering drivers. |

---

## 11. Revision history

| Date | Change |
|------|--------|
| *(initial)* | First spec from advBuilder PARAM plan: markers, JSON payloads, runtime API, dev-ui + host contracts, phases. |
| *(revision)* | §7.1 ad hoc params (infer UI, clear removes undefined keys). §8.1 canvas core (`cc3.23.html`) audit: `SendParams`/`OnParam`, origin bug note, minify-size constraint; P4/P5 checklist tweaks. |
| *(revision)* | §4.1 trailing description + `output.params.md` catalog; fixed table; cross-ref cleanup; empty-params file; `builder.js` link path fix. |
| *(implementation)* | P3 partial: `/params` API, `paramValues`, WS `params`, dev-ui Parameters section + iframe `postMessage`; `cc3.23.html` / `.builder` `OnParam` fix; FLOAT 5-tuple + STRING `null` in scanner. |
| *(revision)* | §8 host→iframe: **bare** `{k:v}` `postMessage` data (no envelope); `OnParam` = `FoP(e.data??{}, …)` with no `typeof` guard (host must send a map). |
| *(revision)* | §7.2 Parameters section layout (50px name, single-row sliders + value column sizing), pointer-capture slider drag, styled range; **`PARAM-DROPDOWN`** vs **`PARAM-CHOICE`** (strip vs select). |
| *(revision)* | §8 host→iframe: **incremental** `postMessage` patches from dev-ui (changed keys only); full map on preview reload / `update`; optional **`null`** for removed keys. |
| *(revision)* | §4.2 **Boolean wire format:** `PARAM-BOOLEAN` canonical values **`0` / `1`**; marker may use `true`/`false` or `0`/`1`; scanner normalizes; dev-ui POSTs ints; §8 `postMessage` note. |
| *(revision)* | §8 WS diff: JSON-aware value equality for nested param values; dev-ui skips duplicate iframe `postMessage` payloads. (Superseded for §8.1: `OnParam` remove/re-add replaced by **`cc_onParam`** + single listener.) |
| *(revision)* | §8.1: single core `message` listener + **`cc_onParam`** slot; **`OnParam(fn)`** = assign slot (legacy compat). |
| *(revision)* | §7 dev-ui: collapsible **Parameters | Values | Properties** stack (one scroll); Properties uses groups + levels ([PROPERTIES-PANEL.md](./PROPERTIES-PANEL.md)). |
| *(revision)* | Intro + §9 catalog + **P3** checklist: **`cc_onParam`** / **`OnParam(fn)`** wording; P3 row reflects WS value-diff + persisted sections. |
| *(revision)* | §4: **`PARAM-HSL`** row *(planned)* + colour plan cross-link; **`PARAM-BUTTON`** points to trigger-count plan in [PARAM-COLOR-PLAN.md](./PARAM-COLOR-PLAN.md) §2; §7.2 colour bullet. |
| 2026-05-15 | §4: **normalized HSV/HSL** (H 0–360, S/V/L/A 0–1); **`PARAM-COLOR` deprecated**; colour UX/commit-only `dev.json`/HSVA clipboard → [PARAM-COLOR-PLAN.md](./PARAM-COLOR-PLAN.md) §10, [PARAM-COLOR-IMPL.md](./PARAM-COLOR-IMPL.md). |
| 2026-05-15 | **`PARAM-BUTTON`:** dev-ui trigger count 1…n per page load; stripped from `dev.json` on save/load (`param_persist.js`). |
| 2026-05-15 | **`PARAM-HSL`** implemented in `param_scan.js` (H 0–360, S/L/A 0–1); swatch + picker via `param_color.js`. |
| 2026-05-15 | **`PARAM-COLOR`:** scan hard-error + migration hint; no dev-ui row; legacy keys stripped from `dev.json` on load/save when marker still in source (`param_persist.js`). |
| 2026-05-15 | **Colour picker shipped** (§7.2): swatch + Iro HSVA editor; accept-only `dev.json`; legacy HSV `{r,g,b,a}` → `{h,s,v,a}` on scan (`param_color.migrateParamValues`). |
| 2026-06-21 | **Colour picker header:** **×** = accept; **Cancel** + **Esc** = revert to pre-open colour (param + settings pickers). **Viewport BG:** fill swatch shared for solid/checker cell 1; alternate swatch when checkbox off — [VIEWPORT-BACKGROUND.md](./VIEWPORT-BACKGROUND.md). |
| 2026-05-15 | **Art → dev-ui:** `SendParams` bare maps update Parameters panel + server memory (`persist: false`); WS `params` also refreshes panel. |
| 2026-05-16 | **SendParams target:** canvas core must use `WINDOW.parent.postMessage`; advBuilder patches legacy self-only builds (`param_sendparams_patch.js`). dev-ui: coerce, `updateParamsUI`, relay, batched `POST /params` (`persist: false`, `broadcast: false`). Nested preview: `visualise_param_bridge.js` bubbles art → dev-ui. |
| 2026-05-23 | **`PARAM-VEC2` planned:** 5-tuple `[name, default, min, max, step]`; wire `{ x, y }`; dev-ui square pad + relative drag — [PARAM-VEC2-PLAN.md](./PARAM-VEC2-PLAN.md). |

When the parser or wire format changes, bump this table and add a **“Migration”** subsection if authors must edit old markers.
