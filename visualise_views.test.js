"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { injectArtConsoleHook } = require("./visualise_views.js");

describe("injectArtConsoleHook", () => {
  it("injects at start of head when present", () => {
    const html = "<html><head><title>x</title></head><body></body></html>";
    const out = injectArtConsoleHook(html);
    assert.match(out, /<head><script>/);
    assert.ok(out.indexOf("<head><script>") < out.indexOf("<title>"));
  });

  it("injects at start of body when head is absent", () => {
    const html =
      "<html lang='en'><body><style></style><script>let x = V2();</script></body></html>";
    const out = injectArtConsoleHook(html);
    assert.match(out, /<body><script>/);
    assert.ok(out.indexOf("<body><script>") < out.indexOf("<style>"));
    assert.ok(out.indexOf("<body><script>") < out.indexOf("let x = V2()"));
  });

  it("injects before first script when no head or body tag", () => {
    const html = "<div><script>bad();</script></div>";
    const out = injectArtConsoleHook(html);
    assert.ok(out.indexOf("__advArtConsoleHook") < out.indexOf("bad();"));
  });

  it("skips when hook already present", () => {
    const html = "<html><head><script>window.__advArtConsoleHook=1</script></head></html>";
    assert.equal(injectArtConsoleHook(html), html);
  });
});
