# PARAM-VEC2 — 2D vector parameter (design / spec delta)

**Status:** *Planned* — not yet implemented in `param_scan.js`, `param_coerce.js`, or dev-ui.

**Normative home (when shipped):** [PARAM-SPEC.md](./PARAM-SPEC.md) §4 (type table), §7.2 (dev-ui row), §8 (wire format).

**Motivation:** Replace pairs of coupled **`PARAM-FLOAT`** axes (e.g. `lookX` / `lookY`) with one typed 2D control: a **planar pad** plus **x/y fields**, shared min/max/step, and a single wire value for art and hosts.

**Related:** [PARAM-SPEC.md](./PARAM-SPEC.md) §7.2 (50px name column, pointer capture), [PARAM-COLOR-PLAN.md](./PARAM-COLOR-PLAN.md) (multi-component typed wire shapes).

---

## 1. Authoring marker

```text
//PARAM-VEC2:["look", [0, 0], [-1, -1], [1, 1], 0.01]  2D direction / look vector
```

| Index | Field | Type | Meaning |
|-------|--------|------|---------|
| `0` | `name` | string | Parameter key (e.g. `look`) |
| `1` | `default` | `[x, y]` | Default vector (JSON array of two numbers) |
| `2` | `min` | `[x, y]` | Per-axis minimum |
| `3` | `max` | `[x, y]` | Per-axis maximum |
| `4` | `step` | number | Scalar step applied to **both** axes (same policy as `PARAM-FLOAT` step) |

**Validation (`param_scan.js`):**

- Array length must be **exactly 5**.
- `default`, `min`, and `max` must each be JSON arrays of **two finite numbers**.
- `min[0] <= max[0]` and `min[1] <= max[1]`.
- `step > 0`.
- `default[0]` clamped into `[min[0], max[0]]`, `default[1]` into `[min[1], max[1]]` at scan time (or scan error if out of range — prefer **error** for author mistakes, same as FLOAT).

**Scanned schema fields:**

```javascript
{
  type: "PARAM-VEC2",
  name: "look",
  default: { x: 0, y: 0 },
  min: { x: -1, y: -1 },
  max: { x: 1, y: 1 },
  step: 0.01,
  description: "…",
  declaredIn: { file, line }
}
```

Internal storage uses **`{ x, y }`** objects (mirrors `PARAM-RGB` / `PARAM-HSV`); the marker’s `[x, y]` arrays are normalized at scan time.

**Example (future migration):**

```javascript
//PARAM-VEC2:["look", [0, 0], [-1, -1], [1, 1], 0.01]  manual eye look direction
// replaces:
//PARAM-FLOAT:["eyex", 0, -1, 1, 0.01]
//PARAM-FLOAT:["eyey", 0, -1, 1, 0.01]
```

Until implementation lands, a bare `//PARAM-VEC2:…` line in source produces a scanner error: **Unknown PARAM type "VEC2"**. Keep the marker **double-commented** (`// //PARAM-VEC2:…`) or in this plan doc only until P-VEC2 ships.

---

## 2. Wire format (runtime / `postMessage` / `dev.json`)

**Canonical shape:** plain object **`{ x: number, y: number }`**.

**Accepted on ingest (`SendParams`, `POST /params`, coerce):**

| Input | Coercion |
|-------|----------|
| `{ x, y }` | Clamp each axis to `[min, max]`, snap to `step` (reuse `snapToStep` per axis). |
| `[x, y]` | Treat as `{ x: arr[0], y: arr[1] }`. |
| Separate keys (legacy) | **Not** auto-merged; hosts must send one object under the VEC2 name. |

**Rejected:** wrong types, NaN, missing axis, objects with extra keys only (extra keys ignored if `x`/`y` present).

**Art usage:**

```javascript
OnParam((key, val) => {
  if (key === "look") {
    eyeX = val.x;
    eyeY = val.y;
  }
});

// Outbound
SendParams({ look: { x: 0.2, y: -0.1 } });
```

**`cc_onParam` replay:** late registrants receive `{ x, y }` for VEC2 keys.

**Persistence:** stored in `dev.json` `paramValues` as `{ x, y }` (same as committed colour objects).

---

## 3. dev-ui row layout

VEC2 breaks the usual **single-line** parameter row height. One parameter occupies **~3 lines** (~48px control block — align with `.param-row textarea.param-json` min-height).

```
┌────────┬──────────────────────┬────────┐
│  look  │                      │  x     │  ← line 1
│ (50px) │    square pad        │ [0.00] │
│        │    + marker          ├────────┤
│        │                      │  y     │  ← line 2–3
│        │                      │ [0.00] │
└────────┴──────────────────────┴────────┘
```

| Region | Spec |
|--------|------|
| **Name column** | Existing **50px** `.param-name` (§7.2). Vertically centered against the pad block (3-line row). `title` / `aria-label` from description. |
| **Pad (middle)** | Square **`param-vec2-pad`**, fixed aspect **1:1**, height ≈ **3 × 16px** (~48px). Border matches range wrap (`#6a8f6e`). Optional faint crosshair at `(0,0)` when origin lies inside range. |
| **Marker** | **`param-vec2-marker`** — contrasting dot/handle at current `(x,y)` mapped into the pad. `pointer-events: none` on marker; hit-testing uses pad. |
| **Value column (right)** | Two stacked **`input type="number"`** fields, same sizing as `.param-val-col` (**~5ch**, max **~10ch**), labels **`x`** / **`y`** (small, left of or above each field). `min`/`max`/`step` from schema per axis. |

**CSS class sketch:** `.param-row.param-vec2-row { align-items: stretch; min-height: 48px; }`

---

## 4. Pad coordinate mapping

Map value space ↔ pad pixels **per axis** (linear):

- **Horizontal:** left edge = `min.x`, right edge = `max.x`.
- **Vertical:** **y-up** in the pad — bottom edge = `min.y`, top edge = `max.y` (mathematical convention; intuitive for “look up = positive y”).

```javascript
// value → pad fraction (0..1)
function vec2ToPadFrac(v, min, max) {
  return (v - min) / (max - min);
}

// pad fraction → value (before clamp/snap)
function padFracToValue(frac, min, max) {
  return min + frac * (max - min);
}
```

Pointer `(px, py)` relative to pad inner rect → fractions → `{ x, y }` → clamp + snap.

---

## 5. Interaction model

Use **Pointer Events** with **`setPointerCapture`** on the pad (same pattern as §7.2 range sliders and colour picker drag). Track active drag in **`paramVec2DragEl`** (or equivalent) so **`updateParamsUI()`** is skipped mid-drag (mirror `paramRangeDragEl` / `isParamRangeDragging()`).

### 5.1. Click — absolute jump

**Click** on the pad (press + release without entering drag mode — movement below a small threshold, e.g. **3px**):

- Map pointer position **directly** to `{ x, y }` (clamp + snap).
- **`postParamPatch`** immediately (`persist: true` on release, or live preview during move — see §5.3).

The vector **jumps** to the clicked location; no offset from the previous value.

### 5.2. Drag — relative from press

**Press + drag** (movement ≥ threshold, or `pointermove` while captured):

1. On **`pointerdown`:** record **`dragStartVec`** = current `{ x, y }` (coerced value at press time), and **`dragStartPad`** = pointer position converted to **value space** `{ x, y }` (not pixels).
2. On **`pointermove`:**  
   **`delta = currentPadValue − dragStartPad`** (component-wise)  
   **`next = dragStartVec + delta`** (component-wise)  
   then clamp + snap per axis.
3. On **`pointerup` / `pointercancel`:** release capture; clear drag state; final **`postParamPatch`** with `broadcast: true` if not already committed.

**Why relative:** avoids the marker **jumping** under the finger on drag start when the user grabbed the marker or empty pad intending to *nudge*, not teleport. Click-without-drag still teleports (§5.1).

**Note on “multiplied”:** delta is already in **value space** because `dragStartPad` and `currentPadValue` are computed via §4 mapping (pixel delta × `(max−min)/padSize` per axis). No extra gain factor unless a future type adds one.

### 5.3. Live preview vs commit

| Phase | Behaviour (align with `PARAM-FLOAT` slider) |
|-------|---------------------------------------------|
| **During drag / typing in x/y fields** | **`postParamPatch(..., { broadcast: false })`** — iframe `postMessage` only; skip panel rebuild. |
| **Pointer up / field blur / Enter** | Full patch — `dev.json` + WS `{ type: 'params' }`. |

Editing **x** or **y** number field updates the marker position and posts the full `{ x, y }` object (not partial keys).

---

## 6. Implementation checklist

| Area | Task |
|------|------|
| **`param_scan.js`** | Add `VEC2` to `KNOWN_TYPES`; parse 5-tuple; normalize to `{ x, y }` defaults/min/max; tests. |
| **`param_coerce.js`** | `case "PARAM-VEC2"`: accept `{x,y}` / `[x,y]`; per-axis clamp + `snapToStep`; tests. |
| **`param_scan.js`** | `renderParamsMarkdown`: constraints line e.g. `default \`{x:0,y:0}\`, min …, max …, step \`0.01\``. |
| **`dev-ui.html`** | CSS (§3), `renderParamVec2Row`, pad pointer handlers (§5), `bindParamPanel` x/y inputs; drag guard for `updateParamsUI`. |
| **`param_readout.js`** | Readout: `x: 0.00, y: 0.00` (driver hosts). |
| **`param_persist.js`** | No special case (object serializes like colour params). |
| **`PARAM-SPEC.md`** | Move §1–§5 of this doc into type table + §7.2; revision table entry. |
| **VEC2 adoption** | Optional migration: `look` VEC2 + `setup.js` reads `params.look.x/y`; deprecate separate axis floats. |

---

## 7. PARAM-SPEC.md delta (copy when implementing)

### §4 type table — add row

| Marker | JSON array shape | Notes |
|--------|------------------|--------|
| `PARAM-VEC2` | `[name, [dx, dy], [minX, minY], [maxX, maxY], step]` | 2D vector. Wire: `{ x, y }`. **dev-ui:** square pad (~3 lines tall), draggable marker, stacked **x** / **y** fields; click = absolute jump, drag = relative delta from press. See [PARAM-VEC2-PLAN.md](./PARAM-VEC2-PLAN.md). |

### §7.2 — add bullet under “Other types”

- **`PARAM-VEC2`:** multi-line row (~48px): **50px name** + **square pad** (y-up mapping) with **marker** + stacked **x/y** numeric fields. **Click** pad → jump to position. **Drag** → `newVec = startVec + (currentPad − startPad)` in value space, then clamp/snap. Pointer capture + live iframe preview during drag; persist on release / field commit. Full spec: [PARAM-VEC2-PLAN.md](./PARAM-VEC2-PLAN.md).

### §11 revision history — add row

| Date | Change |
|------|--------|
| 2026-05-23 | **`PARAM-VEC2` planned:** 5-tuple marker, wire `{ x, y }`, pad UI — [PARAM-VEC2-PLAN.md](./PARAM-VEC2-PLAN.md). |

---

## 8. QA checklist (manual, post-impl)

- [ ] Scanner accepts valid 5-tuple; errors on bad lengths, non-numeric pairs, `min > max`, `step <= 0`.
- [ ] Default merged into `paramValues` on build; appears in `output.params.md`.
- [ ] Pad click jumps marker; small drag does not jump on pointerdown.
- [ ] Drag relative: grabbing marker at `(0.5, 0)` and moving right increases `x` from `0.5`, not from click point only.
- [ ] x/y fields stay in sync with marker; min/max/step enforced.
- [ ] Live iframe update during drag; `dev.json` updates on release.
- [ ] `SendParams({ look: [0.2, -0.1] })` coerces and relays `{ x: 0.2, y: -0.1 }`.
- [ ] WS / art `SendParams` does not destroy pad mid-drag.
