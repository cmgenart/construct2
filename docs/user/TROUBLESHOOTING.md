# Troubleshooting

When the workshop sulks.

## No Demos

The installer puts teaching pieces in the app’s `resources/demos` folder and shows them as a read-only root. If the group is empty:

- You may be looking at an older install. Repair / reinstall 0.1.1+.
- The **dev** launch (`npm start`) does not use the installed Demos unless you pointed a root at `construct-demos`. That is expected.

## I cannot save

You opened a **demo**. Duplicate it. The original is on purpose sacred.

## Offline badge

The workbench lost its local builder connection. Click the badge to retry. If it stays down, close the piece and open it again. The art iframe can look fine while the knobs go deaf.

## Rebuild forgot my sliders

A property change that rebuilds the iframe can race the parameter message. We hold the last map until `OnParam` exists; if it still misses, nudge a parameter or report it. Include which property you flipped.

## ARM / “Construct2.exe not found”

Use the **arm64** installer on Snapdragon, or the combo installer. Very old 0.1.0 combo builds had a packing bug; 0.1.1 and later should launch. If Defender ate the exe in transit, that is a different animal — Report bug with the installer name.

## Report a bug

Picker → **Report bug…**. Write what you did, what you expected, what you got. The dialog already attaches versions and a little environment. We would rather a noisy report than a mysterious screenshot of grey.

## Help

**Help** on the start page, the **Help** menu, and the **?** buttons on the workbench open these pages. If a `?` still looks empty, you are on an older build — reinstall 0.1.1 or later.
