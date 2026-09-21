# Audit — Construct² the app

**Source of truth:** `electron/`, `dev-ui.html`, `workspace.js`, `package.json` 0.1.1  
**Not yet:** user prose.

## Surfaces

| Surface | Entry | What the user sees |
|---------|--------|-------------------|
| Picker | `electron/renderer/index.html` `#view-picker` | Title, About, project tree, details, footer |
| Workbench | `#view-dev` → iframe `dev-ui.html` | Left panels + preview + console |
| About | dialog + Help menu | Version, short copy |
| Bug report | picker **Report bug…** + IPC | Env dump → open GitHub issue |
| Help menu | `electron/main.js` | **About only** (gap) |

## First run / profiles

| Launch | userData | First-run projects |
|--------|----------|-------------------|
| Installed exe | `%APPDATA%\Construct²` | `Documents\Construct2\projects` + bundled **Demos** root |
| `npm start` | `%APPDATA%\Construct²-dev` | Dev workspace; does not share settings with the install |

Demos: `extraResources` ← `construct-demos/construct` → `resources/demos`, read-only. **Duplicate** copies into the writable root.

## Picker actions (shipped)

- **New…** — name, target root, template (`cc-v3-minimal`, `cc-v3-ascii`, `cc-v3-collection`, `cc-v3.22-minimal`)
- **Duplicate** — shown for read-only / selected demo
- **Import…** — one legacy folder or `*_data.json`
- **Batch…** — import several from a legacy root
- **Add root…** — extra workspace folder
- **Report bug…** / **About**

No Help button on the picker (gap).

## Workbench chrome (not the four panels)

- Projects rail + Close, open folder, Duplicate (read-only)
- Seed number
- Viewport background: solid / checker + swatches
- **Runtime** `<select id="runtime-select">` — Canvas Core list + Project core. **No ?** (gap)
- UI zoom − / % / +
- Preview modes: Full, Min, UTF8, Metadata, Analysis. **No ?** (gap)
- Pan / zoom / reset / fullscreen (Full & Min)
- Day/night theme
- Offline badge
- Console: Build / Art / Both, capture toggles
- xAI key button (Electron)

## Help that already exists

| Control | Today | Problem |
|---------|--------|---------|
| Collections / Parameters / Values / Properties `?` | HTML overlay in `SECTION_HELP` | Links architecture specs |
| Param “Docs” link | `/parameters/DRIVERS_README.txt` | Driver authors only |
| Auto / peer help modals | collection auto-fill | Feature-local, fine |
| `doc_viewer.js` | `/docs/*.md` only | Cannot open `runtimes/` or `lib/` siblings |

## Runtimes in this release

| Id | File | UI |
|----|------|-----|
| `cc-v3.23` (`cc-v3` alias) | `runtimes/cc-v3.23.html` | Default / visible |
| `cc-v3.22` | `runtimes/cc-v3.22.html` | Hidden in dropdown; still a New-project template |
| project-core | `<project>/core.html` | When the project has its own core |

## Libs in this release

`lib/AsciiCore.js` + density / edge / bias engines. Resolved via `//import<AsciiCore.js>`. Template: `cc-v3-ascii`.

## Not in the UI (do not user-doc)

Mint-ready zip, cloud mint, saved pieces, extra runtimes under `wip/`.
