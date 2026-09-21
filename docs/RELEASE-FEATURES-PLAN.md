# Construct² — Release & Bug Reporter Implementation Plan

**Status:** Draft — awaiting review before implementation  
**Repo:** `https://github.com/cmgenart/construct2`  
**Scope:** Feature 1 (GitHub Releases + installers + auto-update) and Feature 2 (in-app bug reporter)

---

## Current state

| Item | Status |
|------|--------|
| Electron app entry | `electron/main.js` → `electron/renderer/index.html` |
| `electron-builder` | **Not installed** |
| `electron-updater` | **Not installed** |
| `.github/workflows/` | **None** |
| `package.json` version | `0.0.1`, `"private": true` |
| Git remote | `cmgenart/construct2` |
| External URL helper | `openUrlExternally()` in `main.js` (handles long URLs on Windows) |
| Dialog pattern | HTML `<dialog>` in `index.html` + `app_dialog.js` |
| IPC bridge | `preload.js` → `window.advBuilder.*` |
| Builder child process | Spawns `node builder.js` — **must fix for packaged builds** (`ELECTRON_RUN_AS_NODE`) |

---

## Feature 1 — GitHub Releases with installers

### 1.1 Dependencies & scripts

**Edit:** `package.json`

| Change | Detail |
|--------|--------|
| Add devDependencies | `electron-builder`, `electron-updater` |
| Remove or set `"private": false` | Required for publish metadata; app is public on GitHub |
| Add `"author"` | Needed by electron-builder (e.g. `"Charles Machin"` or org name) |
| Add scripts | `"dist"`, `"dist:win"`, `"dist:mac"`, `"dist:linux"`, `"publish"` |
| Add `"build"` block | electron-builder config (see §1.2) |

**Example scripts:**

```json
"dist": "electron-builder --publish never",
"dist:win": "electron-builder --win --publish never",
"dist:mac": "electron-builder --mac --publish never",
"dist:linux": "electron-builder --linux --publish never",
"publish": "electron-builder --publish always"
```

### 1.2 electron-builder configuration

**Edit:** `package.json` → `"build"` (or separate `electron-builder.yml` — prefer inline in `package.json` to match repo style)

| Key | Value |
|-----|-------|
| `appId` | `com.cmgenart.construct2` |
| `productName` | `Construct²` |
| `directories.output` | `dist` |
| `files` | App source: `electron/**`, `builder.js`, `builder.*.js`, `*.js` (root modules), `lib/**`, `runtimes/**`, `templates/**`, `ui/**`, `vendor/**`, `scripts/**`, `package.json`, `node_modules/**` — exclude tests, `wip/**`, `docs/**`, `.git/**` |
| `extraMetadata.main` | `electron/main.js` (already set via `"main"`) |
| `win.target` | `nsis` → `.exe` installer |
| `mac.target` | `dmg` |
| `linux.target` | `AppImage` |
| `publish` | `[{ "provider": "github", "owner": "cmgenart", "repo": "construct2" }]` |

**Create (optional):** `build/icon.ico`, `build/icon.icns`, `build/icon.png` — electron-builder defaults work without custom icons; add later for polish.

**Create:** `.gitignore` entry for `dist/` if not already present.

### 1.3 Packaged runtime — spawn builder with embedded Node

**Edit:** `electron/main.js` — `startDevUiForProject()`

When `app.isPackaged`, spawn the builder using Electron’s embedded Node instead of system `node`:

```javascript
const nodeBin = process.env.ADVBUILDER_NODE || (app.isPackaged ? process.execPath : "node");
const spawnEnv = app.isPackaged
  ? { ...process.env, ELECTRON_RUN_AS_NODE: "1", /* existing ADVBUILDER_* */ }
  : { ...process.env, /* existing */ };
```

Without this, installed apps fail to start the dev server because `node` is not on the user’s PATH.

### 1.4 Auto-update via electron-updater

**Create:** `electron/updater.js` — small module:

- Import `autoUpdater` from `electron-updater`
- Only run when `app.isPackaged` (skip in dev)
- `autoUpdater.autoDownload = false` (prompt user first — matches existing UX patterns)
- On `update-available` → notify renderer via IPC or native dialog
- On user confirm → `downloadUpdate()` → `quitAndInstall()` on `update-downloaded`
- Log errors to console; never crash startup on update check failure

**Edit:** `electron/main.js`

- `require("./updater.js")` after `app.whenReady()`
- Wire IPC: `adv:check-for-updates`, `adv:install-update` (optional — can also auto-check on startup)

**Edit:** `electron/preload.js` + renderer (minimal)

- Expose `checkForUpdates()` if we add a “Check for updates…” menu/button (recommended in picker footer)

**Config:** electron-updater reads GitHub Releases automatically from the `publish` block — no extra URL config when using the GitHub provider.

### 1.5 GitHub Actions release workflow

**Create:** `.github/workflows/release.yml`

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run publish
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Notes:**

- `npm run publish` runs `electron-builder --publish always`, which creates/updates the GitHub Release and uploads assets via the GitHub publisher.
- `GITHUB_TOKEN` is provided automatically — **no extra secrets required** for public repos.
- Tag must match `v*` (e.g. `v0.1.0`). Version in `package.json` should match the tag (without `v` prefix): tag `v0.1.0` → `"version": "0.1.0"`.
- macOS builds require code signing for Gatekeeper-smooth installs — unsigned DMGs work for testing but show warnings (document as manual follow-up).

### 1.6 Version sync

**Edit:** `package.json` `"version"` before each release tag.

Recommended first release: `0.1.0` (or `1.0.0` if you consider this v1).

---

## Feature 2 — In-app bug reporter (no server, no token)

### 2.1 Design

| Requirement | Approach |
|-------------|----------|
| Form UI | HTML `<dialog id="dlg-bug-report">` matching existing dialog styles |
| Trigger | **Report bug…** button in `#tree-actions` (visible on project picker) |
| App version | IPC reads `package.json` version from app path |
| OS / platform | `process.platform`, `process.arch`, `os.type()`, `os.release()` |
| Error logs | Tail of current project’s `output.build.log`, `output.art.log`, `output.errors.json` (if project selected/open); cap total size (~8 KB) |
| User description | Required `<textarea>` |
| Submit | Build GitHub issue URL → existing `openUrlExternally()` via `adv:open-external` |
| No API / no secrets | URL-only; user submits on github.com in browser |

**Issue URL template:**

```
https://github.com/cmgenart/construct2/issues/new?title={title}&body={body}
```

**Title:** `[Bug] {first line of description, max ~80 chars}`  
**Body:** Markdown sections — Version, Environment, Project (if any), Description, Logs.

Constants in one place: **Create** `electron/github_issue.js` with `OWNER`, `REPO`, `buildBugReportIssueUrl({ title, body })`.

### 2.2 Main-process IPC

**Edit:** `electron/main.js`

| Handler | Returns |
|---------|---------|
| `adv:get-app-info` | `{ version, platform, arch, osType, osRelease, electronVersion, isPackaged }` |
| `adv:get-bug-report-context` | `{ project: { name, path } \| null, logs: { build, art, errors } }` — reads log tails from selected project path |
| `adv:open-bug-report` | Accepts `{ description }`, assembles body, opens external URL |

Alternatively, assemble URL in renderer and call existing `adv:open-external` — keeps main thinner; **recommended:** assemble in main so encoding stays consistent and log paths never leak unnecessarily.

### 2.3 Preload & renderer

**Edit:** `electron/preload.js`

```javascript
getAppInfo: () => ipcRenderer.invoke("adv:get-app-info"),
getBugReportContext: () => ipcRenderer.invoke("adv:get-bug-report-context"),
openBugReport: (payload) => ipcRenderer.invoke("adv:open-bug-report", payload),
```

**Create:** `electron/renderer/bug_report.js`

- Opens dialog, pre-fills read-only Environment panel from `getAppInfo()` + `getBugReportContext()`
- Validates description non-empty
- On submit → `openBugReport({ description })` → close dialog → status “Opening GitHub…”

**Edit:** `electron/renderer/index.html`

- Add dialog markup + `<script src="bug_report.js">`
- Add `#btn-bug-report` to `#tree-actions`

### 2.4 Log collection rules

| File | Max lines / size |
|------|------------------|
| `output.build.log` | Last 40 lines |
| `output.art.log` | Last 40 lines |
| `output.errors.json` | Full file if &lt; 4 KB, else truncate with note |

If no project selected: body says “No project open” and logs section omitted.

---

## Implementation order

| Step | Task | Files |
|------|------|-------|
| **1** | Packaged Node spawn fix | `electron/main.js` |
| **2** | electron-builder deps + `build` config + dist scripts | `package.json`, `.gitignore` |
| **3** | Auto-updater module + startup check | `electron/updater.js`, `electron/main.js`, `preload.js` |
| **4** | Release workflow | `.github/workflows/release.yml` |
| **5** | GitHub issue URL helper | `electron/github_issue.js` |
| **6** | Bug report IPC handlers | `electron/main.js` |
| **7** | Bug report UI | `electron/renderer/bug_report.js`, `index.html`, `preload.js` |
| **8** | README section for releases + bug reports | `README.md` (short) |

---

## Manual actions required (user)

### One-time repo setup

1. **Create / confirm GitHub repo** `cmgenart/construct2` (already exists per remote).
2. **Set repo to public** — required for anonymous auto-update checks and issue creation without auth.
3. **Enable GitHub Issues** — Settings → General → Features → Issues ✓.
4. **(Optional)** Add issue templates later; not required for URL pre-fill flow.

### Before first release

5. **Bump `package.json` version** to match intended tag (e.g. `0.1.0`).
6. **Commit and push** all release-feature changes to `main`.
7. **Create and push annotated tag:**
   ```bash
   git tag -a v0.1.0 -m "Construct² 0.1.0"
   git push origin v0.1.0
   ```
8. **Watch Actions** — workflow builds Windows `.exe`, macOS `.dmg`, Linux `.AppImage` and attaches them to the GitHub Release.
9. **Verify release page** — assets present, release notes (optional) added manually or via `releaseNotes` in builder config later.

### electron-builder values to confirm

| Value | Planned | Change if needed |
|-------|---------|------------------|
| `appId` | `com.cmgenart.construct2` | Your reverse-DNS preference |
| `owner` / `repo` | `cmgenart` / `construct2` | If repo moves |
| Tag format | `v*` (semver with `v` prefix) | Must match workflow trigger |
| Installers | NSIS (win), DMG (mac), AppImage (linux) | — |

### Workflow secrets

| Secret | Required? |
|--------|-----------|
| `GITHUB_TOKEN` | **No manual setup** — auto-injected in Actions |
| `GH_TOKEN` / PAT | **Not needed** for public repo release upload via `GITHUB_TOKEN` |
| Code signing certs | **Optional** — macOS/Windows signing for production polish (post-v1) |

### Testing checklist

**Local build (no publish):**

```bash
cd construct2
npm install
npm run dist:win    # or dist:mac / dist:linux on respective OS
# Install from dist/ and confirm app opens, project picker works, dev UI starts
```

**Bug reporter:**

1. Open app → **Report bug…**
2. Enter description → Submit
3. Browser opens GitHub “New Issue” with title + body pre-filled
4. With a project open that has build errors, confirm logs appear in body
5. Submit issue manually on GitHub to confirm flow end-to-end

**Auto-update (requires a published release):**

1. Install **older** build (e.g. `v0.1.0`)
2. Publish **newer** tag (`v0.1.1`) via CI
3. Launch older app → update check finds new version → download → restart installs update

**CI release:**

1. Push tag `v0.1.0`
2. Confirm 3 matrix jobs succeed
3. Release page shows 3 platform assets + `latest.yml` / `latest-mac.yml` / `latest-linux.yml` (electron-updater metadata)

---

## Out of scope (minimal plan)

- Code signing (Apple / Windows Authenticode)
- Custom app icons (use defaults initially)
- Issue templates / labels automation
- CrashReporter or Sentry
- Private repo release tokens (not needed — repo is public)

---

## Risk notes

| Risk | Mitigation |
|------|------------|
| Packaged app cannot spawn builder | Step 1 — `ELECTRON_RUN_AS_NODE` |
| Installer too large | `files` glob excludes `wip/`, tests, and docs source (SVGs); ships `docs/**/*.md` for in-app help |
| GitHub issue URL too long (Windows) | Reuse `openUrlExternally()` redirect trick |
| macOS CI signing failures | Start with unsigned DMG; document user override in Security settings |
| `private: true` blocks publish | Set `private: false` before first release |

---

*After review approval, implementation proceeds in the order above.*
