# Collections

A collection is a **numbered family** of the same piece: same code, different seeds, properties, or values. Think of a print run, not a second project.

You do not need a collection to make one picture. You need one when you want fifty cousins and a straight face about which file is which.

## In the panel

- **Tabs** — switch, create, rename.
- **Piece list** (the extra column) — **orange** means “the source moved; rebuild me”. **Green** means built.
- **Build** / **Build all** — compile the stale ones. There is a progress bar and a cancel if you started a novel.
- **+** / **Del** — add a blank slot or remove one.
- **Script** — run functions from the project’s `collection.js` (batch naming, shuffles). Optional.

Built files live under `collections/01/0001/` (and friends). A snapshot of the art sources, including the core that was actually used, goes in `collections/01/_source/`. Edit the live project later and pieces go orange again. The snapshot is what that edition *was*.

## Auto

The **Auto** tab is for filling text values with an xAI key (the small **xai** button). A collection brief plus a few peer examples keep the machine from naming everything “Untitled Mist”. This is optional sugar, not the point of collections.

## If you write code

`collection.js` is the batch script file. See the collection template. Piece records and mint fields exist on disk for later shipping work; there is no “export zip” button in this alpha.
