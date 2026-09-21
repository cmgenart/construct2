# Property distribution analysis

advBuilder can estimate **how often each property choice appears** when properties are rolled at random. This uses the same PropMaster V2 graph as the artwork build, but **does not** minify HTML, write metadata, or update `output.*` files.

## Dev UI

Select **Analysis** in the `#visselect` tab strip (`#vis-toolbar`). The pane provides:

- **Samples** — number of random rolls (100–50,000, default **1000**)
- **Run parameter analysis** — starts a dedicated analysis run
- **Hide Debug group** / **Hide Hex DNA group** — filter which properties appear in the results grid (uses `propertyGroups` from the last scan; legacy `debug_*` / `HxDNA_*` names in **base** still match prefix fallbacks)
- Summary row — samples, duration, master seed, validity
- **Show node graph (expert)** — collapsible text tree with `%` annotations (same format as legacy `node_graph` on build)
- Property cards — each choice with bar and **%** (responsive CSS Grid: `repeat(auto-fill, minmax(260px, 1fr))`)

Progress is shown in the status line, a progress bar, and the dev-ui overlay. WebSocket events: `analysisStart`, `analysisProgress`, `analysisDone`.

## HTTP API

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/analyze` | `{ "samples": 1000 }` | Full analysis result object |
| `GET` | `/analyze` | — | `state.lastAnalysis` or `null` |
| `POST` | `/analyze/settings` | See below | Saved prefs |

### `POST /analyze/settings`

Persists UI preferences to `dev.json` → `settings` (debounced from the Analysis iframe on change):

```json
{
  "samples": 1000,
  "hideDebug": true,
  "hideHxDna": true,
  "expertOpen": false
}
```

| `dev.json` key | Default | Meaning |
|----------------|---------|---------|
| `settings.analysisSamples` | `1000` | Last sample count |
| `settings.analysisHideDebug` | `true` | Hide properties in group **Debug** (and legacy `debug_*` prefix in base) |
| `settings.analysisHideHxDna` | `true` | Hide properties in group **Hex DNA** (and legacy `HxDNA_*` prefix in base) |
| `settings.analysisExpertOpen` | `false` | Expert node graph panel expanded |

`state.lastAnalysis` holds the most recent result (including `stat_data`, `node_graph`, timing).

## Backend pipeline

```
performAnalysis(samples)          [builder.js]
  → PropertyAnalysis(...)         [builder.pmaster_process.js]
      → PMaster + codeblock inserts
      → PM2_Node validate + temp node
      → GetStatsAsync(samples)      [builder.pmaster.v2.js]
```

### `PropertyAnalysis`

Lightweight path: builds PMaster from `project.canvas` + enabled codeblocks (with **`//import`** expansion), validates the V2 property graph, then runs stats on a **fresh temp node** (same as the dice-roll path in `ArtBuilder`).

Does **not** call Terser, `processDirectives` eval for final art, or write disk outputs.

### `GetStats` / `GetStatsAsync`

Original ArtBuilder hook: `values.debug_stat_samples` on a full build (via `settings.debugStatSamples`). When non-zero, full builds become very slow; **keep `debugStatSamples: 0`** for normal work and use **Analysis mode** or `POST /analyze` instead.

`GetStats(samples, master_seed)` — synchronous; used only when no progress callback is needed.

`GetStatsAsync(samples, master_seed, stat_data, onProgress)` — same algorithm, but:

1. Reports progress every ~`max(25, samples/40)` iterations (and at 100%).
2. `await setImmediate()` after each report so WebSocket/UI can update (sync loop blocks the Node event loop).

Algorithm per sample:

1. Derive seed from PM RNG hash chain.
2. `SetRandomProperties(seed, {})` on exported graph.
3. Count each `property → value` in `select_counter`.
4. Normalise counts to percentages in `stat_data`.

Returns:

```js
{
  node_graph,      // string: "%Chance [root]\n   12.34%   <Mode:Calm> …"
  stat_data,       // { Mode: { Calm: 30.1, Bright: 69.9 }, … }
  samples,
  master_seed,
  valid,             // no invalid rolls in sample set
  error_count,
  errors             // capped list of per-sample validation errors
}
```

### Console output

During analysis, the server logs lines like:

```text
Processed: 25%  250 of 1000 samples
```

## Full build vs analysis

| | Normal build | Analysis |
|--|--------------|----------|
| Trigger | File watch, props/seed change, Random | Run button / `POST /analyze` |
| `debugStatSamples` | `0` (recommended) | N/A (not used) |
| Minify / metadata / utf8 | Yes | No |
| Output files | `output.*` | None |
| Result storage | `lastBuild.node_graph` if `debugStatSamples>0` | `lastAnalysis` |

## Implementation files

Property **groups** for filters come from `lastBuild.propertyGroups` / analysis `propertyGroups` (see [PROPERTIES-PANEL.md](./PROPERTIES-PANEL.md)).

| File | Role |
|------|------|
| `builder.js` | `performAnalysis`, routes, `saveAnalysisUiSettings`, WS broadcast |
| `builder.pmaster_process.js` | `PropertyAnalysis`, `buildPMasterFromProject` |
| `builder.pmaster.v2.js` | `GetStats`, `GetStatsAsync` |
| `visualise_views.js` | `renderAnalysisViewer` |
| `visualise_analysis_client.js` | In-iframe UI logic |
| `dev-ui.html` | Analysis tab in `#visselect`, `#overlay` in `#vis-area`, WS → iframe `postMessage` |

## Example: curl

```bash
curl -s -X POST http://localhost:3000/analyze \
  -H "Content-Type: application/json" \
  -d "{\"samples\":500}"
```

## Legacy note

`PMasterProcess(project, …, samples)` in `builder.pmaster_process.js` still passes `debug_stat_samples: samples` for non-advBuilder callers. advBuilder’s `performBuild` uses `settings.debugStatSamples` only.
