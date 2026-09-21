# Colour picker & PARAM-BUTTON — implementation plan

**Status:** Implemented (phases 0–9)  
**UX / behaviour spec:** [PARAM-COLOR-PLAN.md](./PARAM-COLOR-PLAN.md)  
**Marker grammar:** [PARAM-SPEC.md](./PARAM-SPEC.md)

Historical build plan for **advBuilder** colour params and **PARAM-BUTTON** (phases 0–9 **shipped**). For behaviour, see [PARAM-COLOR-PLAN.md](./PARAM-COLOR-PLAN.md); for markers, [PARAM-SPEC.md](./PARAM-SPEC.md); manual QA: [PARAM-COLOR-TEST.md](./PARAM-COLOR-TEST.md).

---

## 0. Shipped state (post phase 9)

| Area | Implementation |
|------|----------------|
| **Colour rows** | Swatch + readout + shared **Iro.js** picker (`color_picker.js`, `param_color.js`) for RGB / HSV / HSL / HEX |
| **PARAM-BUTTON** | Monotonic trigger count 1…n per dev-ui load; stripped from `dev.json` (`param_persist.js`) |
| **Colour preview** | Iframe `postMessage` only — no `POST /params` while dragging |
| **Colour commit** | `POST /params` → `saveDevJson` + WS; undo/redo in picker also POSTs committed values |
| **PARAM-HSV / HSL** | Scanner wire `{ h, s, v/l, a }`; legacy `{ r, g, b, a }` migrated on scan |
| **`PARAM-COLOR`** | Scan **error**; legacy keys stripped from `dev.json` when marker still in source |
| **Electron** | Clipboard IPC for picker copy/paste in embed shell |

**Modules:** `param_scan.js`, `param_color.js`, `color_picker.js`, `param_persist.js`, `vendor/iro.min.js` (@jaames/iro 5.5.2), wired from `dev-ui.html` and `builder.js`.

---

## 1. Architecture decisions (locked)

### 1.1 Preview vs commit vs `dev.json` (**authoritative**)

**Problem:** `builder.js` today persists on **every** `POST /params`. Colour picker behaviour:

- **Live preview** while dragging: update art **every frame the value changes** (iframe `postMessage` only).
- **Accept** (× header button, backdrop click, Enter) writes canonical value + **`dev.json`** via `POST /params` or settings callback.
- **Cancel** (Cancel header button, toolbar Cancel, Esc) restores **pre-open** value to the iframe only; **no** `dev.json` write.

| Path | Server `state.paramValues` | `dev.json` | Iframe |
|------|---------------------------|------------|--------|
| **Preview** (picker drag) | Unchanged | Unchanged | `applyParamsToIframe({ [name]: previewValue })` when value changed |
| **Accept** | Updated | **Saved** (`saveDevJson`) | `POST /params` + patch |
| **Cancel** | Unchanged | Unchanged | `applyParamsToIframe({ [name]: openingSnapshot })` |

**Implementation:** Extend `POST /params` with optional `{ persist: true }` (default **true** for backward compatibility). Colour **commit** sends `persist: true`; preview does **not** call `POST` at all. Alternatively, a dedicated `POST /params/commit` — prefer **`persist` flag** on existing endpoint to avoid duplication.

Non-colour params (sliders, etc.) keep current behaviour: `POST` + `saveDevJson` on each change unless you later batch them.

**Acceptance:** After a long drag then **Cancel**, `dev.json` and reload show the pre-open colour, not the last dragged colour.

### 1.1b Live preview cadence

- On each Iro `color:change` (or animation frame callback), compare to last-sent preview; if different, convert to native wire shape and `applyParamsToIframe`.
- **No** artificial throttle — send every frame where the value changed.

### 1.2 Wire shapes (must match art + scanner)

Align with example projects and fix scanner defaults:

| Type | `paramValues[name]` shape (proposed) |
|------|--------------------------------------|
| `PARAM-RGB` | `{ r, g, b, a }` numbers |
| `PARAM-HSV` | `{ h, s, v, a }` — **H** 0–360, **S/V/A** **0–1** (normalized; envelope-friendly) |
| `PARAM-HSL` | `{ h, s, l, a }` — **H** 0–360, **S/L/A** **0–1** |
| `PARAM-HEX` | `"#rrggbb"` string |
| ~~`PARAM-COLOR`~~ | **Deprecated** — scanner error; no dev-ui row (§6 colour plan) |

**Canvas Core:** may adopt the same normalization later; **do not change** CC colour handling in this work (author is mid art project).

Document ranges in **PARAM-SPEC §4** (done in spec update).

### 1.3 Undo model (per property, committed only)

```text
colorUndo[name] = {
  baseline,     // deep clone at project open
  stack,        // [baseline, commit1, commit2, ...]
  index,        // current position in stack
}
```

- **Reset** all `colorUndo` when dev-ui loads project state (`fetch('/state')` success) and when Electron switches project (if that reloads dev-ui — hook the same initializer).
- **On commit** for `name`: truncate `stack` after `index`, push new value, set `index = stack.length - 1`.
- **Undo / Redo** (toolbar or **Ctrl+Z / Ctrl+Y** while picker focused): move `index`, `POST` committed value at `stack[index]`, refresh picker UI. **Does not close** picker.
- **Ctrl+Z / Ctrl+Y when picker closed:** no handler (do not `preventDefault` globally).
- **Cancel:** does **not** push undo; restore opening snapshot to iframe only (and skip POST if preview-only).

### 1.4 PARAM-BUTTON persistence

- Client: `triggerCount[name]` starting at **1** on dev-ui load; POST integer on fire.
- Server: on `POST /params`, **strip** `PARAM-BUTTON` keys from object written to `dev.json` (or never merge them in `state.paramValues` for save). Easiest: filter in `saveDevJson()` or omit button keys when assigning from payload if type is BUTTON — requires schema on server or a denylist in dev-ui POST body metadata.

**Simpler v1:** dev-ui never includes button keys in persisted patches; fire uses a dedicated `POST /params/trigger` or POST with header `X-Param-Preview: trigger` that updates iframe broadcast only. **Minimal change:** keep `POST /params` but `builder.js` deletes known button param names from state before `saveDevJson` (schema available in `state.paramSchema`).

---

## 2. Phased delivery

### Phase 0 — Prep & fixes ✓

**Goal:** Safe foundation; no picker UI yet.

| Task | Details |
|------|---------|
| Fix **PARAM-HSV** in `param_scan.js` | Default `{ h, s, v, a }`; error message `H,S,V,A`; markdown row |
| Add **`param_color.js`** | `parseParamColor(type, raw)`, `formatReadout(type, value)`, `toNative(type, iroColor)`, `fromNative(type, value)` |
| Unit tests | RGB/HSV/HEX round-trip; invalid input |
| Decide **HSL ranges** | Match HSV (recommend S/L 0–1, H 0–360) — update open question in plan |
| Spike **Iro** | Vendor `iro.min.js` under `.advBuilder/vendor/`; load in dev-ui; wheel + sliders in a throwaway div |

**Done when:** `node param_scan.test.js` passes; colour conversion tests pass; HSV defaults in schema use `h,s,v,a`.

---

### Phase 1 — PARAM-BUTTON trigger counter ✓

**Goal:** §2 of colour plan; independent of picker.

| Task | Details |
|------|---------|
| `dev-ui.html` | `triggerCount` map; fire sends `1, 2, 3…` |
| `builder.js` | Do not persist button values to `dev.json` (filter on save or dedicated endpoint) |
| **PARAM-SPEC** | §4 + revision row; migration note for art using `Date.now()` |
| **OnParam handlers** (if needed) | Update any handlers that assumed timestamps |

**Done when:** Button shows incrementing small integers; reload dev-ui → first fire is `1` again; `dev.json` has no button keys.

---

### Phase 2 — Swatch rows ✓

**Goal:** §3 — replace textarea for colour types (keep “Advanced JSON” optional).

| Task | Details |
|------|---------|
| CSS | `.param-swatch`, readout overlay, row height |
| `renderParamControl` | Swatch + readout for `PARAM-RGB`, `PARAM-HSV`, `PARAM-HEX` only |
| `data-param-type` / `data-n` on swatch button | For picker open |
| Readout | `formatReadout()` per type |
| Accessibility | `<button type="button">`, `aria-label` with name + value |
| Advanced (optional) | Collapsed “JSON” textarea or dev-only flag |

**Done when:** All colour params show correct swatch colour and readout; no picker yet (click can no-op or toast “coming soon”).

---

### Phase 3 — Floating dialog shell ✓

**Goal:** §4 mounting, drag, single instance — no Iro yet.

| Task | Details |
|------|---------|
| DOM | `#color-picker-dialog` on `document.body`, backdrop, header drag handle, **Cancel** + **×** (accept) in header, toolbar |
| `z-index` | > `#status` (200), e.g. 5000 |
| Position | `getBoundingClientRect()` from swatch + viewport clamp |
| API | `openColorPicker(paramSchemaEntry, anchorEl)`, `closeColorPicker()` |
| State | `pickerSession = { name, type, openingSnapshot, previewActive }` |
| Backdrop click | Accept (close + POST current) |
| **×** (header) | Accept (same as backdrop / Enter) |
| **Cancel** (header + toolbar) / **Esc** | Revert to pre-open colour; close; no POST |
| **Other swatch click** | Accept current + reopen for new param (wire in Phase 5) |

**Done when:** Dialog opens/closes, drags, one instance; backdrop/Esc wired to stub commit/discard.

---

### Phase 4 — Iro integration + preview/commit/discard ✓

**Goal:** §4–§5 core loop.

| Task | Details |
|------|---------|
| Mount Iro in dialog body | Layout: wheel + H/S/V/A sliders (tune `wheelLightness` per plan §8) |
| Open | `fromNative` → set Iro; store `openingSnapshot` (deep clone) |
| `color:change` | On each event, if converted native value ≠ last preview, `applyParamsToIframe` (no throttle) |
| **Accept** | `toNative` → `postParamPatch({ [name]: v }, …, true)`; update swatch row; `closeColorPicker()` |
| **Cancel** | iframe patch opening snapshot; close; no POST if server unchanged |
| **Enter** / **×** | Accept |
| **Other swatch** | Commit then `openColorPicker` for new row |
| Destroy Iro on close | `off` listeners, null instance (avoid leaks) |

**Done when:** Manual test on qa_* colour params: drag updates art; commit persists in `dev.json`; discard reverts art and file.

---

### Phase 5 — Undo / redo + keyboard ✓

**Goal:** §5.3.

| Task | Details |
|------|---------|
| Init `colorUndo` on `/state` load | Baseline per colour param from `paramValues` |
| On commit | Push onto per-name stack |
| Toolbar Undo/Redo | Enable/disable from `index`; sync Iro + swatch + `POST` |
| **Ctrl+Z / Ctrl+Y** | `keydown` on dialog only; `preventDefault`; same stack |
| Picker closed | No document-level Ctrl+Z handler for colours |
| Re-sync after undo | Update Iro without firing duplicate commits (use internal flag) |

**Done when:** Multiple commits → undo back to project-open colour; redo works; closed picker ignores Ctrl+Z.

---

### Phase 6 — Clipboard ✓

**Goal:** §5.3 copy/paste.

| Task | Details |
|------|---------|
| Toolbar icons | Copy / Paste |
| **Ctrl+C / Ctrl+V** | While dialog focused |
| Format | Clipboard: **HSVA** JSON `{"h":…,"s":…,"v":…,"a":…}` (**H** 0–360, **S/V/A** 0–1); paste only within picker |

**Done when:** Copy/paste round-trip inside the open picker (HSVA → Iro → preview).

---

### Phase 7 — PARAM-HSL ✓

**Goal:** §7.

| Task | Details |
|------|---------|
| `param_scan.js` | Parse `PARAM-HSL`, defaults, errors |
| Tests + `renderParamsMarkdown` | |
| `param_color.js` | HSL conversions |
| dev-ui | Same swatch + picker path as HSV |
| **PARAM-SPEC** | Type table row |

---

### Phase 8 — Deprecate PARAM-COLOR ✓

**Goal:** §6 Option C.

| Task | Details |
|------|---------|
| `param_scan.js` | `PARAM-COLOR` → scan **error** with message: use RGB/HSV/HSL/HEX |
| Remove from `renderParamControl` colour cases | Drop `PARAM-COLOR` branch in dev-ui |
| Tests | Assert COLOR marker fails scan |
| **PARAM-SPEC** | Mark deprecated; revision row |
| Project `defs.js` | Remove commented `qa_color` example if desired |

---

### Phase 9 — Hardening & docs (1 day) ✓

| Task | Details |
|------|---------|
| Electron | Picker in dev-ui (`z-index: 5000`); iframe `postMessage` uses `location.origin`; Electron shell unchanged except clipboard IPC |
| Touch / pointer | `touch-action: none` on Iro mount; dialog drag uses pointer capture |
| WS | Colour preview = iframe only; `POST /params` + WS on commit/undo/non-colour edits; optional `persist: false` skips `dev.json` |
| Legacy wire | `migrateParamValues` on scan: HSV/HSL `{r,g,b,a}` → normalized wire |
| **PARAM-COLOR-PLAN** §11 | Updated |
| **PARAM-SPEC** §7.2 | Colour UX paragraph |
| Manual test script | [PARAM-COLOR-TEST.md](./PARAM-COLOR-TEST.md) |

---

## 3. Suggested file / API sketch

### `color_picker.js` (illustrative)

```javascript
// Exported on window.advColorPicker for dev-ui.html
export function initColorPicker(deps) {
  // deps: postParamPatch, applyParamsToIframe, getParamValues, colorUndo, formatReadout
}
export function openColorPicker(p, anchorEl) { … }
export function closeColorPicker() { … }
export function isColorPickerOpen() { … }
```

### `dev-ui.html` integration points

- `renderParamControl` → swatch `class="param-color-swatch" data-n="…" data-type="PARAM-RGB"`
- `bindParamPanel` → delegate click on swatch to `openColorPicker`
- Project load (`fetch('/state')`) → `resetColorUndo(state.paramValues, state.paramSchema)`

### `builder.js` (minimal)

```javascript
// POST /params body: { values, remove?, persist?: boolean }  — persist defaults true
req.on('end', () => {
  // … merge into state.paramValues …
  if (payload.persist !== false) saveDevJson();
  broadcastParams(); // only after commit, or always with merged values — preview does not POST
});

// Before saveDevJson() (also strip ephemeral keys):
function paramValuesForPersist() {
  const v = { ...state.paramValues };
  for (const p of state.paramSchema || []) {
    if (p.type === 'PARAM-BUTTON') delete v[p.name];
  }
  return v;
}
```

Colour **preview** never hits this handler; colour **commit** uses `persist: true` (default).

---

## 4. Manual test checklist

**Canonical checklist:** [PARAM-COLOR-TEST.md](./PARAM-COLOR-TEST.md) (includes HSL, Electron, touch, WS).

Use any project with `//PARAM-RGB`, `//PARAM-HSV`, `//PARAM-HSL`, `//PARAM-HEX` qa markers.

- [ ] Swatch matches value; readout format correct per type  
- [ ] Open picker near swatch; drag wheel → art updates live  
- [ ] **Cancel / Esc** → art and `dev.json` match pre-open colour  
- [ ] **Accept** (×, backdrop click, Enter) → `dev.json` updated  
- [ ] Open picker A, edit, click swatch B → A committed, B opens fresh  
- [ ] Commit ×3, **Undo** ×3 → back to project-open colour for that property  
- [ ] **Redo** restores commits  
- [ ] **Ctrl+Z** only works with picker focused; with picker closed, no colour undo  
- [ ] Switch param in picker (undo stack is per property)  
- [ ] Reload dev-ui → undo stacks cleared; baseline = loaded `paramValues`  
- [ ] PARAM-BUTTON: 1, 2, 3…; absent from `dev.json`  
- [ ] No memory leak after 20 open/close picker cycles  

---

## 5. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| HSV already stored as `{r,g,b,a}` in old `dev.json` | Migration on load: if type HSV and keys look like RGB, map or reset from schema default |
| Preview/commit split confuses WS clients | Document; only commit broadcasts |
| Iro wheel look vs “white centre” spec | Phase 4 tuning; custom layout if needed |
| `param_scan` HSV/RGB shared case block | Split cases when fixing HSV |
| Global Ctrl+Z steals browser undo | Only listen when picker focused |

---

## 6. Order summary (dependency graph)

```text
Phase 0 (HSV fix, param_color.js, Iro spike)
    ↓
Phase 1 (PARAM-BUTTON) ─────────────────────────┐
    ↓                                            │
Phase 2 (swatches)                               │
    ↓                                            │
Phase 3 (dialog shell)                           │
    ↓                                            │
Phase 4 (Iro + preview/commit/discard) ←─────────┘
    ↓
Phase 5 (undo/redo)
    ↓
Phase 6 (clipboard)
    ↓
Phase 7 (PARAM-HSL) ── can parallelize after Phase 4 if needed
    ↓
Phase 8 (deprecate PARAM-COLOR)
    ↓
Phase 9 (hardening + docs)
```

**Estimated total:** ~8–11 days focused work (excluding open questions and art-side migration).

---

## 7. Resolved decisions (see also colour plan §10)

| Topic | Decision |
|--------|----------|
| **HSV / HSL ranges** | **Normalized:** H 0–360, S/V/L/A 0–1. CC alignment later — out of scope. |
| **PARAM-COLOR** | **Deprecated** — Phase 8; scanner error; no UI. |
| **Live preview** | Iframe every **changed** frame; **no** `dev.json` until commit. |
| **`dev.json`** | **Accept-only** for colour edits (×, backdrop, Enter, other swatch). |
| **Clipboard** | **HSVA** JSON in picker only. |

---

## 8. Completion record

Phases 0–9 completed **2026-05-15**. Docs updated: [PARAM-COLOR-PLAN.md](./PARAM-COLOR-PLAN.md) §11, [PARAM-SPEC.md](./PARAM-SPEC.md) §4 / §7.2 / §8, [PARAM-COLOR-TEST.md](./PARAM-COLOR-TEST.md).

**Deferred (out of scope):** Canvas Core HSV/HSL normalization; optional per-colour “Advanced JSON” row; `persist: false` POST path (implemented on server, unused by picker).
