# Colour picker — manual test checklist

**Status:** QA script for shipped colour picker (phases 0–9). Behaviour spec: [PARAM-COLOR-PLAN.md](./PARAM-COLOR-PLAN.md).

Use a project with `//PARAM-RGB`, `//PARAM-HSV`, `//PARAM-HSL`, and `//PARAM-HEX` markers (e.g. uncomment the QA block in your project's `defs.js`).

**Hosts:** advBuilder dev-ui in browser or Electron embed (`?embed=1`). Restart Electron after shell/preload changes.

## Swatch & picker

- [ ] Swatch colour matches value; readout format correct per type (RGB ints, HSV/HSL normalized, HEX with `#`)
- [ ] Open picker near swatch; drag **wheel** → art updates live (iframe only)
- [ ] Drag **sliders** → art updates live
- [ ] **Cancel** (header/toolbar button, **Esc**) → art reverts to pre-open colour; `dev.json` unchanged
- [ ] **Accept** (× header button, backdrop click, **Enter**) → `dev.json` updated for that key
- [ ] Viewport BG swatches use the same picker (header **Cancel** / **×**); fill swatch always visible; alternate swatch only when BG checkbox off
- [ ] Open picker on A, edit, click swatch **B** → A committed, B opens with B’s value

## Undo / redo (committed colours only)

- [ ] Commit ×3, **Undo** ×3 → back to colour at project open for that property
- [ ] **Redo** restores commits
- [ ] **Ctrl+Z** / **Ctrl+Y** work only while picker focused; no colour undo when picker closed
- [ ] Reload dev-ui → undo stacks cleared; baseline = loaded `paramValues`

## Clipboard

- [ ] **Copy** / **Ctrl+C** → HSVA JSON on clipboard
- [ ] **Paste** / **Ctrl+V** → picker + live preview update (commit still required for `dev.json`)
- [ ] In Electron embed: copy/paste works (requires current preload + shell)

## PARAM-BUTTON & deprecated types

- [ ] **PARAM-BUTTON** fires 1, 2, 3… per dev-ui load; keys absent from `dev.json`
- [ ] `//PARAM-COLOR` in source → scan error with migration hint; no param row

## Electron / touch / stability

- [ ] Picker dialog appears **above** preview iframe (z-index); backdrop covers iframe
- [ ] **Touch / pen:** wheel and sliders respond without scrolling the dev panel (`touch-action: none` on Iro mount)
- [ ] Drag dialog by header handle on touch and mouse
- [ ] No duplicate WS spam while dragging colour (preview uses iframe `postMessage` only; no `POST /params`)
- [ ] After ~20 open/close picker cycles, UI stays responsive (no growing DOM / listeners)

## Legacy `dev.json`

- [ ] If an HSV param was saved as `{ r, g, b, a }`, reload project → value migrates to `{ h, s, v, a }` and saves once

## WebSocket (optional, two dev-ui tabs)

- [ ] Commit in tab A → tab B receives `{ type: 'params', values }` and iframe updates
- [ ] Colour drag in tab A does **not** broadcast until commit
