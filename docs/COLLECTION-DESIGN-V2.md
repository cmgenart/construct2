# Collection editor — design v2

**Status:** design / not implemented  
**Supersedes for new work:** [COLLECTION-DESIGN.md](./COLLECTION-DESIGN.md) (v1 — manifest-in-`dev.json`, Collection visualiser mode)  
**Related:** [VALUES-PANEL.md](./VALUES-PANEL.md), [PROPERTIES-PANEL.md](./PROPERTIES-PANEL.md), [PARAMETER-DRIVERS-DESIGN.md](./PARAMETER-DRIVERS-DESIGN.md), [VISUALISER.md](./VISUALISER.md), [METADATA-BUILDER.md](./METADATA-BUILDER.md)

This document captures **Collection design v2**: multiple on-disk collections per project, **piece records** in per-collection JSON at `collections/` root, **disposable** `pad2`/`pad4` build trees, a **Collections** panel + **piece list** column, and optional **piece generators**.

---

## 1. Intent

| Goal | v2 approach |
|------|-------------|
| Many artworks per project | Multiple collections under `<project>/collections/` |
| Per-piece variation | **Piece records** in each `collections/<pad2>.json` |
| Shared collection defaults | Collection-level values + properties (existing merge levels) |
| Stable mint outputs | Built artifacts under `collections/<pad2>/<pad4>/` (disposable dirs) |
| Bulk creation | **Piece generators** (project HTML drivers, like parameter drivers) |
| Editor UX | Simple collection tabs + tall piece list + existing Values/Properties panels |

**Non-goals for v2.0:**

- Replacing single-piece `dev.json` workflow (root `output.*` stays default).
- On-chain mint / IPFS *(deferred — Part 1: [MINT-READY-BUNDLE.md](./MINT-READY-BUNDLE.md); Parts 2–3: [CLOUD-MINTING-INTERFACE.md](./CLOUD-MINTING-INTERFACE.md))*.
- Collection mode as a separate visualiser tab (v1); v2 uses the normal preview with piece-scoped outputs.

---

## 2. Design principles

| Principle | Meaning |
|-----------|---------|
| **JSON is source of truth** | `collections/<pad2>.json` holds collection + all `pieceRecords` |
| **Build trees are disposable** | `collections/<pad2>/<pad4>/` can be deleted anytime; rebuild restores them |
| **Explicit builds only** | Orange = needs build; never auto-rebuild batch |
| **Merge levels** | **Values:** `default` + `collection` + `piece` + `override`. **Properties:** `viewer` (root only) + `collection` + `piece` + `override` (collection pieces only — see §5.0) |
| **Pad limits** | **pad2** collections (max **99**), **pad4** pieces (max **9999** per collection) |

### 2.1 v1 ideas worth porting later

| v1 item | v2 fit |
|---------|--------|
| `performCollectionBuild` + WS progress | **Build** / **Build all** + cancel (§6.11) |
| `buildStatus` / stale detection | **`built`** (green) vs **`unbuilt`** (orange); edits and reorder invalidate build |
| CSV name injection | Piece generator or import driver |
| Screenshots / hyperspeed | Post-v2 batch option |

---

## 3. Terminology

| Term | Meaning |
|------|---------|
| **Collection** | Defined by `collections/<pad2>.json` (e.g. `01.json`). Max **99** collections per project. |
| **Piece record** | One slot in `pieceRecords[]`. *Not* built files — the **recipe** (values, properties, seed, etc.). Max **9999** per collection. |
| **Built piece** | Outputs under `collections/<pad2>/<pad4>/` after **Build** |
| **Piece generator** | Project HTML tool that appends **piece record bases** to the open collection |

**Recommended JSON name:** `pieceRecords` (array of objects). Each object is a **`pieceRecord`**.

Display in piece list: **`{num_pad4}: {displayName}`** e.g. `0001: Art piece 1`, where `displayName` comes from merged values (e.g. `name` or `piececollection.name`) with fallback `Piece {num}`.

---

## 4. Folder layout

```
<project>/
  collections/
    01.json                       # collection 1 — source of truth (pieceRecords, levels, frozen, …)
    01/                           # disposable build tree for collection 01
      0001/                       # piece 1 outputs (pad4) — after build only
        full.html
        min.html
        utf8.txt
        metadata.json
        values.json
        properties.json
        pieceRecord.json          # snapshot of record at build (audit)
      0002/
        ...
      _source/                    # art source snapshot + fingerprint (written on rebuild — §6.8)
        core.html                 # effective core at build time
        setup.js, defs.js, …      # seven canonical codeblocks
        colour_factory.js, …      # transitive //import<> (project + lib, by rel path)
    02.json
    02/
      ...
  pieceGenerators/
    batchGenerator.html
  dev.json
```

### 4.1 Rules

| Path | Role |
|------|------|
| `collections/<pad2>.json` | **Persistent** — collection metadata + `pieceRecords[]` |
| `collections/<pad2>/` | **Disposable** — entire tree may be deleted on reorder / invalidation |
| `collections/<pad2>/<pad4>/` | Per-piece build outputs; same filenames in every piece dir (§7.3) |
| `collections/<pad2>/_source/` | Copy of watched art sources at last collection-affecting rebuild (canonical files + full `//import<>` graph); backs `sourceFingerprint`; stale entries pruned on rewrite |

- Collection JSON lives at **`collections/` root**, not inside `01/`.
- Piece records **never** live only on disk under `01/0001/` — only in `<pad2>.json`.
- **pad2** for collections (`01`–`99`), **pad4** for pieces (`0001`–`9999`).

### 4.2 Piece reorder (within a collection)

Piece dirs follow **current `num`**: `collections/<pad2>/<pad4(num)>/`.

When piece order changes (drag, delete, cross-collection move):

1. Update `pieceRecords` order and `num` values.
2. **Delete** the whole `collections/<pad2>/` tree (simplest) **or** delete only orphaned `<pad4>/` dirs whose numbers shifted.
3. Set affected pieces to **`unbuilt`** (orange).

**Recommendation:** on any piece renumber within a collection, **delete entire `collections/<pad2>/`** and orange **all** pieces in that collection — avoids leftover wrong `0007/` folders.

### 4.3 Collection reorder (swap collection numbers)

Because JSON is `01.json` but build output is `01/`, renumbering collections (e.g. old `02` becomes `01`) is **destructive**:

1. Update / rename `collections/<pad2>.json` files to match new order.
2. **Delete** both (or all affected) build trees: `collections/01/`, `collections/02/`, …
3. Orange every piece in affected collections — **full rebuild required**.

Same philosophy as piece dirs: **numbered folders are caches**, not authoritative.

---

## 5.0 Values vs Properties — level names and build role

The level bar looks similar in both panels, but **names and build behaviour differ**. Do not treat Properties `viewer` like Values `default`.

### Values panel ([VALUES-PANEL.md](./VALUES-PANEL.md))

| Level | Stored | Collection piece build |
|-------|--------|-------------------------|
| `default` | `dev.json` | **Yes** — project-wide inserts (artist, policy, …) |
| `collection` | `<pad2>.json` → `values` | **Yes** |
| `piece` | `pieceRecord.values` | **Yes** |
| `override` | `dev.json` | **Yes** (on top) |

```javascript
buildValues = { ...default, ...collection, ...piece, ...override };
// only keys with use: true per level; then pieceRecord.seed
```

### Properties panel ([PROPERTIES-PANEL.md](./PROPERTIES-PANEL.md))

| Level | UI label | Stored | Root `output.*` build | Collection piece build |
|-------|----------|--------|----------------------|-------------------------|
| `viewer` | **Viewer** | `dev.json` `propertyLevels.viewer` (legacy key `default` on load) | **Yes** — viewer bag only | **No** |
| `collection` | Collection | `<pad2>.json` → `propertyOverrides` + `fixedProperties` | **No** | **Yes** — collection-wide locked pre-selections (e.g. debug on for whole collection) |
| `piece` | Piece | `pieceRecord.properties` + `fixedProperties` | **No** | **Yes** — committed build output; gold = fixed locks |
| `override` | Override | `dev.json` `propertyLevels.override` | **No** — UI disabled in viewer workspace | **Yes** — snapshotted to `pieceRecord.overrideProperties` on every build / random / build all |
| `result` | Result | computed | Read-only preview | Read-only preview |

**Viewer** holds what you see when editing **root** `output.*` (locks, last root build mirror). It does **not** participate in collection property selection.

**Override** (Properties) lets you force property choices on collection pieces without changing `<pad2>.json` or the piece’s committed `properties`. Values are persisted in `dev.json` but the level bar is **greyed out** until a collection is open; they are applied only via the pre-build snapshot to `overrideProperties`.

### Piece record — three property fields

| Field | Purpose |
|-------|---------|
| `fixedProperties` | Gold locks — pinned on random and rebuild (plain map) |
| `overrideProperties` | Snapshot of **Override** panel (`use: true` only) taken at each build / random / build all |
| `properties` | Full ArtBuilder output after last build / random (plain map of all active props) |

Collection **`propertyOverrides`** + **`fixedProperties`** are collection-wide locked pre-selections applied to every piece.

### Three build modes (PMaster v2)

ArtBuilder always calls `SetRandomProperties(seed, fixedMap)`. When **every** property is in `fixedMap`, nothing re-rolls (rebuild). When only locks are present, the rest are generated from seed.

**Before every build / random / build all:** refresh `pieceRecord.overrideProperties` from live **Override** panel.

#### A. First build or Random (orange or `reshuffle: true`)

```javascript
fixedMap = {
  ...collection.fixedProperties,
  ...flatUseTrue(collection.propertyOverrides),
  ...pieceRecord.fixedProperties,
  ...flatUseTrue(pieceRecord.overrideProperties),
};
SetRandomProperties(piece.seed, fixedMap); // seed bumped on random
```

**After success:** `pieceRecord.properties = activeprops` (full output).

**Random** works on orange or green pieces — populates / replaces `properties` while keeping locked parameters only.

#### B. Rebuild (Build / Build all, `properties` already set, not reshuffle)

```javascript
fixedMap = {
  ...pieceRecord.properties,
  ...flatUseTrue(collection.propertyOverrides),
  ...collection.fixedProperties,
  ...flatUseTrue(pieceRecord.overrideProperties),
  ...pieceRecord.fixedProperties,
};
SetRandomProperties(piece.seed, fixedMap); // all keys fixed → same recipe + source updates
```

**After success:** `pieceRecord.properties = activeprops`.

**Piece Properties panel (after build):** all keys in `properties` shown selected; **gold** = keys in `fixedProperties` or other locked pre-selections (collection overrides, override snapshot). Unlocking gold removes from `fixedProperties` unless still locked elsewhere.

**Gold unlock:** remove from `piece.fixedProperties`; stay gold if still in collection locks or Override panel / `overrideProperties`.

**Piece-level edits** (nudge/shuffle at Piece level) write into `piece.properties` and mark piece unbuilt until **Build**.

---

## 5. Data model — `collections/<pad2>.json`

### 5.1 Top-level shape (draft)

File: `collections/01.json` (pad2 collection number).

```json
{
  "version": 1,
  "num": 1,
  "name": "DemoCollection",
  "createdAt": "2026-05-20T12:00:00.000Z",
  "updatedAt": "2026-05-20T12:00:00.000Z",

  "mint": {
    "size": 186,
    "policy": "000…000",
    "description": "…"
  },

  "values": {
    "name": { "value": "MyCollection", "use": true },
    "description": { "value": "…", "use": true }
  },

  "propertyOverrides": {
    "debug_canvas_input": { "value": "on", "use": true }
  },

  "fixedProperties": {},

  "frozen": false,

  "sourceFingerprint": "sha256:…",

  "pieceRecords": [
    {
      "id": "b7e2c4a1-…",
      "num": 1,
      "displayName": "Mind00001",

      "values": {
        "name": { "value": "Mind00001", "use": true },
        "description": { "value": "…", "use": true }
      },

      "fixedProperties": {
        "Theme": "Calm",
        "accent": "warm"
      },

      "overrideProperties": {
        "build": { "value": "release", "use": true }
      },

      "properties": {
        "Theme": "Calm",
        "accent": "warm",
        "build": "release",
        "Mode": "Bright",
        "Line Style": "A"
      },

      "seed": 42,
      "buildStatus": "unbuilt",
      "lastBuiltAt": null
    }
  ]
}
```

### 5.2 Field reference — `pieceRecord`

| Field | Required | Purpose |
|-------|----------|---------|
| `id` | yes | Internal identity for API/patch during edits (UUID); **not** used for folder names |
| `num` | yes | 1-based order in collection; drives output folder `pad4(num)` |
| `displayName` | no | Cached label for list; refreshed from merged `name` when values change |
| `values` | no | Piece-level **Values** panel — only keys with `use: true` ([VALUES-PANEL.md](./VALUES-PANEL.md)) |
| `fixedProperties` | no | Gold locks — pinned on random and rebuild (plain map) |
| `overrideProperties` | no | Snapshot of **Override** panel at last build / random / build all (`{ value, use: true }` sparse bag) |
| `properties` | no | Full **activeprops** after last build / random |
| `seed` | no | Per-piece RNG; bumped on random |
| `buildStatus` | no | `unbuilt` \| `built` \| `error` — see §6.3 |
| `lastBuiltAt` | no | ISO timestamp of last successful build |

Output path: `collections/<pad2(num)>/<pad4(piece.num)>/`.

### 5.3 Collection-level fields (`<pad2>.json`)

| Field | Purpose |
|-------|---------|
| `values` | Collection-level **Values** (`use: true` keys only) |
| `propertyOverrides` | Collection-level **Properties** — overarching overrides for **all** pieces (e.g. debug on while testing) |
| `fixedProperties` | Always fixed on every piece build (collection-wide DNA constraints) |
| `frozen` | `true` = release-finalised; no rebuild or edits (§6.7) |
| `sourceFingerprint` | Hash when `_source/` was last written; mismatch → orange all (§6.8) |

### 5.4 Where each level is stored

| Level | Values | Properties |
|-------|--------|------------|
| **default** / project base | `dev.json` `buildValueLevels.default` | — (use **viewer** for properties, not `default`) |
| **viewer** | — | `dev.json` `propertyLevels.viewer` — **single-piece root only** |
| **collection** | `<pad2>.json` `values` | `<pad2>.json` `propertyOverrides` + `fixedProperties` |
| **piece** | `pieceRecord.values` | `pieceRecord.properties` + `fixedProperties`; Override snapshotted to `overrideProperties` on build |
| **override** | `dev.json` `buildValueLevels.override` | `dev.json` `propertyLevels.override` (collection builds only; snapshotted) |
| **result** | computed | computed (see §5.0) |

**Persistence:** With a collection open, **collection** / **piece** edits write to `<pad2>.json`. `dev.json` keeps Values **default** + **override**, Properties **viewer** + **override** (override bag is stored always; UI/build use it only when a collection is open), and UI session (`openCollectionPad2`, `selectedPieceIds`).

**Properties `result` when collection open:** merge per rebuild recipe (§5.0 mode B). Unlisted props shown as “random at build”.

### 5.5 Merge at build time (reference)

See §5.0 for full rules. Summary:

**Values** — all four levels + `pieceRecord.seed`.

**Properties** — mode A (first build / random) or mode B (rebuild); **exclude viewer**; snapshot Override → `overrideProperties` before each build.

**After build:** `properties = activeprops`; artifacts under `collections/<pad2>/<pad4>/`; `finalizeCollectionBuildPass` when pass completes (§6.8, §7.2).

---

## 6. UI — Collections panel and piece list

Matches the provided mockup: collapsible **COLLECTIONS** section, numbered collection chips, **+** to add, collapsible **Custom generator** sub-panels.

### 6.1 Collections panel (left column, new)

| Control | Behaviour |
|---------|-----------|
| **+** | Creates next `collections/<pad2>.json` + adds button `01`, `02`, … (max 99) |
| Collection button | **Single selection:** one open/highlighted at a time. Click again **closes** collection (greys collection/piece levels). |
| Open collection | Enables **collection** level in Values/Properties; shows **piece list**; loads `collections/<pad2>.json`. |
| **Freeze** / **Unfreeze** | When open: toggle `frozen` (confirm on unfreeze). Frozen collections show lock indicator on collection button. |
| Batch generator | **Brief** textarea + per-field auto prompts ([AUTO-GENERATION.md](./AUTO-GENERATION.md)). Disabled when **frozen**. |

Placement: new panel in `dev-ui.html` — e.g. below **Parameters**, above **Values** (or above Parameters if collections are primary workflow).

### 6.2 Piece list (second column)

| Aspect | Spec |
|--------|------|
| Visibility | Shown when a collection is open |
| Layout | Narrow column beside main dev-ui (~full editor height) |
| Row format | `{num_pad4}: {displayName}` |
| Header actions | **Build all** (all orange in collection), **Build** (see §6.4), **Add piece** (+) — disabled when collection **frozen** (§6.7) |
| Selection | Click selects; **click again on a selected row deselects** it. Multi-select via Ctrl/Cmd+click, Shift+range |
| Reorder | Drag within list → renumber + delete affected build dirs (§4.2) |
| Cross-collection move | Drag piece(s) onto another collection button → append to target, renumber both, delete source build dirs |

### 6.3 Built vs unbuilt styling

Piece list rows reflect **`buildStatus`** (and whether `collections/<pad2>/<pad4>/` exists with artifacts):

| State | `buildStatus` | List styling |
|-------|---------------|--------------|
| **Built** | `built` | **Green** outline and/or text shade — outputs exist at current `num` |
| **Unbuilt** | `unbuilt` | **Orange** outline and/or text shade — needs build (never built, reordered, or edited since last build). If `min.html` still exists at current `num`, list may show a stale marker (○); preview may show **previous** outputs with an out-of-date banner |
| **Error** | `error` | **Red dot** on right of row + red row accent; see [PIECE-LIST-UX.md](./PIECE-LIST-UX.md) |

Transitions to **unbuilt** (orange):

- Piece never built.
- Reorder changed this piece’s `num` (old build dir deleted per §4.2).
- Cross-collection move.
- **Values** or **Properties** changed at **collection** level (`values` / `propertyOverrides` / `fixedProperties`) → **all** pieces orange.
- **Values** or **Properties** changed at **piece** level → **only that piece** orange.
- **Viewer** edits (single-piece) do **not** orange collection pieces.
- **Art source changed** (project rebuild / watched files) → **all** pieces in every **non-frozen** open collection orange (§6.8). **No auto-rebuild** — builds are always explicit.

Piece-level edits orange **only that piece**. Collection-level edits orange **every** piece in the collection.

### 6.4 Build and Build all (decided)

Builds are **never automatic** (invalidation only turns pieces orange).

| Button | Behaviour |
|--------|-----------|
| **Build** | If **one or more pieces selected** → rebuild **those** pieces (green or orange). If **none selected** → rebuild every **orange** (`unbuilt`) piece. |
| **Build all** | Mark **every** piece in the collection **orange**, then **force rebuild all** pieces (including ones that were green). |

When **all pieces are already orange**, **Build** (no selection) and **Build all** do the same work — that is acceptable.

**Deselect:** click a selected row again to clear selection (collection-only editing).

**Frozen:** **Build** / **Build all** disabled (§6.7).

### 6.5 Rebuild triggers (manual only)

| Action | Behaviour |
|--------|-----------|
| **Build** / **Build all** | User-initiated queue; see §6.4 |
| Edit values/properties | Orange affected pieces; **retain** existing piece artifact dirs; no build until user clicks **Build** |
| Reorder / cross-collection move / delete piece | Orange affected pieces; **delete** `collections/<pad2>/` build tree (§4.2) |
| Reshuffle (visualiser) | User-initiated single-piece build with reshuffle semantics (§6.9); disabled if frozen |

### 6.6 Multi-select and Values/Properties panels

When **more than one piece** is selected:

- **Values** panel: disabled (greyed); level bar frozen.
- **Properties** panel: disabled (greyed).
- **Collection** level: still editable if collection is open and **not frozen** (oranges all pieces per §6.3).

When **exactly one** piece is selected:

- **piece** level enabled on Values/Properties; edits persist to that `pieceRecord` and mark it unbuilt.

When **zero** pieces selected (collection open only):

- **collection** level enabled; **piece** level greyed.

### 6.7 Frozen collections (release)

For collections intended for **release**, mark as **frozen** in `<pad2>.json` (`frozen: true`).

| Aspect | Frozen | Unfrozen (normal) |
|--------|--------|-------------------|
| Purpose | Finalised; outputs are the shipped artifacts | Active editing and iteration |
| **Build** / **Build all** | Disabled | Enabled per §6.4 |
| Piece list | Green/orange still shown for info, or all shown as “locked” — **recommend:** green if dir exists, no orange transitions (edits blocked) | Green / orange as usual |
| Values / Properties | **Disabled** for collection and pieces (read-only view optional) | Editable per §6.6 |
| Reorder / add / delete pieces | Disabled | Enabled |
| Preview | Load from `collections/<pad2>/<pad4>/` via editor modes | Built preview or build prompt |
| **Unfreeze** | UI control (e.g. “Unfreeze collection” with confirm) sets `frozen: false` → normal collection; pieces may all go **orange** if `sourceFingerprint` ≠ current (§6.8) |

Freezing does **not** delete build dirs. It prevents accidental rebuilds and edits. Unfreezing returns to full edit/build workflow.

### 6.8 Art source changes and `_source/` snapshot

**Per-collection** `sourceFingerprint` in `<pad2>.json`.

The fingerprint hashes the seven canonical art source files **plus** the contents of all files reached via **`//import<path>`** (transitive, sorted by resolved path). Import discovery seeds from canonical files and from **`collection.js`** when present (imports inside collection scripts are fingerprinted; `collection.js` itself is not one of the seven hashed canonical files). **`core.html` in the hash is the effective core** (active runtime selection), not necessarily the on-disk project file when a shared runtime is selected. Editing an imported module (e.g. `colour_factory.js`) invalidates collections the same as editing `defs.js`.

Canonical list authority: [`source_inventory.js`](../source_inventory.js). Graph walk: [`import_resolve.js`](../import_resolve.js) `discoverImportGraph()`.

On **watched art source file change** (canonical file **or** imported file; or explicit `POST /collections/invalidate-source`), compare project fingerprint to each non-frozen collection’s `sourceFingerprint`:

- If different → run **source invalidation** (below). **No auto-rebuild.**

**Root viewer rebuilds do not invalidate collections.** Closing a collection and using viewer **Random**, **group Random**, property edits, or seed changes runs root `performBuild()` only. Collections stay **green** while `sourceFingerprint` still matches the current project hash (`maybeInvalidateCollectionsOnSourceChange()` in `builder.js`).

#### Source invalidation (idle or mid-build)

Applies to every **non-frozen** collection whose fingerprint ≠ project:

1. **Cancel** any in-flight batch for that collection (same as user **Cancel** — see §6.11).
2. Set **every** `pieceRecord.buildStatus` to **`unbuilt`** (orange), including pieces that completed earlier in the same batch.
3. **Retain** existing `collections/<pad2>/<pad4>/` artifact dirs (stale until rebuilt).
4. Notify UI: e.g. *“Art source changed — pieces are out of date. Rebuild to include changes.”*

**Mid-build:** if source changes while **Build** / **Build all** is running, treat as mandatory cancel — do not finish the queue on stale source. Pieces already written in that batch remain on disk as stale outputs until the user rebuilds.

**Idle (no batch):** same orange + retain-artifacts steps; no cancel step needed.

When a collection build **completes successfully** (entire requested queue, no source interrupt):

1. Copy watched art sources into `collections/<pad2>/_source/` (effective `core.html` per [CORE.md](./CORE.md) §6.1.1; all transitive `//import<>` files at project-relative paths, including `construct2/lib/` fallbacks).
2. Remove any `_source/` files no longer in the current inventory (retired imports).
3. Set `sourceFingerprint` to the current project hash.

**Partial rebuild after source change:** user may **Build** one or more pieces manually; others stay orange until built. Update `_source/` + fingerprint when a build pass completes without interruption (or after **Build all** finishes).

**Frozen collections:** ignore project source changes; keep viewing existing outputs.

**Unfreeze:** if fingerprint ≠ project, run source invalidation (§6.7).

### 6.9 Preview — no auto-build on select

Selecting an **orange** piece does **not** start a build. User uses **Build** (or optional later: double-click) to generate outputs and turn the row **green**. Merged **result** in Values/Properties is still shown while orange.

### 6.10 Visualiser — random (reshuffle)

When **exactly one piece** is selected:

- **Random** button (piece Properties level or visualiser).
- Refreshes `overrideProperties` from live **Override** panel; bumps seed.
- Rebuilds with **locked parameters only** (collection + piece fixed, collection pre-selections, override snapshot) → re-rolls remaining props.
- Works on **orange or green** pieces (populates / updates `properties`).
- On success: update `properties`; refresh preview from `collections/<pad2>/<pad4>/min.html`.

### 6.11 Batch build progress (decided)

During a long batch (e.g. 100 pieces), show progress on the **visualiser overlay** (iframe cover), not the piece-list toolbar:

```text
Building: '0001 Aurora' (1 of 100)
[ Cancel ]   ← piece list toolbar
```

- Label updates on each piece via WebSocket `collectionBuildProgress` (`label`, `index`, `total` from `pieceListLabel()`).
- Generic solo rebuilds show `Building...` on the same overlay.
- **User Cancel:** abort remaining queue; pieces **already built in this batch** stay **built** (green); in-progress and remainder stay **orange**.
- **Source change cancel** (§6.8): abort queue; **all** pieces in affected collection(s) → **orange**; retain stale artifact dirs; show source-changed message. Overrides user-cancel retention — nothing in that batch counts as shippable until rebuilt.
- WebSocket: `collectionBuildProgress`, `collectionBuildDone`, `collectionBuildCancelled`, `collectionBuildSourceInvalidated`.

---

## 7. Build pipeline

### 7.1 Single piece build

1. Resolve merges (§5.4).
2. `ArtBuilder` with merged values/properties.
3. `metadata.js` / `finalizeMetadataForBuild` per [METADATA-BUILDER.md](./METADATA-BUILDER.md).
4. Write outputs under `collections/<pad2>/<pad4>/`.
5. Copy `pieceRecord` → `pieceRecord.json` in piece dir.
6. Set `buildStatus: "built"`, `lastBuiltAt`.
7. If **not** inside a batch job → `finalizeCollectionBuildPass(pad2)` (§7.2) — copy `_source/`, update `sourceFingerprint` once.

### 7.2 Batch build

`performCollectionBuild({ collectionPad2, pieceIds?, forceAll? })` — queue from §6.4. **Reject** if `frozen`. **Never** auto-invoked. Register an active job id so `invalidate-source` can cancel mid-build (§6.8). On cancel, stop after the current piece if needed, then apply invalidation rules for the cancel reason.

**Per-piece steps:** same as §7.1 steps 1–6 (no `_source/` per piece).

**After entire queue succeeds** (no cancel, no source interrupt): call `finalizeCollectionBuildPass(pad2)` **once**.

**`finalizeCollectionBuildPass`:** copy watched art → `collections/<pad2>/_source/`; set `sourceFingerprint` to project hash; save `<pad2>.json`.

### 7.3 Output filenames (decided)

Same tidy names in **every** `collections/<pad2>/<pad4>/` dir:

| File | Contents |
|------|----------|
| `full.html` | Full art HTML |
| `min.html` | Minified art |
| `utf8.txt` | UTF-8 link / pool test |
| `metadata.json` | Minified on-chain metadata (primary output) |
| `metadata.readable.json` | Optional human-readable metadata when `CreateMetadata` returns multiple files |
| `values.json` | Merged build values used |
| `properties.json` | `activeprops` at build |
| `pieceRecord.json` | Snapshot of piece record |
| `errors.json` | Optional, on failure |

**Preview:** with **one piece** selected, main editor visualiser modes (Full, Min, UTF8, Metadata, …) read from that piece’s dir — same UX as single-piece `output.*`, different path.

### 7.4 Preview routing

| Selection | Preview |
|-----------|---------|
| One piece, **built** | Visualiser modes load from `collections/<pad2>/<pad4>/` (`full.html`, `min.html`, …) via `collectionPreview` in state (§15) |
| One piece, **orange**, **no** prior build | **No auto-build.** Banner: “Build to preview”; **result** levels still show merged values/properties |
| One piece, **orange**, **has** prior build (`min.html` at `num`) | **No auto-build.** Preview loads stale `collections/<pad2>/<pad4>/` outputs; banner: “Out of date — rebuild to include changes” (or art-source variant per §6.8); **result** levels show merged values/properties |
| Zero / multi-select | No piece preview; collection-only or disabled |
| No collection open | Root `lastBuild` / `output.*` as today |

Root `output.*` is **never** overwritten while a collection is open.

---

## 8. Auto generation (values & properties)

**Full spec:** [AUTO-GENERATION.md](./AUTO-GENERATION.md).

| Topic | Spec |
|-------|------|
| Prompts | **auto** tab after **result** in Values panel — per-key prompt + enable checkbox *(Properties auto: A8 future)* |
| Context | `[values.key]`, `[properties.Name]`, `[collection.brief]`, `[piece.num]` template inserts |
| Collection flavour | **Brief** + **auto settings** (peer template) in Collections panel → `autoBrief` / `autoSettings` on `<pad2>.json` |
| xAI key | advBuilder-wide — Electron userData secrets; not `dev.json` or driver `localStorage` |
| **auto** (piece tab) | Per-row generate for selected piece — **implemented (A6)** |
| **fill empty** / **preview** (auto tab) | Safe generate + prompt inspect — **implemented (A6)** |
| **Auto fill** (piece list) | Fill all enabled empty fields — *future (A7)* |
| **Create N…** bulk | Optional auto fill + build — *future (A9)* |
| Output | Writes to **piece** level values |
| Curation | Reshuffle / Random / **auto** / manual edit on green pieces |

Supersedes the batch-generator design formerly in [COLLECTION-GENERATOR-PLUGINS.md](./COLLECTION-GENERATOR-PLUGINS.md).

---

## 9. Resolved decisions (open questions closed)

| # | Topic | Decision |
|---|-------|----------|
| 1 | **Padding** | **pad2** collections (`01`–`99`), **pad4** pieces (`0001`–`9999`) |
| 2 | **Output names** | `full.html`, `min.html`, `utf8.txt`, `metadata.json`, `metadata.readable.json`, `values.json`, `properties.json`, … (§7.3) |
| 3 | **Build vs Build all** | **Build** = selected, or all orange if none selected. **Build all** = orange **all**, then rebuild **all**. Equivalent when everything already orange. |
| 4 | **JSON location** | `collections/<pad2>.json` at root; `<pad2>/` build tree **disposable** (§4.1–4.3) |
| 5 | **Unique names** | **Deferred** until piece generators |
| 6 | **Piece values** | `pieceRecord.values` edited via Values panel **piece** level |
| 7 | **Source fingerprint** | **Per collection**; snapshot art in `collections/<pad2>/_source/` on rebuild |
| 8 | **Batch UX** | Overlay progress `Building: '0001 Name' (1 of N)` + **Cancel** on piece list (§6.11) |
| 9 | **Source change mid-build** | Auto-cancel batch; orange **all** pieces in affected collection(s); retain stale artifacts (§6.8) |
| 10 | **Orange select** | **No** auto-build; “Build to preview” only (§7.4, §15.4) |
| 11 | **Properties `viewer`** | Renamed from `default`; excluded from collection `fixedMap`; collection `propertyOverrides` for all-piece overrides (§5.0) |

Also resolved elsewhere: multi-select disables Values/Properties; no auto-rebuild; frozen collections; green/orange list.

## 10. Remaining minor decisions (defaults for v2)

| Item | Default |
|------|---------|
| Collection display name | Edit `name` in `<pad2>.json` only; pad2 folder unchanged |
| `paramValues` per piece | Defer; params target preview iframe for selected **built** piece |
| Piece reorder | Delete entire `collections/<pad2>/` + orange all pieces in collection |
| Delete piece / collection | Confirm dialog; same tree-delete policy as reorder |
| Optional later | Double-click orange row → **Build** (explicit gesture); not auto-build on single click |

---

## 11. Phasing (recommended)

| Phase | Scope |
|-------|--------|
| **V2.1** | `collections/<pad2>.json` CRUD, Collections panel, piece list, green/orange, single-select → Values/Properties |
| **V2.2** | **Build** / **Build all**, batch queue + cancel/progress (§6.11), `_source/` snapshot, `sourceFingerprint`, no auto-rebuild |
| **V2.3** | Drag reorder + cross-collection move + dir delete on renumber |
| **V2.4** | Reshuffle; [`collection.js`](./COLLECTION-SCRIPTS.md) build scripts (+ optional HTML piece generators); **freeze** / **unfreeze** |
| **V2.5** | Port v1 progress WS, optional screenshots |

---

## 12. HTTP API (sketch)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/collections` | List pad2 + names from `*.json` |
| `POST` | `/collections` | Create `collections/<pad2>.json` |
| `GET` | `/collections/:pad2` | Read `<pad2>.json` |
| `PATCH` | `/collections/:pad2` | Patch metadata / pieceRecords |
| `POST` | `/collections/:pad2/run-script` | Run `collection.js` script; replace `pieceRecords[]` (see [COLLECTION-SCRIPTS.md](./COLLECTION-SCRIPTS.md)) |
| `GET` | `/collection-scripts` | List script names from project `collection.js` |
| `PATCH` | `/collections/:pad2/pieces/:id` | Update piece; `invalidateBuild` → orange (artifact dir retained) |
| `POST` | `/collections/:pad2/reorder` | Renumber pieces; delete `collections/<pad2>/` tree |
| `POST` | `/collections/reorder` | Renumber collections; delete affected `<pad2>/` trees |
| `POST` | `/collections/:pad2/freeze` | `{ frozen: true \| false }` |
| `POST` | `/collections/:pad2/build` | `{ pieceIds?, forceAll? }` — §6.4; fails if `frozen` |
| `POST` | `/collections/:pad2/build/cancel` | Abort in-flight batch |
| `POST` | `/collections/invalidate-source` | After art rebuild — cancel active builds, orange all pieces, retain stale artifacts (§6.8) |
| `GET` | `/collections/:pad2/:pad4/:file` | Serve `min.html`, `metadata.json`, … |

**WebSocket:** `collectionBuildProgress`, `collectionBuildCancelled`, `collectionBuildSourceInvalidated` (from v1 + §6.8).

**Values/Properties:** extend `POST /buildValues` and `POST /propertyLevels` to target `collectionNum` + `pieceId` when collection mode active.

---

## 13. UI mockup (reference)

```
┌─ COLLECTIONS ─────────────────────┐
│  [01] [02]  [+]                   │
│  Brief: [Transmigrants through the veil…]           │
└───────────────────────────────────┘

        ┌─ Piece list ─────────────┐
        │ [Build all] [Build]      │  ← no selection: all orange
        │ ┌──────────────────────┐ │
        │ │ 0001: Art piece 1    │ │  ← green outline = built
        │ └──────────────────────┘ │
        │ ┌──────────────────────┐ │
        │ │ 0002: …              │ │  ← orange = unbuilt / stale
        │ └──────────────────────┘ │
        └──────────────────────────┘
```

---

## 14. Implementation touch list

| File | Change |
|------|--------|
| `builder.js` | Collection routes, `performCollectionBuild`, `maybeInvalidateCollectionsOnSourceChange`, merge from `<pad2>.json` |
| `dev-ui.html` | Collections panel, piece list column, level bar, group Random, rebuild overlay |
| `collection_ui.js` | Piece list, batch build WS, overlay progress text |
| `builder.pmaster_process.js` | Accept per-build output directory |
| `visualise_views.js` | Serve piece-scoped HTML; reshuffle control |
| New | `collection_fs.js` — read/write `<pad2>.json`, pad2/pad4 paths, delete disposable trees |
| New | `collection_runtime.js` — merge helpers, `copySourceSnapshot`, `computeSourceFingerprint` |
| New | `source_inventory.js` — canonical source list shared with builder watch and startup inspect |

---

## 15. Pre-build checklist (implementation contract)

Use this section as the gate before coding. Status: **approved to implement** (V2.1 → V2.2).

### 15.1 Editor context

```text
single      — no collection open; dev.json default/override; root output.*
collection  — <pad2>.json loaded; collection level; piece list visible
piece       — exactly one piece selected; piece level enabled
multiPiece  — 2+ pieces selected; Values/Properties disabled; Build uses selection
frozen      — read-only; preview from dirs; no build/edit
building    — batch job active; progress + cancel (§6.11)
```

`dev.json` session fields: `collectionContext { pad2, selectedPieceIds }`, optional `collectionPreview { pad2, pad4, baseUrl }`.

### 15.2 Persistence (no double state)

**Values:** `default` + `override` in `dev.json`; `collection` + `piece` in `<pad2>.json` / `pieceRecord`.

**Properties:** `viewer` in `dev.json` (root builds only); `override` in `dev.json` (stored always, applied to collection pieces via snapshot only); `collection` → `propertyOverrides` + `fixedProperties` in `<pad2>.json`; `piece` → `properties` + `fixedProperties` on `pieceRecord`. **Viewer never in collection `fixedMap`.**

On collection open: hydrate UI from `<pad2>.json`, **not** from `dev.buildValueLevels.collection/piece`. Patches save to JSON + orange rules; **no** `performBuild()` to root.

### 15.3 `performBuild` guard

```javascript
// Collection open → only performCollectionPieceBuild / performCollectionBuild
// Root performBuild only when collectionContext.pad2 is null (or forceRoot)
```

| Action | Root build? |
|--------|-------------|
| Edit values/properties (collection open) | **No** — orange only |
| Properties level switch | **No** — refresh result merge only |
| **Random** (one piece, piece level) | **No** — collection reshuffle build |
| **Group Random** (collection open) | **No** — piece/collection patch or debounced piece rebuild |
| **Build** / **Build all** | Collection build only |
| **Reshuffle** | Single collection piece build |
| **Random** / **group Random** (collection closed) | Root `performBuild` — does **not** invalidate collections unless source fingerprint changed |

### 15.4 Preview

- `resolvePreviewTarget(state)` → root `lastBuild` or `collectionPreview.baseUrl`.
- Orange selected piece → **no auto-build**; “Build to preview” UI.
- Visualiser modes map to piece dir files (§7.3).

### 15.5 Builds & invalidation

- **Build:** selected pieces, or all orange if none selected.
- **Build all:** orange all, then rebuild all.
- **No auto-rebuild** on select, edit, or source change.
- **Source invalidation:** fingerprint mismatch only (`maybeInvalidateCollectionsOnSourceChange`) — **not** on every root `performBuild`. Explicit `POST /collections/invalidate-source` forces all collections orange.
- **Source change mid-build:** cancel job, orange all in affected collection(s), retain stale artifacts until rebuild.
- **`_source/` + fingerprint:** once per completed pass (`finalizeCollectionBuildPass`), not per piece inside a batch.
- **Locks:** in piece context, persist to `pieceRecord.fixedProperties`.
- **Seed toolbar:** edits `pieceRecord.seed` when one piece selected; else disabled or session seed.

### 15.6 Scope by phase

| Phase | Deliver |
|-------|---------|
| **V2.1** | `collection_fs.js`, CRUD, Collections panel, piece list, context + hydrate/patch Values/Properties, green/orange, add/delete piece |
| **V2.2** | `performCollectionBuild`, preview routing, batch progress/cancel, source invalidation, `finalizeCollectionBuildPass` |
| **V2.3** | Drag reorder, cross-collection move |
| **V2.4** | Freeze, reshuffle, [`collection.js`](./COLLECTION-SCRIPTS.md) scripts |

### 15.7 Out of scope for v2.0

- Auto-build on orange select
- Per-piece `paramValues` persistence
- Unique name enforcement
- On-chain / IPFS *(superseded as a permanent non-goal — Part 1: [MINT-READY-BUNDLE.md](./MINT-READY-BUNDLE.md); Parts 2–3: [CLOUD-MINTING-INTERFACE.md](./CLOUD-MINTING-INTERFACE.md))*
- Collection visualiser tab (v1)

---

## 16. Related docs

- [COLLECTION-DESIGN.md](./COLLECTION-DESIGN.md) — v1 (manifest in `dev.json`, Collection visualiser mode); reference only unless explicitly ported
- [COLLECTION-SCRIPTS.md](./COLLECTION-SCRIPTS.md) — project `collection.js`, Script menu, batch piece list builders
- [METADATA-BUILDER.md](./METADATA-BUILDER.md) — per-piece metadata after build
- [VALUES-PANEL.md](./VALUES-PANEL.md) — merge levels; enable `collection` / `piece` when v2 UI ships
- [PROPERTIES-PANEL.md](./PROPERTIES-PANEL.md) — **viewer** level (renamed from default), `fixedProperties` / Random / collection build
- [COLLECTION-GENERATOR-PLUGINS.md](./COLLECTION-GENERATOR-PLUGINS.md) — superseded; see AUTO-GENERATION
- [AUTO-GENERATION.md](./AUTO-GENERATION.md) — per-field value auto (A1–A6 implemented); Auto fill / bulk create (A7–A9 future)
- [MINT-READY-BUNDLE.md](./MINT-READY-BUNDLE.md) — **Part 1 (active)** — offline mint-ready bundle export for cloud vending handoff
- [CLOUD-MINTING-INTERFACE.md](./CLOUD-MINTING-INTERFACE.md) — **Parts 2–3 (future)** — cloud API integration + self-mint

---

## 17. Coherence summary (final)

| Question | Answer |
|----------|--------|
| Generator + per-piece build? | Yes — `values` + `fixedProperties` on record; build merges values (incl. **default**); properties via `fixedMap` + random rest |
| Collection-wide debug? | `propertyOverrides` on `<pad2>.json` with `use: true` — applies to every piece in `fixedMap` |
| Properties `default`? | Renamed **viewer** — root workspace only, **excluded** from collection builds |
| Values `default`? | Unchanged — **included** in every piece build |
| PMaster mechanism? | `SetRandomProperties(seed, fixedMap)` — same as today |
| Plan coherent? | Yes — §5.0 is the canonical merge/build reference |

*Next step:* implement **V2.1** per §15.6; use §5.0 + §15 as the implementation contract.
