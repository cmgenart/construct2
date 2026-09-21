# Getting Started

Construct² is a workshop for **one-file generative art**. You do not publish a folder of assets. You publish a single HTML page that draws itself.

You do not need to know that on day one. You need a demo and a mouse.

## 1. Open the app

After install you should see a project list. Two kinds of folder matter:

- **Demos** — finished teaching pieces that came with the app. Read-only. You can look, you cannot save over them. (The installer is allowed to replace those later.)
- **Your projects** — usually `Documents\Construct2\projects`. This is the sketchbook.

If the Demos group is empty, see [Troubleshooting](./TROUBLESHOOTING.md).

The first-run install and the copy you launch with `npm start` keep **separate** settings, so the workshop and the construction site do not argue.

## 2. Open a demo

Double-click something that looks interesting. You land on the **workbench**: knobs on the left, the picture on the right.

Try, in any order:

1. **Properties** — hit **Random**. The piece should reshuffle the unlocked forks.
2. **Seed** — change the number. Same recipe, different dice.
3. **Parameters** (if the piece has any) — drag a slider. That talks to the art *live*. No rebuild speech.
4. Click the picture. Some pieces flip over to a **certificate** (title, seed, save). Click off the canvas if you only wanted to paint.

If the picture is a postage stamp, use the preview **pan/zoom** control (or Ctrl + mouse) and **reset** when you are lost.

## 3. Make it yours

Demos will not let you save. That is on purpose.

Select the demo and **Duplicate**. Construct² copies it into your projects folder and opens the copy. Now it is yours to ruin.

**New…** is the blank page: pick a name, a folder, and a template. The usual one is **Canvas Core v3 — minimal**.

## 4. When you want to write

A piece is a handful of small files. The builder stitches them into the runtime.

```text
setup.js     — once: Canvas(width, height, border)
draw.js      — every frame, until you return 1
defs.js      — parameters, branches, constants
functions.js — helpers
```

The dialect those files speak is [Canvas Core](../../runtimes/cc-v3.23.getting-started.md). The desk itself is [the workbench](./THE-WORKBENCH.md).

## 5. About and bugs

**About** is the version sticker. **Report bug…** opens a GitHub issue with a little environment dump — rude to the maintainers in a helpful way.

Help menu (once wired) is this guide, not a scavenger hunt through architecture notes.
