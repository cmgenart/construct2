"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildViewportBgStyle,
  buildViewportBgMessage,
  normalizeViewportColor,
  getDefaultViewportBgSettings,
  resolveViewportBgSettings,
} = require("./viewport_bg.js");

describe("viewport_bg", () => {
  it("defaults to solid black and independent checker alt", () => {
    const d = getDefaultViewportBgSettings();
    assert.equal(d.viewportBgSolid, true);
    assert.deepEqual(normalizeViewportColor(d.viewportBgSolidColor), {
      h: 0,
      s: 0,
      v: 0,
      a: 1,
    });
    assert.deepEqual(normalizeViewportColor(d.viewportBgCheckerAltColor), {
      h: 0,
      s: 0,
      v: 0.54,
      a: 1,
    });
  });

  it("migrates legacy viewportBgColor to solid fill and checker alt", () => {
    const r = resolveViewportBgSettings({
      viewportBgColor: { h: 120, s: 0.5, v: 0.5, a: 1 },
    });
    assert.equal(r.viewportBgSolidColor.h, 120);
    assert.equal(r.viewportBgCheckerAltColor.h, 120);
    assert.equal(r.viewportBgCheckerAltColor.v, 0.6);
  });

  it("solid mode uses solid colour only", () => {
    const st = buildViewportBgStyle({
      viewportBgSolid: true,
      viewportBgSolidColor: { h: 0, s: 0, v: 0, a: 1 },
      viewportBgCheckerAltColor: { h: 0, s: 0, v: 0.54, a: 1 },
    });
    assert.equal(st.backgroundColor, "rgb(0,0,0)");
    assert.equal(st.backgroundImage, "");
  });

  it("checker mode uses solid fill and alt colours independently", () => {
    const st = buildViewportBgStyle({
      viewportBgSolid: false,
      viewportBgSolidColor: { h: 0, s: 0, v: 0.2, a: 1 },
      viewportBgCheckerAltColor: { h: 0, s: 0, v: 0.8, a: 1 },
    });
    assert.match(st.backgroundImage, /conic-gradient/);
    assert.equal(st.backgroundSize, "20px 20px");
    assert.equal(st.backgroundColor, "rgb(51,51,51)");
    assert.match(st.backgroundImage, /rgb\(204,204,204\)/);
  });

  it("message includes fill (solid) and alt colours", () => {
    const msg = buildViewportBgMessage({
      viewportBgSolid: false,
      viewportBgSolidColor: { h: 0, s: 0, v: 0.2, a: 1 },
      viewportBgCheckerAltColor: { h: 0, s: 0, v: 0.8, a: 1 },
    });
    assert.equal(msg.solid, false);
    assert.equal(msg.solidColor.v, 0.2);
    assert.equal(msg.checkerFillColor.v, 0.2);
    assert.equal(msg.checkerAltColor.v, 0.8);
  });
});
