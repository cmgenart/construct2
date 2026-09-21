# Colour parameters & picker — design review (advBuilder dev-ui)

**Behaviour spec** for advBuilder colour parameters and **PARAM-BUTTON** (implemented). Normative marker grammar: [PARAM-SPEC.md](./PARAM-SPEC.md). Build history: [PARAM-COLOR-IMPL.md](./PARAM-COLOR-IMPL.md). Manual QA: [PARAM-COLOR-TEST.md](./PARAM-COLOR-TEST.md).

**Related:** [PARAM-SPEC.md](./PARAM-SPEC.md) §4 (types), §7.2 (dev-ui), §8 (host bridge).

---

## 1. Summary of goals (from review)

| Topic | Desired behaviour |
|--------|-------------------|
| **PARAM-BUTTON** (“trigger”) | Send a **small integer**: **trigger count** starting at **1**, incrementing each activation. **Not** a large timestamp. Reset count to **1** whenever the dev-ui page loads (no persistence). |
| **Colour params (RGB / HSV / HSL / HEX)** | In the Parameters panel: **swatch** preview with **numeric / hex readout** overlaid. **At most one** floating colour editor for the whole dev-ui (see §4). **`PARAM-COLOR` is deprecated** (§6). |
| **Floating editor** | Sits **above** the left stack **and** the art iframe (`z-index` + positioning). **Draggable** chrome. Opens **near** the swatch. **Live preview** to the art iframe while adjusting (§4); **`dev.json` only on accept** (§5.0). **Accept** and **cancel** paths: §4–§5. |
| **Cancel** | Close the picker **without** applying this session’s edits: restore the param to the value it had **immediately before this picker opened** (iframe `postMessage`; **no** `dev.json` write). **Esc**, the header **Cancel** button, and the toolbar **Cancel** button all map here. **Not** an accept. |
| **Accept (×)** | Header **×** button commits the current colour and closes — same as backdrop click and **Enter** (§5.0). |
| **Session Undo / Redo** | **Per-property** stack of **committed** colours for the **currently edited** param. Stack **resets when the art project is opened** in the builder (not persisted across app restarts or switching projects). Walks back toward that property’s colour **as it was when the project was opened**. Picker toolbar **Undo / Redo** use this stack. |
| **Ctrl+Z / Ctrl+Y** (picker focused) | Steps through the same per-property committed-colour stack as the picker’s **Undo / Redo** buttons. If the colour picker is **closed**, **Ctrl+Z / Ctrl+Y do nothing** (no global shortcut). |
| **Clipboard** | Small **copy** / **paste** icons; **Ctrl+C** / **Ctrl+V** while the dialog is open. Canonical wire format: **HSVA** object `{ h, s, v, a }` with **H** 0–360, **S/V/A** 0–1 (picker-internal; paste only within the HSVA picker). |
| **PARAM-HSL** | **New** marker type: `[name, H, S, L, A]` — **H** 0–360, **S/L/A** **normalized 0–1** (same policy as HSV; suits envelope workflows). |
| **PARAM-COLOR** | **Deprecated** — do not use in new art; scanner **errors** (§6). Use **RGB**, **HSV**, **HSL**, or **HEX** instead. |

---

## 2. PARAM-BUTTON / trigger — specification delta

**Shipped (dev-ui):** Monotonic trigger count `1, 2, 3…` per page load via `postParamPatch`; not stored in `dev.json`.

**Proposed:**

- Per-parameter **in-memory counter** in dev-ui only: `triggerCount[name]`, initial value **`1`** on full page load (and optionally reset when the Parameters panel is rebuilt if you want stricter “session = panel session” semantics; default: **reset on full dev-ui load** only).
- On each button press: `POST` value **`triggerCount[name]++`** *after* read (first fire sends **1**, second **2**, …), or send then increment depending on taste; document one rule and stick to it.
- **Wire format:** integer JSON number in `paramValues` / `postMessage` (unchanged type from art’s perspective: it receives a number).
- **Persistence:** do **not** write trigger counts to `dev.json` (or strip on save) so reopening the UI always starts at **1** unless you later add an explicit “persist triggers” flag.

**Art contract:** Pieces that today expect a timestamp should switch to “monotonic trigger id” or compare `>` previous value; document migration in PARAM-SPEC revision table when implemented.

---

## 3. Colour row UX — swatch + label

**Row layout (all colour-related types):**

- Left: existing **50px name** column (unchanged).
- Middle: **swatch** (fixed aspect, e.g. 24×24 or 28×28, border-radius 4px, border 1px solid `#888`).
- Overlay on swatch (or adjacent compact strip): **readout** as text — format per type:
  - **PARAM-RGB**: e.g. `255, 128, 64, 1` (R/G/B 0–255, A 0–1).
  - **PARAM-HSV** / **PARAM-HSL**: e.g. `200, 0.5, 0.9, 1` — **H** 0–360, **S/V/L/A** **normalized 0–1** (Canvas Core normalization is a **later** change — out of scope).
  - **PARAM-HEX**: `#rrggbb` (or normalized form you choose).
- Clicking the **swatch** (or a small “edit” affordance) opens the **floating picker** (§4).

**Accessibility:** `role="button"` or real `<button>` wrapper, `aria-label` including current readout.

---

## 4. Floating colour dialog — behaviour

**Mounting:**

- Append dialog to **`document.body`** (or `#main`) so it is not clipped by `#left-scroll` `overflow`.
- **`z-index`** above `#divider`, `#left`, `#right`, `#status` (e.g. 5000+) and below any future modal crisis UI if you add one later.
- **Position:** `position: fixed`; initial `top`/`left` from **swatch `getBoundingClientRect()`** + offset clamped to viewport; after drag, store `translate` or `left/top` until close.

**Dragging:**

- Drag handle on header (preferred) or draggable chrome; `pointerdown` / `pointermove` / `pointerup` with optional `setPointerCapture` (same pattern as §7.2 sliders).

**Single dialog:** At most **one** colour picker instance. If the user clicks a **different** colour **swatch** while the picker is already open, that is treated as a **commit** of the **current** param’s colour (same as **Enter** or **click outside** — §5.0), **then** the picker **re-opens** for the newly clicked param (new opening snapshot for that row). Do **not** silently discard the in-progress edit when switching rows.

**Interaction contract:**

| Action | Effect |
|--------|--------|
| **Dragging / moving controls inside picker** | Update **local** colour model; **iframe `postMessage` preview** on every change where the value actually changed (no `dev.json` write). See §5.0 for **commit**. |
| **Click outside the dialog** (backdrop, not on swatch) | **Accept** (§5.0): persist current colour, **close** picker. |
| **Enter / Return** while the dialog is focused | **Accept**: same as backdrop; **close**. |
| **×** (header, right) | **Accept**: same as backdrop / Enter; **close**. |
| **Click a different colour swatch** (another param) while the picker is open | **Accept** the current param’s colour first (**same** as Enter/outside), **close** that step, then **open** the picker for the swatch that was clicked (new param, new opening snapshot). |
| **Cancel** (header or toolbar button) or **Esc** | Restore the colour that was current **before this picker was opened** (iframe preview only — server/`dev.json` unchanged); **close** the dialog. **No accept**. |
| **Undo / Redo** (toolbar) | Step through the **per-property committed-colour** stack (§5.3). If the picker is open, **refresh** it from `paramValues` after each step so the readout matches the art. |
| **Ctrl+Z / Ctrl+Y** while the dialog is focused | Keyboard shortcuts for the **same** undo/redo stack as the picker’s toolbar buttons (§5.3). **Does not close** the dialog. If the picker is **closed**, **Ctrl+Z / Ctrl+Y do nothing**. |
| **Copy / Paste** (toolbar icons) or **Ctrl+C / Ctrl+V** while the dialog is focused | Clipboard helpers; invalid paste → error, **stay open**. |

**Terminology:** Use **Cancel** for “close without applying the picker session — back to pre-open colour.” Use **Accept** (×, backdrop, Enter) for “commit current colour and close.” The same header **Cancel** / **×** pair applies to settings pickers (e.g. viewport background fill/alternate). There is **no** separate in-picker “revert” that leaves the dialog open.

---

## 5. Accept, cancel, undo — semantics

### 5.0. Accept / commit (authoritative)

An **accept** (commit) happens when:

- The user **closes** the picker after **accepting** the current colour, via **any** of: header **×**, **click outside** the picker, **Enter / Return**, or **clicking a different colour swatch** (which first accepts the active param, then opens the next — §4).

On accept: **`POST /params`** (or settings callback for non-param sessions) updates in-memory values and **`dev.json`**, converts to the param’s **native** wire shape, and syncs the iframe. **Preview-only** edits during the open session never touched `dev.json`.

### 5.1. Cancel (authoritative)

**Cancel** = end the picker session **without** applying edits relative to when the dialog **opened**.

- Restore the param to the value it had **immediately before** this dialog was opened (**opening snapshot**) via **iframe preview only**.
- **Close** the dialog.
- **Do not** treat the picker exploration as an **accept**: **`paramValues` / `dev.json`** were never updated for in-session preview (only **accept** writes them).

**UI:** Header **Cancel** button + toolbar **Cancel** + **Esc** (same behaviour).

### 5.2. Conversion on commit

On **commit** (backdrop, Enter, or **other swatch**), convert from the picker’s internal model to the param’s **native** wire shape and persist:

| Param type | Stored shape |
|------------|----------------|
| PARAM-RGB | `{ r, g, b, a }` or tuple per existing wire |
| PARAM-HSV | `{ h, s, v, a }` — **H** 0–360, **S/V/A** 0–1 |
| PARAM-HSL | `{ h, s, l, a }` — **H** 0–360, **S/L/A** 0–1 |
| PARAM-HEX | `#rrggbb` string |

Conversion must match **param_scan** / **PARAM-SPEC** canonical ranges.

**Picker internals:** The floating control uses an internal **HSVA** model (**H** 0–360, **S/V/A** 0–1). **Live preview** converts to the param’s native type for each changed frame and sends **iframe `postMessage` only**. **Commit** uses the same conversion, then **`POST /params`** persists to `dev.json` (§5.0).

---

### 5.3. Undo / Redo (per-property, committed colours)

**Session undo stack**

- **Reset** whenever the **art project is opened** in the builder (new `state` / dev session for that project). **Not persisted** across closing the app, switching projects, or reloading the page unless you explicitly add persistence later.
- Stack contents: **committed colours only**, scoped to the **currently edited property** (the param whose picker is open). Lets the user walk back toward that property’s colour **as it was when the project was opened** (baseline snapshot taken at project load).
- Picker **Undo / Redo** buttons operate on this stack. If the picker is open, **re-sync** the picker UI from `paramValues` after each undo/redo so the focused param stays accurate.

**Keyboard shortcuts** (**Ctrl+Z** / **Ctrl+Y** while dialog focused)

- While the picker dialog is focused, **Ctrl+Z / Ctrl+Y** step through the **same** per-property committed-colour undo stack as the toolbar buttons.
- If the picker is **closed**, **Ctrl+Z / Ctrl+Y do nothing** (no global undo/redo for colours).
- Undo/redo **does not close** the dialog.

**Copy / Paste** (toolbar + **Ctrl+C** / **Ctrl+V**)

- **Copy:** write current picker colour to the clipboard as **HSVA** JSON, e.g. `{"h":200,"s":0.5,"v":0.9,"a":1}` (**H** 0–360, **S/V/A** 0–1). Copy/paste is only used **within** the HSVA picker UI.
- **Paste:** parse clipboard as HSVA; invalid paste → error, stay open; on success update Iro and live preview (still no `dev.json` until commit).

---

## 6. PARAM-COLOR — deprecated

**Decision: Option C — deprecate `PARAM-COLOR`.**

- Not used in current projects; safe to remove from the product surface now.
- **New art** should use **`PARAM-RGB`**, **`PARAM-HSV`**, **`PARAM-HSL`**, or **`PARAM-HEX`** only.
- **Scanner:** stop accepting new `//PARAM-COLOR` markers (scan **error** with migration hint), or treat as **deprecated warning** if you need to read legacy sources briefly — prefer **hard error** at scan time since nothing in-repo depends on it.
- **dev-ui:** no swatch/picker row for `PARAM-COLOR`. Scan errors cite file/line; legacy keys for that name are stripped from `dev.json` on load/save while the marker remains in source.

---

## 7. New type: PARAM-HSL

**Marker (proposed):**

```text
//PARAM-HSL:["name", H, S, L, A]  description…
```

**Scanner (`param_scan.js`):**

- Mirror **PARAM-HSV** validation: five numeric elements; **H** 0–360, **S/L/A** **normalized 0–1** (document in PARAM-SPEC §4).

**dev-ui:**

- Same swatch + picker path as HSV; conversion at boundary only.

**PARAM-SPEC:** Add row to type table + §7.2 note when implemented.

---

## 8. Picker library — Iro.js (`@jaames/iro`)

**Why consider it:** Modular layout (wheel + sliders), **no hard dependency** on jQuery, **~9kb** gzipped (order-of-magnitude; verify at lock time), supports **HEX, RGB, HSL, HSV**, alpha on colour object ([Color API](https://iro.js.org/color_api.html)), `color:change` for live updates ([guide](https://iro.js.org/guide.html)).

**Layout goals (your note):**

- **Radial hue** with **white / low saturation toward centre** and **full saturation at rim** is a common **HSV wheel** pattern. Iro’s **wheel** has options such as **`wheelLightness`** (default fades wheel toward black with lower lightness — tune for your look). A **“white centre”** saturation layout may require **`Box`** + **`Wheel`** components together or a **custom layout** ([advanced layouts](https://iro.js.org/advanced.html#custom-ui-layouts)).
- **Sliders for H, S, V, A** (and/or L for HSL mode): Iro supports **slider** components in the `layout` array; map to your required channels.

**Licensing:** MIT ([GitHub `jaames/iro.js`](https://github.com/jaames/iro.js)).

**Integration options:**

1. **Vendor** `iro.min.js` into `.advBuilder/` next to dev-ui and load via `<script>` in `dev-ui.html` (simplest for Electron iframe).
2. **npm** ` @jaames/iro` and bundle — only if you introduce a small build step for dev-ui (probably overkill v1).

**Risks / checks:** Touch behaviour inside iframe + Electron; memory leak on repeated open/close (`picker.off` + destroy); **CSP** if you add one later.

---

## 9. Implementation checklist

All items **shipped** (see [PARAM-COLOR-IMPL.md](./PARAM-COLOR-IMPL.md)):

1. **PARAM-BUTTON** counter + PARAM-SPEC §4 / §7  
2. **Swatch rows** for RGB / HSV / HSL / HEX  
3. **Floating shell** (backdrop, drag, z-index, single instance)  
4. **Iro** + per-frame iframe preview + accept-only `dev.json` + cancel snapshot  
5. **Undo / redo** + Ctrl+Z/Y (picker focused) + HSVA clipboard  
6. **`PARAM-HSL`** scanner + conversions  
7. **Deprecate `PARAM-COLOR`** (scan error + `dev.json` strip)  
8. **Electron** clipboard IPC; touch CSS on Iro mount; legacy HSV wire migration  

---

## 10. Resolved decisions

| Topic | Decision |
|--------|----------|
| **HSV / HSL component ranges** | **Normalized:** **H** 0–360, **S/V/L/A** 0–1 in `paramValues` and picker. Suits envelope-oriented colour work. **Canvas Core** may align later — **out of scope** for this implementation (do not change CC colour handling during the current art project). |
| **`PARAM-COLOR`** | **Deprecated** (§6). No dev-ui support; scanner hard-error. |
| **Live preview** | Push to the iframe **every frame** the picker value **actually changes**; **no** `dev.json` / server persist until **commit**. |
| **`dev.json`** | Written **only on colour commit** (and existing non-colour param POST behaviour unchanged). |
| **Clipboard** | **HSVA** JSON `{ h, s, v, a }` — copy/paste only within the HSVA picker. |

---

## 11. Revision

| Date | Change |
|------|--------|
| *(initial)* | Author review draft from discussion: button counter, swatch + floating Iro-style picker, HSL type, PARAM-COLOR options. |
| *(revision)* | **Accept:** × / backdrop / Enter / **other swatch** (accept current then reopen). **Cancel:** Esc / header or toolbar Cancel — restore **pre-open** colour to iframe only (no `dev.json` write). Undo/redo for **committed colours only**; **Ctrl+Z/Y only while picker is open** (§5.3). Copy/paste + Ctrl+C/V. Single floating dialog. Persist `dev.json` on accept only. |
| 2026-06-21 | **Header UX:** **×** = accept/commit; **Cancel** (header + toolbar) + **Esc** = revert to pre-open colour. Same for param and settings pickers (viewport BG). |
| 2026-05-15 | **Locked:** normalized HSV/HSL (H 0–360, S/V/L/A 0–1); deprecate **PARAM-COLOR**; iframe preview every changed frame; **`dev.json` commit-only**; clipboard **HSVA**; CC colour normalization deferred. |
| 2026-05-15 | **Implemented:** Phases 0–8 (button counter, swatches, Iro picker, undo, clipboard, HSL, **PARAM-COLOR** hard-error + legacy `dev.json` strip). See [PARAM-COLOR-IMPL.md](./PARAM-COLOR-IMPL.md). |
| 2026-05-15 | **Phase 9:** touch/WS/docs hardening; legacy HSV wire migration; manual checklist [PARAM-COLOR-TEST.md](./PARAM-COLOR-TEST.md). |
