# Runtime documentation

Design notes for Construct² JavaScript runtimes and how optional capabilities attach to them.

**Starter HTML files** (authoring templates) live in [`construct2/runtimes/`](../../runtimes/README.md). **Runtime selection** (shared vs project `core.html`) is documented in [`runtimes/README.md`](../../runtimes/README.md) and [CORE.md](../CORE.md) §6.1.1.

| Document | Contents |
|----------|----------|
| [ASCII-CORE-INTEGRATION.md](./ASCII-CORE-INTEGRATION.md) | **Decided** — Shape A: CC3 extension, Layer-based object API, `//import<AsciiCore.js>` |
| [ASCII-CORE-SPEC.md](./ASCII-CORE-SPEC.md) | **Spec v0.2** — API, engines, properties, size budget |
| [`construct2/lib/README.md`](../../lib/README.md) | **Shared lib** — AsciiCore + import fallback |

See also [CORE.md](../CORE.md) §4 (Canvas Core boot, `Layer`, library APIs).
