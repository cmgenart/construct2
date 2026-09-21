/**
 * Pack PNG masters into a Windows ICO (PNG-in-ICO, Vista+).
 * Usage: node pack-ico.js <out.ico> <png...>
 */
const fs = require("fs");
const path = require("path");

function pngSize(buf) {
  if (buf.toString("ascii", 1, 4) !== "PNG") {
    throw new Error("not a PNG");
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function packIco(pngPaths, outPath) {
  const images = pngPaths.map((p) => {
    const data = fs.readFileSync(p);
    const { width, height } = pngSize(data);
    return { data, width, height, name: path.basename(p) };
  });
  const count = images.length;
  let offset = 6 + 16 * count;
  const buf = Buffer.alloc(
    offset + images.reduce((n, img) => n + img.data.length, 0),
  );
  buf.writeUInt16LE(0, 0);
  buf.writeUInt16LE(1, 2);
  buf.writeUInt16LE(count, 4);
  let pos = 6;
  for (const img of images) {
    buf.writeUInt8(img.width >= 256 ? 0 : img.width, pos);
    buf.writeUInt8(img.height >= 256 ? 0 : img.height, pos + 1);
    buf.writeUInt8(0, pos + 2);
    buf.writeUInt8(0, pos + 3);
    buf.writeUInt16LE(1, pos + 4);
    buf.writeUInt16LE(32, pos + 6);
    buf.writeUInt32LE(img.data.length, pos + 8);
    buf.writeUInt32LE(offset, pos + 12);
    img.data.copy(buf, offset);
    offset += img.data.length;
    pos += 16;
  }
  fs.writeFileSync(outPath, buf);
  console.log(
    path.basename(outPath),
    images.map((i) => `${i.width}`).join("+"),
    buf.length,
    "bytes",
  );
}

const [out, ...pngs] = process.argv.slice(2);
if (!out || !pngs.length) {
  console.error("Usage: node pack-ico.js <out.ico> <png...>");
  process.exit(1);
}
packIco(pngs, out);
