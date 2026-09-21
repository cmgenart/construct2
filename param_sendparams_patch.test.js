"use strict";

const { patchSendParamsTarget } = require("./param_sendparams_patch.js");

const selfOnly = 'const SendParams = (data) => WINDOW.postMessage(data, "*");';
const ternary =
  "const SendParams = (data) => (WINDOW.parent === WINDOW ? WINDOW : WINDOW.parent).postMessage(data, \"*\");";
const parentOk = 'const SendParams = (data) => WINDOW.parent.postMessage(data, "*");';

if (patchSendParamsTarget(selfOnly) !== parentOk) {
  throw new Error("expected self-only SendParams to be patched");
}
if (patchSendParamsTarget(ternary) !== parentOk) {
  throw new Error("expected ternary SendParams to normalize to parent");
}
if (patchSendParamsTarget(parentOk) !== parentOk) {
  throw new Error("expected parent SendParams to stay unchanged");
}
console.log("param_sendparams_patch tests OK");
