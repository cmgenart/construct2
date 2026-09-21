# The workbench

This is the desk. **Art on the right. Knobs on the left.** Close in the top-left returns you to the project list. A folder button opens the project on disk. If you opened a demo, **Duplicate** is up here too.

## Left column

Four drawers, each with a **?** of its own:

| Drawer | In one line |
|--------|-------------|
| [Collections](./COLLECTIONS.md) | Numbered sets of the same piece |
| [Parameters](./PARAMETERS.md) | Live knobs — no rebuild |
| [Values](./VALUES.md) | Text and numbers baked at build |
| [Properties](./PROPERTIES.md) | Forks in the code |

Above them: **seed**, a quiet **background** for the preview (solid or checker — it is not part of the art), the **runtime** dropdown, and a zoom for the UI if the type is whispering.

The runtime `?` (when present) opens the getting-started for *that* core — [Canvas Core 3.23](../../runtimes/cc-v3.23.getting-started.md) if you are on `cc-v3.23`.

## Right column

The [preview](./PREVIEW.md): Full, Min, UTF8, Metadata, Analysis. Under it, a **console** you can drag open — build complaints on one side, `console.log` from the art on the other.

Day/night toggle lives on the preview bar. It changes the workshop, not the piece.

## If you write code

The iframe is a built HTML file. Changing a **property** or **value** rebuilds. Changing a **parameter** posts a message into the running art. If a rebuild “forgets” the sliders, that is a bug we have been hunting — try Random or toggle a property again, then tell us via **Report bug**.
