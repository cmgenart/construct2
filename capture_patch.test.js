const assert = require("assert");
const { patchCaptureClient } = require("./capture_patch.js");

const html = "<html><body><canvas></canvas></body></html>";
const once = patchCaptureClient(html);
assert.ok(once.includes("__advCaptureClient"));
assert.ok(once.indexOf("__advCaptureClient") < once.lastIndexOf("</body>"));
assert.strictEqual(patchCaptureClient(once), once);
assert.ok(patchCaptureClient("<canvas></canvas>").endsWith("</script>"));

console.log("capture_patch.test.js: ok");
