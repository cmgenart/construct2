# Viewport capture — specification

**Status:** Implemented on `research/capture-inkoder` — needs a preview take to confirm the file  
**Related:** [VISUALISER.md](./VISUALISER.md), [VIEW-NAVIGATION-CONTROLS.md](./VIEW-NAVIGATION-CONTROLS.md), [VIEWPORT-BACKGROUND.md](./VIEWPORT-BACKGROUND.md), [CORE.md](./CORE.md) §6.2

Dev-only recording of the **live art canvas** in the preview. Press record, press it again to stop. A camera button saves a PNG of the same canvas. Files land in `<project>/captures/`.

This is a video of the piece that is already running. It is not stroke-to-code (see [INKODER.md](./INKODER.md)), not the visualiser console’s log capture ([VISUALIZER-CONSOLE.md](./VISUALIZER-CONSOLE.md)), and not the pan/zoom overlay (`nav-capture` in [VIEW-NAVIGATION-CONTROLS.md](./VIEW-NAVIGATION-CONTROLS.md)).

---

## 1. Goals

- Record the preview the artist is looking at, including parameter changes made during the take.
- Write `mp4` and `png` files under `<project>/captures/`, named `<project>-<YYYYMMDD>-<HHMMSS>`.
- Keep the recorder out of built HTML, the minified file, `utf8link`, metadata, and mint bundles.
- Full and Min only. UTF8, Metadata, and Analysis do not record.

## 2. Non-goals

- Rebuilding the piece in order to inject a recorder. A rebuild restarts the art, so the take would be a fresh run instead of the frame on screen, and a later source rebuild could kill the recorder mid-take.
- Recording the workshop chrome, the checker or solid viewport wall, or the CSS-fitted size of the iframe. The file is the canvas bitmap at the piece’s own buffer size.
- Headless batch `preview.png` capture. That stays in [MINT-READY-BUNDLE.md](./MINT-READY-BUNDLE.md) §4.
- Baking a recorder into art the artist ships.

## 3. UI

A camera button on `#vis-toolbar`, beside the pan/zoom control (`#vis-nav-mode`).

| Control | Behaviour |
|---------|-----------|
| Record | Starts `MediaRecorder` on the live art canvas. Glows and shows a timer. Click again to stop and write the file. |
| Camera | Saves one PNG of that same canvas into `captures/`. |
| File name | After a save, the toolbar shows the file name, truncated with an ellipsis when it is long. Hover swaps in a folder icon. Click opens Explorer with that file selected. |

Starting a take while a build is in progress waits until the preview iframe has loaded. A source rebuild during a take stops the recorder and keeps the partial file.

## 4. What gets recorded

The client copies the first visible canvas in the page (the art canvas, not the cert) onto an opaque stage and records that stage at 30 fps. The art canvas itself is not passed to `captureStream`, and the client does not call `getContext` on it. If that canvas has an AsciiCore text overlay (`pre` beside the canvas), the recorder paints the overlay into the frame. The canvas bitmap alone is the black clear underneath those glyphs.

MIME type: probe an H.264 profile that can hold the bitmap, starting at level 5.1 (`avc1.640033`, then Main and Baseline 5.1, then plain `video/mp4`). Baseline level 3 (`avc1.42E01E`) reports itself as supported and then writes a black file for a 1000px canvas. If the probe fails, record the supported type and use a matching extension. Do not write a non-mp4 blob under an `.mp4` name. A frame larger than the level allows is scaled down to fit.

## 5. Build isolation

Same rule as [VIEWPORT-BACKGROUND.md](./VIEWPORT-BACKGROUND.md): the client script is appended in `patchVisualiseHtml` (`builder.js`) when Full or Min HTML is served. Persisted `lastBuild` blobs and `output.*` files stay unchanged.

Suggested module split, matching viewport background and view nav:

| File | Role |
|------|------|
| `capture_patch.js` | Serve-time inject into preview HTML |
| `capture_client.js` | Iframe client: find the art canvas, `captureStream`, `MediaRecorder`, post the blob |
| `dev-ui.html` | Toolbar record, screenshot, and saved-file button |

## 6. Saving

The preview iframe cannot write the project folder. On stop, the client posts the blob to the builder (`POST /captures`). The builder writes:

```
<project>/captures/<project>-<YYYYMMDD>-<HHMMSS>.<ext>
```

`<YYYYMMDD>-<HHMMSS>` is the date, then the time, down to the second. A second file in the same second gets `-2` before the extension. The route creates `captures/` when it is missing. The name on the toolbar asks the shell to reveal that file (`mode: select`).

## 7. Acceptance

- [x] Camera arms without a rebuild and without changing `output.output.html`. (Inject is serve-time only; confirmed on the Inkoder build.)
- [ ] Record / stop on a Canvas Core piece writes an `mp4` under `<project>/captures/`.
- [ ] The file is the art canvas, not the toolbar, checker wall, or cert canvas.
- [ ] A slider moved during the take is visible in the video.
- [ ] UTF8, Metadata, and Analysis hide the camera control.
- [ ] A rebuild mid-take keeps the partial file and does not throw.
- [ ] An unsupported MIME type uses the real extension.
