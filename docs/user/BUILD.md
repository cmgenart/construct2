# Build

Build means **make the file someone else can open**. The preview is already doing a version of this every time you change a property or a value. Seed, properties, and values are sealed in. Parameters are not — they are live only in the workshop unless you also bake them yourself.

## Seed

The number at the top of the left column. Same seed, same dice (`SEED` / `RN` in Canvas Core). Change it when you want another universe that still obeys the laws.

## Full vs Min

**Full** is readable-ish. **Min** has been through the wringer (Terser, and whatever `//PROCESS<minify>` islands you declared). UTF8 view is where you see whether the piece still fits through the letterbox.

## Output

A single-piece build writes next to the project (`output.*` and friends). Collection builds write under `collections/<nn>/<nnnn>/` and snapshot sources in `_source/`.

There is no “upload to a chain” button in this alpha. You get files. The rest is your circus.

## If you write code

`/*[values.seed]*/` is how the core learns the seed. `metadata.js` turns values + properties + the art string into the JSON in the Metadata tab. Quote marks get normalised. Do not fight the builder about `"` versus `'` unless you enjoy losing.
