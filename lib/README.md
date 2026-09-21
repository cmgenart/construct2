# Construct² shared libraries

Files here are resolved by `//import<path>` when the path is **not** present in the art project root.

**Resolution order:** project root first → `construct2/lib/` fallback.

Lib-resolved files appear in:

- Builder file watch (transitive import graph)
- Startup **Source files** panel with a `(lib)` tag ([`source_inventory.js`](../source_inventory.js))
- Collection `collections/<pad2>/_source/` snapshots (stored at the project-relative import path, e.g. `AsciiCore.js`)

## AsciiCore

| File | Role |
|------|------|
| `AsciiCore.js` | Factory, overlay, pipeline |
| `AsciiEngine_density.js` | Brightness ramp engine |
| `AsciiEngine_edge.js` | Edge engine (+ directional property branch) |
| `AsciiEngine_bias.js` | 8×8 bias lookup engine |

Usage in any project:

```js
//import<AsciiCore.js>

const acLayer = Layer(0.1);
const ac = AsciiCore(acLayer);
```

Override locally by placing the same filename in the project root (e.g. while developing in `art/AsciiCore/`).

User docs: [AsciiCore.getting-started.md](./AsciiCore.getting-started.md), [AsciiCore.reference.md](./AsciiCore.reference.md). Older spec: [docs/runtimes/ASCII-CORE-SPEC.md](../docs/runtimes/ASCII-CORE-SPEC.md) (superseded).
