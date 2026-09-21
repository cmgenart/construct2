# Preview

The right-hand picture is not Photoshop. It is the **built file**, running in a little browser. The tabs are different costumes for the same build.

| Tab | In one line |
|-----|-------------|
| **Full** | The art, with the workshop chrome around it |
| **Min** | The minified file — closer to what you would ship |
| **UTF8** | The art as a UTF-8 data URL. Size matters here. |
| **Metadata** | The JSON luggage (name, attributes, …) |
| **Analysis** | How property choices land if you roll the dice a lot |

The number in the toolbar is a size hint. Treat it as a mood, then look at UTF8 when you are serious.

## Moving around

On Full and Min: **pan/zoom** (or hold Ctrl and drag), **reset**, **fullscreen** (Ctrl+F11). Right-click peek zoom exists if you like to squint professionally.

The checker / solid **background** behind the canvas is only the workshop wall. It is not written into the art. `CanvasWall` in your setup *is* the art.

## Console

The thin bar under the preview says **console**. Click it. Drag to make it taller.

- **Build** — the compiler muttering (missing inserts, bad properties).
- **Art** — `console.log` from the piece. Off by default so a chatty draw does not melt the log.
- **Both** — a split, for when they are arguing.

Capture toggles sit beside the names. **Clear all** when you have seen enough shame.

## If you write code

Analysis talks to the property sampler (`GetStats` and friends). You do not need it to make a picture. You need it when a `prob:8` branch is eating the edition.
