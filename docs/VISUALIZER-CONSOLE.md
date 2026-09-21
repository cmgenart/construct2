# Visualizer console — specification

**Status:** **Implemented** (Phase 1 F1.3)  
**Related:** [VISUALISER.md](./VISUALISER.md), [PIECE-LIST-UX.md](./PIECE-LIST-UX.md)

This document describes the **dev-ui visualizer console** — a docked panel below the preview iframe with two log streams and independent capture toggles. It is **not** an in-art ASCII console buffer that a piece may implement on its own canvas.

---

## 1. Goals

- Surface **build / system activity** and **art runtime logs** inside Construct² without opening DevTools or the terminal.
- Three view modes — **Build**, **Art**, or **Both** (side-by-side dual view).
- **Per-stream capture toggles** — when off, logs behave normally (terminal + browser DevTools); the panel shows a disabled state but does not intercept new lines.
- **Collapsible chrome** — panel shrinks to a slim bottom bar (~half toolbar height, minimum 10 px); capture may stay enabled while hidden.
- **Draggable height** — drag the bar upward when open to resize the split between preview and console.
- **Bounded memory** — in-memory ring buffer with a render window so high-volume logs cannot freeze the UI.
- **Session persistence** — log files on disk survive reload; UI prefs in `localStorage`.

---

## 2. Non-goals (current / future)

| Item | Status |
|------|--------|
| Full duplicate of every Node.js dependency `console.log` | Partial — `builder.js` tees `console.log/warn/error` during builds only |
| User input / REPL in the panel | Not planned v1 |
| Virtualized DOM for 10k+ visible rows | Not implemented — windowed render (100-line default) instead |
| Line coalesce / rate limiting | Not implemented |
| Draggable vertical split in Both mode | Not implemented — fixed 50/50 |
| Persist panel prefs in `dev.json` | Not implemented — uses `localStorage` |
| Replacing build error UX (`errors.json`, red piece rows) | Console **complements** F1.2 |

---

## 3. UI layout

### 3.1 Placement

Docked **below** the preview inside `#vis-area` as a flex column:

```text
#vis-area
  #vis-viewport              ← preview iframe + rebuild overlay (flex-grow)
    #vis                       ← preview iframe
    #overlay                   ← “Building…” dimmer (visualizer only)
  #vis-console                 ← console shell (flex-shrink: 0)
    #vis-console-bar           ← collapsed bar / resize handle when open
    #vis-console-body          ← log panes + sidebar (hidden when collapsed)
      #vis-console-logs
      #vis-console-sidebar
```

The rebuild overlay dims **only** `#vis-viewport` (iframe opacity 0.35). The console stays at full opacity so build output remains readable during rebuilds.

### 3.2 Collapsed bar

| Property | Value |
|----------|-------|
| Element | `#vis-console-bar` |
| Height | ~half `#vis-toolbar` height, clamped **10–18 px** (`--console-bar-h`) |
| Label | **console** — visible on the bar when collapsed; moves to sidebar header when open |
| Click (no drag) | Toggle panel open / closed |
| Drag (when open) | Resize console height upward |
| Double-click (when open) | Reset height to **180 px** default |

During drag, pointer events on `#vis-viewport` are disabled (same pattern as the main column `#divider`).

**Height constraints:**

| Limit | Value |
|-------|-------|
| Min console body | 70 px (+ bar height) |
| Max console height | 70% of `#vis-area` |
| Min preview height | 120 px (`#vis-viewport`) |
| Default open height | 180 px |

### 3.3 Sidebar controls (right)

```text
console                    ← label (visible when panel open)
[○] Build    [ Build ]     ← capture switch + view button
[○] Art      [ Art   ]
             [ Both  ]
             Clear all
```

| Control | Behaviour |
|---------|-----------|
| **Build / Art / Both** | View mode — exactly one active; Build and Art are paired with their capture switch on the same row |
| **Build capture** | Theme-style toggle (`role="switch"`) — when off, Build stream stops appending; pane shows disabled overlay |
| **Art capture** | Toggle — enables iframe hook via `postMessage`; when off, no patch / no-op |
| **Clear all** | Clears both in-memory buffers **and** both on-disk log files |

Capture toggles are independent of panel visibility — logs may accumulate while the panel is collapsed.

### 3.4 View modes

| Mode | Layout |
|------|--------|
| `build` | Full width → Build log pane |
| `art` | Full width → Art log pane |
| `both` | **50/50** horizontal split — Build left, Art right |

Each pane has its own scroll container, **Show more…** button, and context menu. Capture toggles remain global.

**Stream labels:** **Build** (server / pipeline output), **Art** (preview iframe console).

---

## 4. Log display

### 4.1 Line format

Monospace, theme-aware. Each line is a single `<span.log-line>` (no blank lines between messages):

```text
[HH:MM:SS] level  message
```

Severity colours: **warn** → amber (`.log-warn`), **error** → red (`.log-error`).

Embedded newlines in message text are flattened to spaces when written to disk.

### 4.2 Capture disabled state

When a stream’s capture toggle is off:

- Log pane renders at **20% opacity**.
- A **“Console feed disabled”** overlay is shown (`pointer-events: none` so text remains selectable).
- Existing buffered / persisted lines remain visible.

### 4.3 Auto-scroll (“following”)

- **Following** = pinned to the live tail (default on load and after **Go to bottom**).
- Scrolling up clears following; new lines still append to the buffer but the view does not jump.
- Scrolling back to the bottom (within 12 px) re-enables following.

While following, each new line keeps the visible window on the last **100** lines.

**Panel expand:** When the console is opened from the collapsed bar (`setPanelVisible(true)`), each log pane scrolls to the bottom after the view refreshes so the live tail is visible immediately.

---

## 5. History window & “Show more…”

The console uses a **two-tier model**: a full in-memory buffer plus a smaller **visible window** rendered into the DOM.

| Setting | Value | Role |
|---------|-------|------|
| `MAX_LINES` | 10 000 | In-memory ring buffer per stream (FIFO drop oldest) |
| `PAGE_SIZE` | 100 | Default visible window; expand step size |

### 5.1 On project open

1. `GET /console/logs?tail=10000` loads up to **10 000** lines per stream from disk into memory.
2. Display starts at the **last 100 lines** (`viewStart = len − 100`, `viewCount = 100`, `following = true`).
3. Older lines exist in memory but are not rendered until the user expands.

### 5.2 Show more…

- Button label: **Show more…**
- Placed at the **top** of each log pane (above the scroll area).
- **Visible only when both:**
  1. User has scrolled to the **top** of the log (`scrollTop ≤ 2`), **and**
  2. Older lines exist before the current window (`viewStart > 0`).
- Each click:
  - Decreases `viewStart` by 100 (reveals 100 older lines).
  - Increases `viewCount` by 100 (DOM renders up to 200, 300, 400… lines).
  - Sets `following = false`.
  - Preserves scroll position (scroll to top if already at top; otherwise offset by added height).

### 5.3 Collapse back to tail

When the user scrolls to the **bottom** while the window is expanded (`viewCount > 100`):

- View resets to the last **100** lines (`tailWindow`).
- `following = true`.

**Go to bottom** (context menu) performs the same reset explicitly.

Programmatic scroll adjustments during expand are guarded so they do not immediately trigger collapse.

---

## 6. Context menu & keyboard

Right-click the log pane (when no text is selected → custom menu; when text is selected → native browser menu):

| Action | Behaviour |
|--------|-----------|
| **Select all** | Selects all text in the focused log pane |
| **Copy** | Copies the **full in-memory buffer** for that stream (not just the visible window) |
| **Go to bottom** | Jumps to live tail (100-line window, following on) |
| **Clear** | Clears that stream’s buffer and on-disk log file |

**Ctrl+A** (or **Cmd+A**) while the log pane is focused selects all text in that pane only (does not select the whole page).

---

## 7. Build stream

### 7.1 Sources

| Source | Path into panel |
|--------|-------------------|
| Structured `emitBuildLog()` calls | WebSocket `buildLog` → `VisConsole.appendBuild()` |
| `collectionBuildProgress` WS messages | Rendered as Build log lines in dev-ui |
| `console.log/warn/error` in `builder.js` | Tee’d via `installBuildLogTee()` **during active builds** |
| ArtBuilder / batch errors | `emitBuildLog("error", …)` after F1.1 |

When **Build capture is off**, `appendBuild()` is a no-op — no buffer writes. Terminal output is unchanged.

### 7.2 Server tee scope

The tee wraps `console.log`, `console.warn`, and `console.error` only while a build is in progress (`installBuildLogTee` / `uninstallBuildLogTee`). It is not a full `stdout/stderr` mirror.

ANSI escape codes are stripped from teed messages.

---

## 8. Art stream

### 8.1 Iframe hook

Files: [`art_console_hook_lib.js`](../art_console_hook_lib.js) + [`art_console_hook.js`](../art_console_hook.js) — injected as the **first script in `<head>`**, or **immediately after `<body>`** when art HTML has no `<head>` (common for Canvas Core builds), or before the first `<script>` as a last resort.

**Capture sources** (when Art capture is enabled):

| Source | Level |
|--------|-------|
| `console.log`, `console.info`, `console.warn`, `console.error`, `console.debug` | same as method |
| `window` `error` (capture phase) | `error` — uncaught exceptions, script load/parse failures |
| `unhandledrejection` | `error` |

Original console methods still run (DevTools unchanged). `Error` objects serialize as `message` + `stack`.

**Early enable handshake:**

1. Hook installs on parse, patches console, registers global error listeners, posts `{ type: "advBuilder:artConsoleHookReady" }`.
2. While waiting for capture state, lines are held in an in-memory ring buffer (50 lines).
3. Parent responds with `{ type: "advBuilder:artConsoleCapture", enabled: true|false }` on **hookReady**, iframe **load**, toggle, and init — not only on `load`.
4. When enabled, buffer is flushed to dev-ui; when disabled, buffer is discarded and patches/listeners removed.
5. Nested iframes receive the capture message forwarded from the shell.

**Limitation:** failures in scripts that run before the injected hook `<script>` cannot be captured. Injection order: `<head>` → `<body>` → first `<script>` → `</body>` fallback.

### 8.2 dev-ui bridge

`dev-ui.html` listens for:

- `advBuilder:artConsoleHookReady` → `VisConsole.syncArtCaptureToPreview()` (early)
- `advBuilder:artConsole` → `VisConsole.appendArt()` (accepts messages from `#vis` by `source`, not strict origin match)

Iframe → parent posts use target origin `"*"`. Nested UTF8/Metadata art posts via [`visualise_param_bridge.js`](../visualise_param_bridge.js), which re-posts to dev-ui using the shell page origin (not blob `"null"` origin).

---

## 9. Persistence

### 9.1 On-disk log files (project folder)

| File | Stream |
|------|--------|
| `output.build.log` | Build |
| `output.art.log` | Art |

Format matches the display line format (one line per entry, trailing newline).

**Append policy** (both server-side Build and client-posted Art):

| Setting | Value |
|---------|-------|
| Idle debounce | 2 s |
| Max wait | 10 s (flush even if still receiving) |

Batch builds call `getBuildLogAppender().flush()` after each piece so logs survive mid-batch crashes.

**Clear** (per-stream context menu or **Clear all**) truncates the corresponding file(s) via `POST /console/logs/clear`.

### 9.2 UI preferences (`localStorage`)

Key: `advBuilder.console`

```json
{
  "viewMode": "build",
  "panelVisible": false,
  "panelHeightPx": 180,
  "buildCapture": true,
  "artCapture": false
}
```

Restored on init; saved on toggle / drag / view change.

---

## 10. Memory & performance

### 10.1 Implemented

| Mechanism | Detail |
|-----------|--------|
| Ring buffer | Max **10 000** lines per stream in memory |
| Windowed render | DOM holds only the visible slice (default 100 lines; expands on demand) |
| Skip render when collapsed | Panel hidden → bar only; buffers still ingest if capture on |
| Debounced disk writes | Avoids sync I/O on every line |

### 10.2 Not yet implemented

- `maxBytes` / `maxLineLength` caps
- Consecutive-line coalesce (`× N`)
- Art ingest rate limit (60 lines/sec)
- Full virtual-list DOM (only mount viewport rows)
- `requestAnimationFrame` render batching

These remain acceptable follow-ups if profiling shows need.

---

## 11. HTTP routes

| Route | Method | Role |
|-------|--------|------|
| `/console/logs?tail=N` | GET | Return last *N* parsed lines per stream (max **10 000**) |
| `/console/logs/clear` | POST | Body `{ "stream": "build" \| "art" \| "all" }` — truncate file(s) |
| `/console/art-log` | POST | Body `{ "lines": [...] }` — append Art entries from client |
| `/console_panel.js` | GET | Panel script (served by `builder.js`) |

---

## 12. WebSocket & postMessage

### 12.1 Build stream (WebSocket)

```json
{ "type": "buildLog", "level": "info", "text": "Building piece 0001…", "ts": 1718971200000 }
{ "type": "buildLog", "level": "error", "text": "ArtBuilder: …", "meta": { "pieceId": "…" } }
```

Existing `collectionBuildProgress` messages are also rendered as Build log lines.

### 12.2 Art stream (postMessage)

Parent ← iframe:

```json
{
  "type": "advBuilder:artConsole",
  "level": "warn",
  "text": "LayerGL: shader compile warning",
  "ts": 1718971200001
}
```

Parent → iframe (capture handshake):

```json
{ "type": "advBuilder:artConsoleCapture", "enabled": true }
```

Iframe → parent (hook ready, before load):

```json
{ "type": "advBuilder:artConsoleHookReady" }
```

Parent validates `origin` for incoming art console messages.

---

## 13. Module files

| File | Role |
|------|------|
| [`console_panel.js`](../console_panel.js) | Panel UI, buffers, view window, resize, expand, context menu, `VisConsole` API |
| [`console_log_persist.js`](../console_log_persist.js) | Log file paths, parse/format, debounced append, `readLogTail` |
| [`console_log_persist.test.js`](../console_log_persist.test.js) | Unit tests for parse / tail read |
| [`builder.js`](../builder.js) | `emitBuildLog()`, build tee, HTTP routes, WS broadcast |
| [`art_console_hook_lib.js`](../art_console_hook_lib.js) | Formatting + pre-enable buffer helpers |
| [`art_console_hook.js`](../art_console_hook.js) | Preview iframe console / global error patch |
| [`art_console_hook.test.js`](../art_console_hook.test.js) | Unit tests for hook lib |
| [`dev-ui.html`](../dev-ui.html) | HTML structure, CSS, WS / postMessage wiring |

Styles live inline in `dev-ui.html` (no separate `console_panel.css`).

### 13.1 Public API (`window.VisConsole`)

| Method | Role |
|--------|------|
| `init()` | Bind DOM, restore prefs |
| `appendBuild(msg)` | Ingest Build line (respects capture toggle) |
| `appendArt(msg)` | Ingest Art line + queue disk persist |
| `loadFromServer()` | Load log files when project opens |
| `syncArtCaptureToPreview()` | Push capture state to iframe |
| `isArtCapture()` | Query Art capture toggle |

---

## 14. Integration with build errors (F1.2)

| Source | Stream | UI |
|--------|--------|-----|
| `errors.json` on failed piece | Build | Error log line via `emitBuildLog` |
| Batch completion summary | Build | Summary line with fail count |
| Red `.piece-error` rows | Collections panel | Primary list UX — [PIECE-LIST-UX.md](./PIECE-LIST-UX.md) |
| Art runtime exception | Art | Log line in Art view |

The console does not replace piece list error styling or the errors modal.

---

## 15. Testing checklist

- [x] Build capture on: build logs appear in panel **and** terminal
- [x] Build capture off: disabled overlay; no new buffer growth
- [x] Art capture on: iframe `console.log` appears in Art view **and** DevTools
- [ ] Art capture on: uncaught `ReferenceError` in preview appears in Art console (`error` styling)
- [ ] Art capture on: script syntax/parse error appears in Art console
- [ ] Art capture on: early errors before iframe `load` appear after hookReady sync (buffer flush)
- [x] Art capture off: hook removed / no capture
- [x] Build / Art / Both toggle switches layout correctly
- [x] Both mode: independent scroll + expand per half
- [x] Drag bar resizes console; height persists in `localStorage`
- [x] Double-click bar resets default height (180 px)
- [x] Min/max height constraints enforced
- [x] Click bar toggles open / collapsed
- [x] Expanding panel scrolls log panes to bottom (live tail visible)
- [x] Project reload restores log files (up to 10k lines); displays last 100
- [x] Show more… appears at top when scrolled up and older lines exist
- [x] Expand grows visible window by 100 lines per click
- [x] Scroll to bottom collapses expanded view back to 100-line tail
- [x] Context menu: select all, copy full buffer, go to bottom, clear
- [x] Clear all truncates both files
- [x] Rebuild overlay dims preview only; console stays readable
- [x] Collection batch: progress lines in Build stream
- [ ] >10 000 lines: oldest dropped in memory; file grows unbounded on disk
- [ ] Flood test: coalesce / rate limit (not implemented)
- [ ] Settings in `dev.json` (uses `localStorage` instead)

---

## 16. Resolved design decisions

| Topic | Decision |
|-------|----------|
| Layout | Flex column: `#vis-viewport` + `#vis-console`; no separate resize divider element |
| Collapsed chrome | Single slim bar with **console** label; click toggle + drag resize |
| Sidebar | Capture switches **left** of view buttons; **Clear all** at bottom |
| Persistence | Log files in project root; UI prefs in `localStorage` |
| Default view | Last **100** lines; full tail loaded into memory on open |
| History UX | **Show more…** at scroll top; +100 lines per click; bottom scroll collapses |
| Panel expand | Opening from collapsed bar scrolls each log pane to the bottom |
| Rebuild UX | Overlay on preview only |
| Build tee | `builder.js` `console.*` during builds, not full stdout |
| Art hook | `advBuilder:artConsoleCapture` / `advBuilder:artConsole` / `advBuilder:artConsoleHookReady` |
| Both mode split | Fixed 50/50 (no draggable vertical splitter v1) |

---

## 17. Future enhancements

| Item | Notes |
|------|-------|
| Virtual list DOM | If 400+ visible lines cause jank |
| Coalesce / rate limit | High-volume Art spam |
| `dev.json` sync | Optional merge of console prefs into project settings |
| Dual split drag | `dualSplitPct` persistence |
| Export log | Download `output.build.log` from UI |
| Activity pulse on collapsed bar | Subtle indicator when lines arrive while hidden |

---

*Authoritative for visualizer console behaviour. Launch phase tracking lives in [FINAL-LAUNCH-PREP.md](./FINAL-LAUNCH-PREP.md) §1 F1.3.*
