# Demo projects — ship with the installer

**Status:** Demos author in [construct-demos](../../../construct-demos/); installer vendors `construct/` as a read-only **Demos** workspace root (`extraResources` → `resources/demos`)  
**Related:** [PROJECTS-STARTUP-DESIGN.md](./PROJECTS-STARTUP-DESIGN.md) (workspace roots), [CORE.md](./CORE.md) (Canvas Core + project layout), [templates/projects/](../templates/projects/) (blank New project scaffolds)

A stranger who installs Construct² should open a few **small, interesting, latest-core** pieces immediately — not only an empty “Canvas Core v3 — minimal” scaffold. Those pieces are **demos**, not templates.

| Kind | Role | Writable? |
|------|------|-----------|
| **Template** | Blank scaffold from **New project…** (`templates/projects/`) | User’s copy in their projects folder |
| **Demo** | Finished teaching piece with comments, properties, a clear trick | Bundled original is read-only; user’s fork is writable |

---

## 1. Why this machine already showed your art folders

The installer did **not** scan the whole disk. Construct² stores `workspace.json` in Electron **userData**.

| How you launch | userData folder (Windows) |
|----------------|---------------------------|
| Installed `.exe` | `%APPDATA%\Construct²` |
| `npm start` | `%APPDATA%\Construct²-dev` |

The two profiles do not share workspace roots, window state, or secrets. First `npm start` after this split copies an existing release folder into `-dev` so your current checkout workspace is not lost.

If you already ran the source app, the install reused the same roots (`art/`, `art-legacy/`, extra paths you added).

On a **new PC** (no prior Construct² userData):

1. There is no `workspace.json`.
2. Packaged `construct2/` does not sit next to your `art/` tree, so [workspace.js](../workspace.js) `defaultDevRoots()` finds nothing.
3. `ensureWritableUserRoot()` creates **`Documents\Construct2\projects`** and registers it as the writable root.

That Documents folder is the right default. Keep it. Demos should not be dumped into it as the only copy of the originals.

---

## 2. Recommended disk layout

```
Documents\Construct2\
  projects\          ← default writable root (already created on first run)
  demos\             ← optional user forks (“Save a copy”) — not the installer originals
```

Inside the **install** (not Documents):

```
<install>\resources\demos\    ← extraResources, read-only for the user
  chaos\
  perlin-noise\
  line-recursion\
  …
```

**Do not** write user edits into Program Files / `%LOCALAPPDATA%\Programs\…`. Updates overwrite that tree. **Do not** let **Save** replace the bundled originals.

---

## 3. Save policy (pick this)

Follow Processing / Unity Learn: examples live in the app; the user’s sketchbook is separate.

| Action | Behaviour |
|--------|-----------|
| Open a demo | Load from bundled `resources/demos/<name>` (workspace root **Demos**, `readOnly: true`) |
| Edit in the UI | Allowed in memory / `dev.json` only if we later allow a scratch overlay — **v1: treat the root as read-only** |
| Duplicate | **Duplicate** on the start-page (selected read-only project) and in the open-project chrome copies into the writable root, then opens the copy |
| Save as / rename | Always under the writable Documents root |
| Reset demo | Delete the user copy (if any); bundled original is unchanged |
| New project | Unchanged — scaffold into `Documents\Construct2\projects` |

**Do not** let the user save over bundled demos. **Do** create `Documents\Construct2\projects` (already done). A sibling `Documents\Construct2\demos` is optional; one writable root is simpler for alpha.

**Rejected:** first-run copy of every demo into Documents as writable. That duplicates files, mixes teaching pieces with user work, and makes “reset” ambiguous. Copy **on first save** only.

---

## 4. How demos get into the installer

Self-contained `.exe` — no git clone, no second download.

| Option | How | Verdict |
|--------|-----|---------|
| **A. `extraResources` → `resources/demos/`** | electron-builder copies `demos/` from this repo | **Yes** — listed as a read-only workspace root when packaged |
| **B. Fold into `templates/projects/`** | Demos look like New project types | No — templates are blank scaffolds; mixing them hides “New project” |
| **C. Author in `construct-demos`** | Sibling repo [construct-demos](../../../construct-demos/) | **Yes — this is the home.** Installer vendors `construct-demos/construct/` via **A** so the `.exe` stays offline |

**Alpha path:** upgrade pieces into `construct-demos/construct/<slug>/` (see the teaching map). electron-builder `extraResources` copies that folder to `resources/demos`.

`package.json` must include that extraResources path. Do not mix demos into `templates/projects/`.

---

## 5. What each demo must be

The list and teaching goals are in [construct-demos/docs/TEACHING-MAP.md](../../../construct-demos/docs/TEACHING-MAP.md) (16 slugs). For each:

1. Upgrade to **latest Canvas Core** (built-in `Perlin`, `LayerGL`, AsciiCore — no leftover noise tables or forked cores unless the lesson is the fork).
2. Comments follow **that demo’s lesson only** (map § per-demo).
3. A few generic properties so Random / locks matter.
4. Reachable: one trick, single HTML, no mint / ARG.

Blank **templates** stay in Construct² (`cc-v3-minimal`, …). Demos are the interesting pieces.

---

## 6. Workspace on a fresh install

When `app.isPackaged` and no `workspace.json` yet:

1. Writable root: `Documents\Construct2\projects`.
2. Read-only root: bundled `resources/demos` labelled **Demos** (first in the tree).
3. Packaged builds do **not** call `defaultDevRoots()` (`art/`, `art-legacy/` on the genart root).

If `workspace.json` already exists (this PC after `npm start`), old roots stay until the user removes them. **Demos** is still attached when the bundled folder exists (path refreshed on update). The Demos root cannot be removed or made writable.

`npm start` (unpackaged) also attaches sibling `construct-demos/construct` as **Demos** when that folder exists, in addition to `art/` / `art-legacy/`.

`electron-builder` copies `../../construct-demos/construct` → `resources/demos`. Build from a tree that has that folder on the genart root.

---

## 7. Help `?` menus vs full docs (found on this pass)

Section **`?`** buttons inject **inline HTML** in `dev-ui.html` (`SECTION_HELP`). That copy is always in the app.

**Full documentation** links under those menus call `doc_viewer.js` → `GET /docs/<file>.md`.

The installer ships `docs/**/*.md` (plus `docs/icons/**`) so `GET /docs/<file>.md` works after install. SVG/icon source scripts stay out of the `.exe`.

`/parameters/DRIVERS_README.txt` is seeded into the **project** folder on first driver use; a read-only demo may still 404 that one link until the project is duplicated.
