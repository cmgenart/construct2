# Values panel

The **Values** panel in advBuilder (`dev-ui.html`) edits flat build-time insert values stored in `dev.json` as `buildValueLevels`. It is separate from **Parameters** (`paramValues` / `//PARAM-*` runtime controls).

## Merge levels

| Level | Purpose | Status |
|-------|---------|--------|
| `default` | Project-wide base values | Active |
| `collection` | Overrides when a collection is open | Disabled until collections editor exists |
| `piece` | Overrides for the current art piece | Disabled until collections editor exists |
| `override` | Global override on top of other levels | Active |
| `result` | Read-only merged preview | View only |

Merge order (only keys with **use** checked at that level):

```javascript
buildValues = { ...default, ...collection, ...piece, ...override };
```

`state.seed` (seed toolbar) is always applied as flat key `seed` on build.

Merged flat keys feed `CreateMetadata(values, properties)` and canvas `/[values.key]/` inserts — see [METADATA-BUILDER.md](./METADATA-BUILDER.md).

## UI (`dev-ui.html`)

| Control | Behaviour |
|---------|-----------|
| Level bar | `default`, `collection`, `piece` (disabled until collections editor), `override`, read-only `result` |
| **use** checkbox | Per key, per level — only checked keys participate in merge |
| Value field | Multiline `<textarea>`; height fits content on load and when editing |
| Key column width | **`<>`** button in the header between **key** and **value** — drag to resize; default width fits the longest key name; saved in `localStorage` as `advBuilder.valuesKeyWidth` |
| Key row order | Drag the key name (`.values-key` cell) to reorder rows on **default** level; order shared across all levels and the **auto** tab. See [Key order](#key-order). |
| **x** on a row | Removes **custom** keys only (locked / scan-discovered keys cannot be removed) |

## Removable vs locked keys

- **Locked** (`buildValueLockedKeys`): baseline builder keys plus any key found in art source scans. The **x** control is disabled; these rows stay (or reappear after a scan if referenced in code).
- **Custom** (`buildValueCustomKeys`): keys added via **Add**. **x** removes the key from all levels and from the custom list.

`POST /buildValues` with `"removeKey": "my_key"` deletes a custom key only.

## Key discovery

`build_value_scan.js` scans project source files (canonical files **and** transitive **`//import`** targets; same graph as [`source_inventory.js`](../source_inventory.js)) for:

- `/*[expr]*/` value inserts (PMaster)
- `/[values.key]/` and `/[piece.key]/` string placeholders
- `#IF[values.key]` directives

Computed keys (`has_properties`, `property_names`) are excluded from the editable schema. Baseline keys (`artist`, `name`, `description`, `website`, `tag`, `num`, `seed`, collection fields, `policy`) are always listed.

**Row order** is user-defined via `buildValueKeyOrder` in `dev.json` (initialized alphabetically on first load).

## Key order

Row order in the Values panel (and **auto** tab) will be controlled by a persisted key list in `dev.json`:

```json
{
  "buildValueKeyOrder": ["name", "description", "tag", "artist", "num", "seed"]
}
```

| Aspect | Spec |
|--------|------|
| Persistence | `buildValueKeyOrder: string[]` in `dev.json` |
| Display | All levels (`default`, `collection`, `piece`, `override`, `result`, **auto**) use the same order |
| Editing | Drag-reorder **only on the default level**; key name cell is the drag handle |
| New keys | Appended to end (scan discovery or **Add**) |
| Removed keys | Removed from order array |
| Migration | If missing: initialize once from current alphabetical schema |

Ordering algorithm — shared module [`build_value_order.js`](../build_value_order.js) (server + client):

```javascript
function orderBuildValueKeys(allKeys, keyOrder) {
  const order = Array.isArray(keyOrder) ? keyOrder : [];
  const known = new Set(allKeys);
  const sorted = order.filter((k) => known.has(k));
  for (const k of allKeys) if (!sorted.includes(k)) sorted.push(k);
  return sorted;
}
```

**Purpose:** future batch **Auto fill** (A7) uses this order when keys have no explicit prompt dependencies, and as a tie-breaker within the same topological layer. See [AUTO-GENERATION.md](./AUTO-GENERATION.md) §8 / §10.2.

## API

`POST /buildValues`

```json
{
  "level": "default",
  "patch": { "artist": { "value": "CAM", "use": true } },
  "activeLevel": "override",
  "addKey": "custom_key",
  "removeKey": "custom_key",
  "reorderKeys": ["name", "description", "tag", "artist"],
  "rebuild": true
}
```

`reorderKeys` — persist `buildValueKeyOrder`. Accepted only when `activeLevel` is `default`. Payload must list every current schema key exactly once. Does not trigger rebuild unless `rebuild: true`.

## Build pipeline

1. `mergeBuildValues(state.buildValueLevels, { seed })` → flat map  
2. `flatToArtBuilderInput(flat, fixed, seed)` → nested shape for `ArtBuilder` (`collection`, `piece`, `artist`, `properties`)  
3. `ArtBuilder` applies merged flat keys **last** on the eval `values` object and on `metadataValues` passed to `CreateMetadata` (enabled override keys win over computed defaults)

Canvas source (`core.html`) uses `/*[values.seed]*/` for the RNG seed (not `piece.seed`).

**See also:** [PROPERTIES-PANEL.md](./PROPERTIES-PANEL.md) — PropMaster property choices (separate from flat value inserts). Values and Properties both use merge levels; they are independent keys in `dev.json` (`buildValueLevels` vs `propertyLevels`). **Values `override`** applies to root builds; **Properties `override`** is collection-piece only.

## Manual verification

1. Start advBuilder for a project; open dev UI — **Values** sits between Parameters and Properties and collapses like other sections.
2. Level bar: `default` and `override` selectable; `collection` and `piece` greyed out; `result` shows merged values.
3. Schema lists keys from `core.html` (`artist`, `name`, `description`, `tag`, `num`, `seed`, …).
4. Enable **use** on `artist`, set value — rebuild; cert/back shows the new artist string.
5. Set an **override** for the same key with **use** on — **result** shows override winning; rebuild — metadata JSON and cert inserts use the override (e.g. `name`).
6. Change **seed** in the toolbar — build uses new RNG (`values.seed`).
7. Reload — `buildValueLevels` persists in `dev.json`.
8. Add a custom key via **Add** — appears on all levels; can enable at `default` or `override`.
9. Drag **`<>`** in the Values header — key column width changes and persists across reloads.
10. Drag a **key name** on the **default** level — row order changes and persists; other levels show the same order without drag handles.
