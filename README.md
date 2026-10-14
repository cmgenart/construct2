# Construct²

Construct² is a desktop toolchain for building, packaging, and distributing **single-file HTML generative art**.

**This is an alpha.** Expect rough edges. Please [open an issue](https://github.com/cmgenart/construct2/issues/new) when something breaks.

## Download (Windows)

Installers (after the first GitHub Release):

- **x64** — [Construct² 0.1.1](https://github.com/cmgenart/construct2/releases/tag/v0.1.1)
- **ARM64** — same release, `…-arm64.exe` (Snapdragon / Copilot+ PCs). Use this file on ARM PCs. Do not use a combined x64+ARM installer if you have one from an older build.

The builds are **unsigned**. Windows SmartScreen may say “Windows protected your PC”:

1. Click **More info**
2. Click **Run anyway**

You do **not** need Node.js or git to use the installer.

### First run

1. Install the matching arch (`…-x64.exe` or `…-arm64.exe`) and launch **Construct2**
2. New projects go in `Documents\Construct2\projects` (you can **Add root…** to point at another folder). Bundled teaching pieces appear under **Demos**.
3. **New project** → **Canvas Core v3 — minimal**
4. Open the project, edit, preview, and build a single HTML file

**Report a bug:** use **Report bug…** on the project picker. It opens a GitHub issue draft with version, OS, and recent build logs. You submit it in the browser — the app does not keep a GitHub token.

## From source

```bash
git clone https://github.com/cmgenart/construct2.git
cd construct2
npm install
npm start
```

Opens the Electron project picker plus the embedded dev UI (`?embed=1`). Window position and size are restored across sessions. Default HTTP port is **3100**; override with `ADVBUILDER_PORT`.

Windows installers from this tree (x64 + ARM64):

```bash
npm run dist:win
```

Or one architecture: `npm run dist:win:x64` / `npm run dist:win:arm64`. Output is `dist/` (NSIS `.exe` per arch). Building installers with bundled **Demos** expects a sibling `construct-demos/construct` folder (the genart checkout layout). Without it, the app still runs; Demos are missing until you add a root.

Architecture: [docs/CORE.md](./docs/CORE.md). User help: [docs/user/README.md](./docs/user/README.md). Docs index: [docs/README.md](./docs/README.md).

## Highlights

- **`//PARAM-*` scanning** — [`param_scan.js`](./param_scan.js) populates `state.paramSchema`, `paramScanErrors`, merges defaults into `paramValues`; each build writes **`output.params.md`** next to the project. Scans imported files too (`//import<path>`). Canonical + import inventory: [`source_inventory.js`](./source_inventory.js). See [CORE.md](./docs/CORE.md) §4.2.
- **HTTP `GET` / `POST /params`** and **WebSocket `{ type: 'params', values }`** — live parameter state in **`dev.json`**; dev-ui syncs the preview iframe with bare **`postMessage`** maps (see [PARAM-SPEC](./docs/PARAM-SPEC.md) §8).
- **Colour parameters** — swatch rows + floating **Iro.js** HSVA picker. Spec: [PARAM-COLOR-PLAN](./docs/PARAM-COLOR-PLAN.md).
- **Values / Properties panels** — build inserts and PropMaster groups. [VALUES-PANEL](./docs/VALUES-PANEL.md), [PROPERTIES-PANEL](./docs/PROPERTIES-PANEL.md).
- **Metadata builder** — per-project `metadata.js`; Cardano split default on ([METADATA-BUILDER](./docs/METADATA-BUILDER.md)).
- **Preview visualiser** — Full | Min | UTF8 | Metadata | Analysis ([VISUALISER](./docs/VISUALISER.md)).
- **Collections v2** — on-disk collections, batch build, `_source/` snapshot ([COLLECTION-DESIGN-V2](./docs/COLLECTION-DESIGN-V2.md)).
- **Runtime selection** — shared `runtimes/*` or project `core.html` ([PROJECTS-STARTUP-DESIGN](./docs/PROJECTS-STARTUP-DESIGN.md) §4.9).

## Tests

```bash
npm run test:param
npm run test:project-runtime
npm run test:project-inspect
npm run test:source-inventory
npm run test:collection-source
npm run test:workspace-first-run
npm run test:help-links
```

See `package.json` `"test:*"` scripts for the full set.

## Environment (optional)

| Variable | Where | Purpose |
|----------|--------|---------|
| `ADVBUILDER_PORT` | Electron + `builder.js` | Dev server port (default `3100`). Restart the app after changing. |
| `ADVBUILDER_HOST` | Electron | Builder child: `spawn`, `utility` (Electron utilityProcess), or `ipc` (not implemented). Default: `utility` when packaged, `spawn` in `npm start`. Packaged `utility` falls back to `spawn`. |
| `ADVBUILDER_NODE` | Electron `main.js` spawn host only | Executable used to spawn `builder.js` (default `node` in dev; packaged spawn uses Electron’s Node). |
| `ADVBUILDER_NO_OPEN` | Set by Electron when spawning | Suppresses opening an external browser; dev UI loads in-app. |
| `ADVBUILDER_POLL_WATCH` or `CHOKIDAR_USEPOLLING` | `builder.js` | Set to `1` if file watching misses saves (e.g. some network drives). |
| `ADVBUILDER_VERBOSE` | `builder.js` | Set to `1` to log every load/save path (noisy). |

`npm start` stores workspace and secrets in `%APPDATA%\Construct²-dev`. The installed app uses `%APPDATA%\Construct²`. They do not share settings.

## If `npm install` fails (certificate / SSL)

If you see **`UNABLE_TO_VERIFY_LEAF_SIGNATURE`**, npm cannot trust the registry HTTPS connection (common behind corporate proxies). Trust your org’s root CA, or set `NODE_EXTRA_CA_CERTS` / `npm config set cafile`. As a last resort only: `npm config set strict-ssl false`.

## Windows: `EBUSY` / `EPERM` during cleanup

Close any **`npm start` / Electron** windows, then retry. If installs stay flaky, delete `node_modules` and run `npm install` again.

## Classic Node builder

```bash
npm install
node builder.js --project-path path/to/your-project
```

## License

[MIT](./LICENSE) — Copyright (c) 2026 Charles Machin / cmgenart.
