const fs = require("fs");
const path = require("path");
const os = require("os");

const SAMPLE_NAME = "Sample Legacy";
const SAMPLE_TYPEID = "Playground.Square-1.0";

const SAMPLE_CANVAS = `<!DOCTYPE html>
<html><body>
<!-- Playground Square Canvas v1.0 -->
insert<setup>
end<setup>
insert<draw>
end<draw>
</body></html>
`;

/**
 * Write a synthetic legacy project folder (generic names only).
 * @param {string} dir
 * @param {object} [opts]
 */
function writeLegacyProject(dir, opts = {}) {
  const name = opts.name || SAMPLE_NAME;
  fs.mkdirSync(dir, { recursive: true });
  const data = {
    name,
    typeid: opts.typeid || SAMPLE_TYPEID,
    canvas: opts.canvas != null ? opts.canvas : SAMPLE_CANVAS,
    codeblocks: opts.codeblocks || [
      { name: "setup", content: "function Setup() {}\n" },
      { name: "draw", content: "function Draw() {}\n" },
      { name: "functions", content: "" },
    ],
    data: {
      piece: opts.piece || [
        { key: "seed", value: "0" },
        { key: "num", value: "1" },
      ],
      collection: opts.collection || [{ key: "name", value: name }],
      artist: opts.artist || [{ key: "name", value: "Test Artist" }],
    },
    collectiondata: opts.collectiondata || [],
  };
  const dataFile = path.join(dir, `${name}_data.json`);
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), "utf8");
  return { dir, dataFile, name, data };
}

function makeTempLegacyRoot(prefix = "c2-legacy-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

module.exports = {
  SAMPLE_NAME,
  SAMPLE_TYPEID,
  SAMPLE_CANVAS,
  writeLegacyProject,
  makeTempLegacyRoot,
};
