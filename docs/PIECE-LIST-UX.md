# Collection piece list — error indicator and context menu

**Status:** Spec v1.0 — **not implemented**  
**Related:** [COLLECTION-DESIGN-V2.md](./COLLECTION-DESIGN-V2.md) §6.3, [VISUALIZER-CONSOLE.md](./VISUALIZER-CONSOLE.md)

This document specifies **piece list error affordances** and the **per-piece context menu**. It complements the Build console — errors appear in the list first; the console is a secondary stream.

---

## 1. Goals

- Make build failures **visible at a glance** in the piece list (not only orange “unbuilt”).
- Show a **red error dot** on the right of any piece with build errors.
- Provide a **right-click context menu** on piece rows: view errors, rebuild, open folder, open in browser.

## 2. Error indicator (red dot)

### 2.1 When to show

Display `.piece-error-dot` when **either**:

| Condition | Source |
|-----------|--------|
| `pieceRecord.buildStatus === "error"` | `collections/<pad2>.json` (after F1.1) |
| `errors.json` exists with one or more entries | `collections/<pad2>/<pad4>/errors.json` on disk |

If status is `error` but `errors.json` is missing, still show the dot (fetch may fail gracefully).

If status is not `error` but stale `errors.json` remains on disk, show dot and treat as error until rebuild clears artifacts (align with F1.4 reconcile — prefer syncing status from disk).

### 2.2 Layout

Each piece row (`button.piece-row`):

```text
[ 0001: Piece name ○ ]  ●
   ↑ label + stale ○      ↑ red dot (right-aligned)
```

| Element | Markup / class | Notes |
|---------|----------------|-------|
| Row | `.piece-row.piece-error` when in error state | Red-tinted border/text (audit H1) — **in addition to** dot, not instead of |
| Dot | `<span class="piece-error-dot" aria-label="Build errors">` | 8 px circle, `var(--error)` or `#c0392b`, right margin inside row |
| Stale ○ | Existing inline marker | May coexist with dot |

CSS: flex row — `.piece-label` flex-grow; `.piece-error-dot` flex-shrink at end.

### 2.3 Tooltip (hover)

When dot visible, row `title` or dedicated tooltip: first error line from `errors.json`, or `"Build failed"` if file unavailable.

Full detail via context menu **Show errors…** (§3).

### 2.4 Data loading

On `renderPieceList()`:

- Use `buildStatus` from collection JSON immediately (sync).
- Optionally batch-fetch error summaries: `GET /collections/:pad2/:pad4/errors.json` for rows with `error` status or lazy on first paint — cache in `CollectionUI` session map keyed by `pieceId`.

Do not block list render on fetch; dot from `buildStatus` first, refine when `errors.json` loads.

---

## 3. Piece context menu

### 3.1 Trigger

- **Right-click** (`contextmenu`) on `.piece-row`
- `preventDefault()` — use same HTML menu pattern as collection tab menu (`.collection-ctx-menu` in [`collection_ui.js`](../collection_ui.js))

Left-click behaviour unchanged (selection).

### 3.2 Menu items

| Item | Action | Enabled when |
|------|--------|--------------|
| **Show errors…** | Opens error viewer (§3.3) | Dot visible / `buildStatus === "error"` or `errors.json` present |
| **Build** | Rebuild this piece (`POST /collections/:pad2/build` with `pieceIds: [id]`) | Collection not frozen |
| **Open in Explorer** | Opens piece artifact folder | Always (folder created on first build attempt) |
| **Open in browser** | New tab with piece `min.html` | `min.html` exists in piece dir |

Separator between **Show errors…** and **Build** when Show errors is shown.

**Electron:** **Open in Explorer** uses `advPlatform.revealInExplorer({ path: pieceDir, mode: "folder" })` via parent postMessage or new IPC helper.

**Browser-only dev server:** **Open in Explorer** disabled with tooltip “Electron only”, or copies absolute path to clipboard.

### 3.3 Show errors viewer

Lightweight modal or slide-over panel (reuse modal styling from UI colour review / existing overlays):

- Title: `{pad4}: {displayName} — build errors`
- Body: formatted `errors.json` (array of strings or structured objects — render as pre-wrap list)
- Actions: **Copy**, **Close**, optional **Open in console** → switches visualizer to Build stream and scrolls to piece (Phase 1 console integration)
- If fetch fails: message + **Build** shortcut to retry

Does not replace red dot — entry point for full text.

### 3.4 Open in browser

URL (served by `builder.js`):

```text
/collections/{pad2}/{pad4}/min.html
```

Open with `window.open(url, '_blank', 'noopener')`. If only `full.html` exists, use that. If neither exists, menu item disabled.

Optional submenu later: Min / Full / UTF8 — v1 uses **min.html** only.

### 3.5 Open in Explorer

Target directory:

```text
<project>/collections/{pad2}/{pad4}/
```

Resolve via `CollectionFs.pieceDirPath` on server; client requests `POST /collections/:pad2/:pad4/reveal` returning `{ path }` for Electron, or Electron derives path from project root + relative segments.

---

## 4. Batch build summary (F1.2 / H12)

When `collectionBuildDone` fires:

- If any targeted pieces ended in error, show **collection status** line under piece list toolbar:  
  `Build finished — N failed, M succeeded` (red accent when N > 0).
- Failed pieces retain red dot; success clears dot and `errors.json` on next successful build.

---

## 5. Integration

| System | Behaviour |
|--------|-----------|
| **F1.1** | Sets `buildStatus: error` when `output.errors.length > 0` |
| **Build console** | Errors also logged to Build stream ([VISUALIZER-CONSOLE.md](./VISUALIZER-CONSOLE.md)) |
| **Mint preflight** | `build.noErrors` check reads same `errors.json` (Phase 3) |
| **Frozen collection** | Context **Build** disabled; Show errors / Open still enabled |

Update [COLLECTION-DESIGN-V2.md](./COLLECTION-DESIGN-V2.md) §6.3 error row to reference red dot + context menu (cross-link only).

---

## 6. Module touchpoints

| File | Change |
|------|--------|
| `collection_ui.js` | `pieceStatusClass()` → `piece-error`; dot markup; `showPieceContextMenu()`; error modal |
| `dev-ui.html` | `.piece-error`, `.piece-error-dot`, `.piece-ctx-menu` styles |
| `builder.js` | Optional `POST …/reveal` for Explorer path; ensure errors on failed build |
| `electron/main.js` | Optional `adv:reveal-path` if not covered by existing reveal API |

---

## 7. Testing checklist

- [ ] Failed build → red dot + `piece-error` row styling
- [ ] Successful rebuild → dot removed, `errors.json` gone
- [ ] Right-click → menu with correct enabled/disabled states
- [ ] Show errors → displays `errors.json` content
- [ ] Build from menu → rebuilds single piece
- [ ] Open in Explorer → correct `{pad4}` folder (Electron)
- [ ] Open in browser → `min.html` in new tab
- [ ] Frozen collection → Build disabled in menu
- [ ] Batch build partial failure → summary message + dots on failed rows only

---

*Authoritative for piece list error UX. See [NEXT-WORK-PLAN.md](./NEXT-WORK-PLAN.md).*
