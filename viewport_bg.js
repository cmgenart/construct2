"use strict";

let normalizeHsva;
let hsvToRgb;
if (typeof require !== "undefined") {
  ({ normalizeHsva, hsvToRgb } = require("./param_color.js"));
} else if (typeof window !== "undefined" && window.advParamColor) {
  normalizeHsva = window.advParamColor.normalizeHsva;
  hsvToRgb = window.advParamColor.hsvToRgb;
}

const DEFAULT_VIEWPORT_BG_SOLID_COLOR = { h: 0, s: 0, v: 0, a: 1 };
/** Legacy single checker base (v0.45) — used only when migrating old saves. */
const DEFAULT_VIEWPORT_BG_CHECKER_COLOR = { h: 0, s: 0, v: 0.45, a: 1 };
const DEFAULT_VIEWPORT_BG_CHECKER_ALT_COLOR = { h: 0, s: 0, v: 0.54, a: 1 };

function normalizeViewportColor(color) {
  if (!color || typeof color !== "object") return { ...DEFAULT_VIEWPORT_BG_SOLID_COLOR };
  return normalizeHsva(color.h, color.s, color.v, color.a);
}

function rgbCss(r, g, b, a) {
  if (a >= 1) return `rgb(${r},${g},${b})`;
  return `rgba(${r},${g},${b},${a})`;
}

function hsvaToRgbCss(hsva) {
  const { r, g, b, a } = hsvToRgb(hsva.h, hsva.s, hsva.v, hsva.a);
  return rgbCss(r, g, b, a);
}

/** One-time migration: derive alternate cell from legacy single checker base. */
function migrateLegacyCheckerAlt(baseHsva) {
  const base = normalizeViewportColor(baseHsva);
  return normalizeViewportColor({
    ...base,
    v: Math.min(1, Math.max(0, base.v * 1.2)),
  });
}

/**
 * Normalized viewport BG settings (migrates legacy viewportBgColor / single checker).
 * Checker fill always uses viewportBgSolidColor (same as solid-mode fill).
 * @param {object} [settings]
 */
function resolveViewportBgSettings(settings) {
  const def = getDefaultViewportBgSettings();
  const legacy =
    settings?.viewportBgColor && typeof settings.viewportBgColor === "object"
      ? settings.viewportBgColor
      : null;
  const solidSrc =
    settings?.viewportBgSolidColor ||
    settings?.viewportBgCheckerFillColor ||
    legacy ||
    def.viewportBgSolidColor;

  let altSrc = settings?.viewportBgCheckerAltColor;
  if (!altSrc) {
    const legacyChecker =
      settings?.viewportBgCheckerColor || legacy || DEFAULT_VIEWPORT_BG_CHECKER_COLOR;
    altSrc = migrateLegacyCheckerAlt(legacyChecker);
  }

  return {
    viewportBgSolid: settings?.viewportBgSolid !== false,
    viewportBgSolidColor: normalizeViewportColor(solidSrc),
    viewportBgCheckerAltColor: normalizeViewportColor(altSrc),
  };
}

/**
 * CSS inline style fields for a viewport surface (dev preview only).
 * @param {object} [settings]
 */
function buildViewportBgStyle(settings) {
  const cfg = resolveViewportBgSettings(settings);
  if (cfg.viewportBgSolid) {
    return {
      backgroundColor: hsvaToRgbCss(cfg.viewportBgSolidColor),
      backgroundImage: "",
      backgroundSize: "",
      backgroundPosition: "",
    };
  }
  const fill = hsvaToRgbCss(cfg.viewportBgSolidColor);
  const alt = hsvaToRgbCss(cfg.viewportBgCheckerAltColor);
  return {
    backgroundColor: fill,
    backgroundImage: `conic-gradient(${alt} 25%, ${fill} 0 50%, ${alt} 0 75%, ${fill} 0)`,
    backgroundSize: "20px 20px",
    backgroundPosition: "0 0",
  };
}

/**
 * postMessage payload for preview iframes.
 * @param {object} [settings]
 */
function buildViewportBgMessage(settings) {
  const cfg = resolveViewportBgSettings(settings);
  return {
    type: "advBuilder:viewportBg",
    solid: cfg.viewportBgSolid,
    solidColor: cfg.viewportBgSolidColor,
    checkerFillColor: cfg.viewportBgSolidColor,
    checkerAltColor: cfg.viewportBgCheckerAltColor,
  };
}

function getDefaultViewportBgSettings() {
  return {
    viewportBgSolid: true,
    viewportBgSolidColor: { ...DEFAULT_VIEWPORT_BG_SOLID_COLOR },
    viewportBgCheckerAltColor: { ...DEFAULT_VIEWPORT_BG_CHECKER_ALT_COLOR },
  };
}

module.exports = {
  DEFAULT_VIEWPORT_BG_SOLID_COLOR,
  DEFAULT_VIEWPORT_BG_CHECKER_COLOR,
  DEFAULT_VIEWPORT_BG_CHECKER_ALT_COLOR,
  normalizeViewportColor,
  resolveViewportBgSettings,
  buildViewportBgStyle,
  buildViewportBgMessage,
  getDefaultViewportBgSettings,
};
