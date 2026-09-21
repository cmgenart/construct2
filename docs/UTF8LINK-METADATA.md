# UTF-8 Data Link & Cardano Metadata Pipeline

This document describes the final, minimal, and correct implementation for producing a self-contained `data:text/html;utf8,...` link (the "utf8link") that can be:

- Pasted directly into a browser address bar and run
- Embedded inside Cardano CIP-25 / CIP-68 metadata JSON (split into 64-byte chunks, pure ASCII, no raw double quotes)

## 1. Core Requirements

- The minified artwork must be delivered as a single `data:` URI.
- The URI must survive pasting into Chrome/Firefox address bars (no unescaped spaces, `#`, or `%`).
- The final string must be split into an array of ≤64-character chunks for Cardano metadata.
- Only ASCII characters are allowed (no emoji, no multi-byte UTF-8).
- Raw `"` characters are forbidden inside the JSON string values (they would require escaping and increase size). Single quotes `'` are used instead.

## 2. Final Escaping Rules (utf8link)

After Terser minification, exactly three characters are escaped in a single regex pass:

```js
var utf8link_min = output_min.replace(/[% #]/g, m => '%'+m.charCodeAt(0).toString(16))
var utf8link = "data:text/html;utf8," + utf8link_min
```

| Character | Escaped as | Reason |
|-----------|------------|--------|
| `%`       | `%25`      | Percent sign must be escaped first so the decoder does not misinterpret following bytes |
| ` ` (space) | `%20`    | Unescaped spaces break address-bar paste and many metadata viewers |
| `#`       | `%23`      | Fragment delimiter; Chrome truncates the URI at the first `#` |

No other characters are escaped. In particular, backticks (`` ` ``) are **not** allowed in the current build (see §4).

## 3. Terser Configuration (Why Single Quotes)

```js
format: {
    ascii_only: false,
    ecma: 5,
    quote_style: 1          // force single quotes, rewrite templates as concatenation
}
```

Rationale:

- Prevents `"` and `` ` `` from appearing in `output_min`.
- Eliminates the need to escape those characters later (saves bytes).
- Terser can apply more aggressive string-optimisation passes on ES5 concatenation than on template literals.
- For the short, high-frequency colour helpers (`cH`, `cR`, `cHSLA`, …) used in this artwork, the concatenation form is measurably smaller after escaping.

Result for this build: **19205 characters** (15 bytes smaller than the backtick-allowed variant).

## 4. Backticks – Why They Are Currently Disabled

Template literals are compact in source code, but:

- Every surviving `` ` `` must be escaped as `%60` (3 bytes instead of 1).
- For the many short interpolations in the colour helpers, the `${}` syntax plus escaping cost outweighs the benefit of keeping the template form.
- The forced single-quote path therefore wins on total encoded size for this particular artwork.

If a future piece contains long multi-line templates with few interpolations, the trade-off may flip. In that case:

1. Remove `ecma: 5` and `quote_style: 1` from the Terser `format` block.
2. Add `` ` `` to the escaping regex: `/[% #`]/g`
3. Re-measure the encoded size.

## 5. Cardano Metadata Constraints

After the utf8link is built:

- advBuilder passes the full `utf8link` as `artSrc` to `CreateMetadata(values, properties, artSrc)`.
- Your `metadata.js` assigns `artSrc` to `files[].src` (or elsewhere) as you choose.
- When **Cardano split** is enabled (default), advBuilder chunks each `files[].src` into ≤64-character strings (see [METADATA-BUILDER.md](./METADATA-BUILDER.md)). Empty `src` on a `text/html` file is filled from `utf8link` before splitting.
- `CheckForInvalidChars(utf8link)` is run as a final guard; any non-ASCII or illegal character aborts the build with a clear error.

The helper `SplitInsertString64` also performs a global `" → '` swap on any descriptive text that will later be embedded in the same JSON structure, ensuring consistency.

## 6. Summary of the Minimal Correct Pipeline

1. Terser minifies with `ecma:5` + `quote_style:1` (single quotes, no backticks).
2. One regex escapes only `%`, space, and `#`.
3. `CheckForInvalidChars` validates the result.
4. `CreateMetadata` uses `artSrc` in metadata; advBuilder chunks `files[].src` when **Cardano split** is on (default).
5. The resulting `utf8link` can be pasted directly into a browser; on-chain JSON uses the post-processed primary metadata (`metadata_min` / `metadata_outputs["metadata.json"].min`).

This approach is the smallest that satisfies all runtime and on-chain constraints for the current artwork.

## 7. Dev UI (advBuilder)

After a build, inspect the link in the dev UI **UTF8** visualiser mode ([VISUALISER.md](./VISUALISER.md)):

- **Raw link** tab — full string.
- **Run** tab — sandboxed iframe (blob URL for `data:` links).

Cardano JSON and pool.pm preview are in **Metadata** mode; see `lastBuild.metadata`, `metadata_min`, `metadata_outputs`, and `pool_pm_link`. If the project has no `metadata.js`, Metadata mode offers to create a default builder ([METADATA-BUILDER.md](./METADATA-BUILDER.md)).