# Runtimes

Official starter HTML files that teach Construct² how to handle each JavaScript runtime.

| File | Runtime |
|------|---------|
| `cc-v3.23.html` | **Canvas Core v3.23** — flagship ultra-compact generative-art runtime |
| `cc-v3.23.getting-started.md` / `cc-v3.23.reference.md` | User docs for 3.23 (abbreviations live in the reference) |
| `cc-v3.22.html` | **Canvas Core v3.22** — older tier (hidden from dev UI dropdown; still in manifest) |
| `manifest.json` | Runtime registry (id, file, ccVersion) |

**Experimental framework runtimes** (p5.js, Three.js) are **not** registered here. They live deactivated under [`wip/extra-runtimes/`](../wip/extra-runtimes/) — see [EXTRA-RUNTIMES.md](../docs/EXTRA-RUNTIMES.md).

## Selection model

Projects do **not** have to keep only one core on disk:

| Mode | Build uses | `core.html` on disk |
|------|------------|---------------------|
| Shared runtime (e.g. `cc-v3.23`) | `construct2/runtimes/<file>` | Left unchanged |
| **Project core** (`project-core`) | `<project>/core.html` | Authoritative for builds |

Selection is stored in `project.json.runtime` and `dev.json.settings.selectedRuntime`. The dev UI runtime dropdown switches between modes without copying files. Implementation: [`project_runtime.js`](../project_runtime.js).

New scaffolds copy a runtime into `core.html` once at create time; the default selection is usually the template’s manifest id. Authors can switch to **Project core** to edit the local copy, or pick shared runtimes to compare behaviour.

Collection `_source/` snapshots store whichever core was **active** at build time, plus all transitive `//import<>` files (see [`source_inventory.js`](../source_inventory.js) and [COLLECTION-DESIGN-V2.md](../docs/COLLECTION-DESIGN-V2.md) §6.8).

See [PROJECTS-STARTUP-DESIGN.md](../docs/PROJECTS-STARTUP-DESIGN.md) §4.9–§6.6 and [CORE.md](../docs/CORE.md) §6.1.1.
