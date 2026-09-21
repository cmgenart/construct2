# Values

Values are **baked in when you build**. Name, artist, the sentence on the certificate, the seed — things that should be *in the file*, not sliding around afterwards.

If you need a knob that moves the picture right now, that is a [Parameter](./PARAMETERS.md).

## Levels

| Level | Whose opinion |
|-------|----------------|
| **default** | The project’s baseline |
| **collection** | Shared by every piece in the open collection |
| **piece** | This edition only |
| **result** | Read-only snapshot of the last build |

Check **use** to include a key at the level you are editing. Lower levels win when they bother to speak.

**auto** (with an xAI key) can draft a sentence for a key. You still have to mean it.

## If you write code

In source:

```js
0/*[values.seed]*/
"/[values.name]/"
```

`/*[values.…]*/` is an expression, evaluated at build. `/[values.name]/` is a straight substitution. The certificate insert uses both so the flip side of the canvas knows who it is.
