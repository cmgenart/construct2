/**
 * Project metadata builder — see .advBuilder/docs/METADATA-BUILDER.md
 * @param {object} values — flat Values panel + build fields
 * @param {object} properties — active PM2 property choices
 * @param {string|string[]} artSrc — full utf8link from the build
 */

function PadLeft(str, length, padChar) {
  return String(str ?? "").padStart(length, padChar);
}

function CreateMetadata(values, properties, artSrc) {
  const props = properties && typeof properties === "object" ? properties : {};
  const tokenId =
    (values.collection_name || "collection") + PadLeft(values.num, 5, "0");
  const file = {
    mediaType: "text/html",
    name: PadLeft(values.num, 5, "0"),
    src: artSrc,
  };
  const inner = {
    name: values.name,
    description: values.description,
    artist: values.artist,
    website: values.website,
    files: [file],
    properties:
      props.Theme != null && props.Mode != null
        ? { style: props.Theme + "-" + props.Mode }
        : undefined,
  };
  const root = {
    721: {
      [values.policy]: {
        [tokenId]: inner,
      },
    },
  };
  return {
    "metadata.json": root,
    "metadata.readable.json": root,
  };
}

module.exports = { CreateMetadata };
