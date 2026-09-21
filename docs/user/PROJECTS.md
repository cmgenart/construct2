# Projects

A project is a folder Construct² knows how to open. The list on the left is just folders, grouped so you do not have to remember where you put last Tuesday.

## Demos vs yours

| | Demos | Your projects |
|--|--------|----------------|
| Where | Inside the app install | Usually `Documents\Construct2\projects` |
| Save | No | Yes |
| Why | Teaching pieces. Updates may replace them. | The sketchbook |

Open a demo, look, **Duplicate** when you want to keep a scar. Duplicate copies into your writable root and opens the copy.

If you launched the installed app, settings live in `%APPDATA%\Construct²`. The `npm start` workshop uses `Construct²-dev` so the two do not share recent lists or API keys.

## The tree

- **Recent** — what you opened.
- **Demos** — bundled originals.
- **Projects** — writable roots (you can **Add root…** if you keep art somewhere else).
- Search filters the tree. Double-click opens. The right-hand card shows path, runtime, and source files.

## New, Duplicate, Import

**New…** — name, which root, which template.

| Template | For |
|----------|-----|
| Canvas Core v3 — minimal | A blank 1000×1000 piece. Start here. |
| Canvas Core v3 + AsciiCore | Same blank, labelled for ascii. Add `//import<AsciiCore.js>` yourself. |
| Canvas Core v3 + collection scripts | Blank plus a `collection.js` example. |
| Canvas Core v3.22 — minimal | Older core, for parity with imported work. Prefer 3.23 unless you have a reason. |

**Duplicate** — copy to your projects. The polite way to edit a demo.

**Import…** / **Batch…** — bring in a *legacy* Construct folder or `*_data.json`. The old platform stored the core inside that JSON, so you do not need a vintage runtime file. Read-only roots will not be overwritten in place; duplicate or pick a writable target.

## Runtime

Each project remembers which **canvas runtime** to build with (`cc-v3.23` today). You can switch it on the workbench. That does not overwrite a local `core.html` unless you choose **Project core**.

More: [Source](./SOURCE.md), [Getting Started](./GETTING-STARTED.md).
