# Viewport capture — specification

**Status:** Planned — second release, research branch  
**Related:** [VISUALISER.md](./VISUALISER.md), [VIEW-NAVIGATION-CONTROLS.md](./VIEW-NAVIGATION-CONTROLS.md), [VIEWPORT-BACKGROUND.md](./VIEWPORT-BACKGROUND.md), [CORE.md](./CORE.md) §6.2

Dev-only recording of the **live art canvas** in the preview. Arm a camera control, press record, press stop. The file lands in `<project>/captures/` as an `.mp4`.

This is a video of the piece that is already running. It is not stroke-to-code (see [INKODER.md](./INKODER.md)), not the visualiser console’s log capture ([VISUALIZER-CONSOLE.md](./VISUALIZER-CONSOLE.md)), and not the pan/zoom overlay (`nav-capture` in [VIEW-NAVIGATION-CONTROLS.md](./VIEW-NAVIGATION-CONTROLS.md)).

---

## 1. Goals

- Record the preview the artist is looking at, including parameter changes made during the take.
- Write `mp4` files under `<project>/captures/`, named with the time and the current seed.
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
| Camera | Arms capture. Does not build. Reveals record / stop on the toolbar. |
| Record | Starts `MediaRecorder` on the live art canvas inside `#vis`. |
| Stop | Ends the take, writes the file, shows the path. |

Arming while a build is in progress waits until the preview iframe has loaded. A source rebuild during a take stops the recorder and keeps the partial file.

## 4. What gets recorded

`canvas.captureStream` on the **visible art canvas**, not the cert canvas. Canvas Core pieces are 2D, so the bitmap is the drawing buffer.

WebGL contexts record only when created with `preserveDrawingBuffer`. If that flag is absent, the toolbar says the runtime cannot record and does not write a file.

MIME type: probe `video/mp4` with `avc1` first (the approach already used in the Chaos Engine piece). If the probe fails, record the supported type and use a matching extension. Do not write a non-mp4 blob under an `.mp4` name.

## 5. Build isolation

Same rule as [VIEWPORT-BACKGROUND.md](./VIEWPORT-BACKGROUND.md): the client script is appended in `patchVisualiseHtml` (`builder.js`) when Full or Min HTML is served. Persisted `lastBuild` blobs and `output.*` files stay unchanged.

Suggested module split, matching viewport background and view nav:

| File | Role |
|------|------|
| `capture_patch.js` | Serve-time inject into preview HTML |
| `capture_client.js` | Iframe client: find the art canvas, `captureStream`, `MediaRecorder`, post the blob |
| `dev-ui.html` | Toolbar camera / record / stop |

## 6. Saving

The preview iframe cannot write the project folder. On stop, the client posts the blob to the builder (`POST /captures`). The builder writes:

```
<project>/captures/<timestamp>-seed-<n>.<ext>
```

and returns the path for the toolbar. The route creates `captures/` when it is missing.

## 7. Acceptance

- [ ] Camera arms without a rebuild and without changing `output.output.html`.
- [ ] Record / stop on a Canvas Core piece writes an `mp4` under `<project>/captures/`.
- [ ] The file is the art canvas, not the toolbar, checker wall, or cert canvas.
- [ ] A slider moved during the take is visible in the video.
- [ ] UTF8, Metadata, and Analysis hide the camera control.
- [ ] A rebuild mid-take keeps the partial file and does not throw.
- [ ] An unsupported MIME type uses the real extension.
