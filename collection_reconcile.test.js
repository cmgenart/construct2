"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const CollectionFs = require("./collection_fs.js");

function test(name, fn) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e);
    process.exitCode = 1;
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "c2-reconcile-"));
const pad2 = "01";

test("reconcile marks complete artifacts as built", () => {
  CollectionFs.createCollection(tmp, { name: "T" });
  const added = CollectionFs.addPiece(tmp, pad2, {}).piece;
  const coll = CollectionFs.readCollection(tmp, pad2);
  const pr = coll.pieceRecords.find((p) => p.id === added.id);
  pr.buildStatus = "unbuilt";
  CollectionFs.writeCollection(tmp, coll);
  const dir = CollectionFs.pieceDirPath(tmp, pad2, pr.num);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "min.html"), "<html></html>");
  fs.writeFileSync(path.join(dir, "metadata.json"), "{}");
  fs.writeFileSync(path.join(dir, "utf8.txt"), "x");
  const read = CollectionFs.readCollection(tmp, pad2);
  CollectionFs.reconcilePieceStatus(tmp, pad2, read);
  const updated = read.pieceRecords.find((p) => p.id === pr.id);
  if (updated.buildStatus !== "built") {
    throw new Error(`expected built, got ${updated.buildStatus}`);
  }
});

test("reconcile marks errors.json as error", () => {
  const coll = CollectionFs.readCollection(tmp, pad2);
  const pr = coll.pieceRecords[0];
  pr.buildStatus = "unbuilt";
  CollectionFs.writeCollection(tmp, coll);
  const dir = CollectionFs.pieceDirPath(tmp, pad2, pr.num);
  fs.writeFileSync(
    path.join(dir, "errors.json"),
    JSON.stringify([{ info: "fail", error: "x" }]),
  );
  const read = CollectionFs.readCollection(tmp, pad2);
  CollectionFs.reconcilePieceStatus(tmp, pad2, read);
  if (read.pieceRecords[0].buildStatus !== "error") {
    throw new Error(`expected error, got ${read.pieceRecords[0].buildStatus}`);
  }
});

test("reconcile downgrades built when artifacts missing", () => {
  const coll = CollectionFs.readCollection(tmp, pad2);
  coll.pieceRecords[0].buildStatus = "built";
  CollectionFs.writeCollection(tmp, coll);
  const dir = CollectionFs.pieceDirPath(tmp, pad2, coll.pieceRecords[0].num);
  fs.rmSync(path.join(dir, "errors.json"), { force: true });
  fs.rmSync(path.join(dir, "min.html"));
  const read = CollectionFs.readCollection(tmp, pad2);
  CollectionFs.reconcilePieceStatus(tmp, pad2, read);
  if (read.pieceRecords[0].buildStatus !== "unbuilt") {
    throw new Error(`expected unbuilt, got ${read.pieceRecords[0].buildStatus}`);
  }
});

fs.rmSync(tmp, { recursive: true, force: true });
