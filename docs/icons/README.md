# Hex Vortex v2 — tight pack, open mouths, inward recursion

Construct² ships two Windows icons from this set:

| Role | Source | Packed file |
|---|---|---|
| **App** (window, Electron, About) | `svg/icon-spectrum.svg` | `icon.ico` |
| **Installer** (NSIS setup / uninstall) | `svg/icon-mono.svg` | `icon-mono.ico` |

Runtime copies live in `electron/icons/` (`icon.ico`, `about-256.png`, `mark-64.png`) from the spectrum masters.

Compared with v1: cubes packed like the original reference, inner-facing faces open, nested apertures + spirals into the shared dark core, particles travel inward.

## What to use when

| File | Use |
|---|---|
| `svg/icon-spectrum.svg` | **App icon** (vector) |
| `svg/icon-mono.svg` | **Installer** + status bar, inverted surfaces |
| `svg/icon-spectrum-particles.svg` | Marketing / home-screen with inward particles |
| `svg/icon-simple-spectrum.svg` | Tab bars, 16–32px, favicons |
| `svg/icon-mono-transparent.svg` | Overlay on photos / light UI |
| `svg/icon-mark-bold.svg` | Smallest sizes — no glow, fat strokes |
| `png/art-inward-spectrum-1024.png` | Store / splash (richer glow) |
| `png/art-inward-mono-1024.png` | Mono splash |

PNG export sizes per vector variant: 1024 / 512 / 256 / 128 / 64.

## Regenerating

```bash
python3 generate_icons.py
node pack-ico.js icon.ico png/favicon-spectrum-16.png png/favicon-spectrum-32.png png/icon-spectrum-64.png png/icon-spectrum-128.png png/icon-spectrum-256.png
node pack-ico.js icon-mono.ico png/favicon-mono-16.png png/favicon-mono-32.png png/icon-mono-64.png png/icon-mono-128.png png/icon-mono-256.png
```

`generate_icons.py` needs Python 3, pycairo, Pillow. Geometry knobs: `HEX_R`, `RING` (`HEX_R * 1.38`), `CORE_R`.
