# Vendored third-party assets (advBuilder)

## markdown-it.min.js

- **Package:** [markdown-it](https://www.npmjs.com/package/markdown-it) v14.1.0  
- **License:** MIT  
- **Source:** https://github.com/markdown-it/markdown-it  
- **Served at:** `/vendor/markdown-it.min.js` (see `builder.js`)  
- **Used by:** [`doc_viewer.js`](../doc_viewer.js) — in-app documentation viewer

Global: `window.markdownit`

## mermaid.min.js

- **Package:** [mermaid](https://www.npmjs.com/package/mermaid) v11.4.0  
- **License:** MIT  
- **Source:** https://github.com/mermaid-js/mermaid  
- **Served at:** `/vendor/mermaid.min.js` (see `builder.js`)  
- **Used by:** [`doc_viewer.js`](../doc_viewer.js) — renders ` ```mermaid ` fenced diagrams in docs

Global: `window.mermaid`

## iro.min.js

- **Package:** [@jaames/iro](https://www.npmjs.com/package/@jaames/iro) v5.5.2  
- **License:** MIT  
- **Source:** https://github.com/jaames/iro.js  
- **Served at:** `/vendor/iro.min.js` (see `builder.js`)

Loaded from dev-ui when the colour picker is implemented (Phase 4). Global: `window.iro`.
