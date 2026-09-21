#!/usr/bin/env node
/** One-off generator for tokens-nord-variants.css — run: node ui/generate-nord-variants.js */
const fs = require('fs');
const path = require('path');

const NORD_BASE = {
  '--bg': '#2e3440', '--text': '#eceff4', '--panel': '#3b4252', '--border': '#4c566a',
  '--border-strong': '#434c5e', '--head-bg': 'linear-gradient(#434c5e, #3b4252)',
  '--head-hover': 'linear-gradient(#4c566a, #434c5e)', '--head-collapsed': 'linear-gradient(#3b4252, #2e3440)',
  '--muted': '#a3abb8', '--control-text': '#d8dee9', '--input-bg': '#2e3440', '--card-bg': '#3b4252',
  '--surface': '#434c5e', '--surface-hover': '#4c566a', '--accent': '#88c0d0', '--accent-soft': '#354656',
  '--shell-panel': '#3b4252', '--shell-panel-hover': '#434c5e', '--shell-border': '#4c566a',
  '--shell-tab-icon': '#a3abb8', '--scrollbar': '#4c566a', '--state-active-bg': '#5e81ac',
  '--state-active-text': '#eceff4', '--state-locked-bg': '#ebcb8b', '--state-locked-text': '#2e3440',
  '--level-active-bg': '#3b5060', '--level-active-border': '#88c0d0', '--level-active-text': '#88c0d0',
  '--divider-color': '#4c566a', '--modal-bg': '#3b4252', '--chrome-close-bg': '#434c5e',
  '--chrome-close-hover': '#4a3540', '--piece-built-bg': '#3a4a38', '--piece-built-border': '#a3be8c',
  '--piece-unbuilt-bg': '#4a3a34', '--piece-unbuilt-border': '#d08770', '--field-border': '#4c566a',
  '--field-border-soft': '#434c5e', '--chevron': '#a3abb8', '--param-track-border': '#5e81ac',
  '--param-track-bg': '#2e3440', '--param-fill': '#3a5060', '--param-thumb': '#8fbcbb',
  '--param-thumb-border': '#5e81ac', '--param-grid-line': 'rgba(236,239,244,0.1)', '--table-head': '#a3abb8',
  '--btn-muted-bg': '#434c5e', '--btn-muted-hover': '#4c566a', '--btn-muted-text': '#eceff4',
  '--btn-muted-border': '#4c566a', '--row-highlight': '#3a5068', '--readonly-bg': '#2e3440',
  '--auto-row-bg': '#3b4252', '--warning-bg': '#4a4430', '--warning-text': '#ebcb8b',
  '--warning-border': '#a88800', '--warning-hover': '#5a5038', '--success-bg': '#3a4a38',
  '--success-border': '#a3be8c', '--danger-hover-bg': '#4a3038', '--danger-hover-border': '#bf616a',
  '--danger-hover-text': '#d8a0a8', '--disabled-bg': '#3b4252', '--disabled-text': '#6a7385',
  '--disabled-border': '#434c5e', '--readout-wrap-bg': '#2e3440', '--readout-wrap-border': '#4c566a',
  '--readout-bar-bg': '#3b4252', '--readout-bar-border': '#4c566a', '--chip-bg': '#434c5e',
  '--chip-border': '#4c566a', '--color-focus-ring': '#88c0d0', '--details-bg': '#2e3440',
  '--card': '#3b4252', '--btn-bg': '#434c5e', '--btn-text': '#eceff4',
};

const PRESERVE = new Set([
  '--warning-bg', '--warning-text', '--warning-border', '--warning-hover',
  '--danger-hover-bg', '--danger-hover-border', '--danger-hover-text',
]);

const DEPTH = [
  '--start-bg: color-mix(in srgb, var(--bg) 68%, #000);',
  '--depth-shadow-sm: 0 1px 3px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05);',
  '--depth-shadow-md: 0 4px 18px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.04);',
  '--depth-shadow-lg: 0 18px 44px rgba(0,0,0,0.65), 0 2px 0 rgba(255,255,255,0.03);',
  '--depth-shadow-inset: inset 0 2px 6px rgba(0,0,0,0.4);',
  '--depth-highlight: inset 0 1px 0 rgba(255,255,255,0.07);',
];

const SHIFTS = [
  { id: 'nord-1', delta: 28 }, { id: 'nord-2', delta: 56 }, { id: 'nord-3', delta: 84 },
  { id: 'nord-4', delta: 112 }, { id: 'nord-5', delta: 168 }, { id: 'nord-6', delta: 195 },
  { id: 'nord-7', delta: 230 }, { id: 'nord-8', delta: 260 }, { id: 'nord-9', delta: 285 },
  { id: 'nord-10', delta: 318 },
];

function parseHex(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      default: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 100, l * 100];
}

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  function toHex(n) {
    const v = Math.round((n + m) * 255);
    return (v < 16 ? '0' : '') + v.toString(16);
  }
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

function shiftHex(hex, d) {
  if (!hex || hex.charAt(0) !== '#') return hex;
  const rgb = parseHex(hex);
  const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  return hslToHex(hsl[0] + d, hsl[1], hsl[2]);
}

function shiftVal(v, d) {
  if (!v) return v;
  if (v.indexOf('linear-gradient') === 0) {
    return v.replace(/#([0-9a-fA-F]{3,8})/g, (_m, hex) => shiftHex('#' + hex, d));
  }
  if (v.indexOf('rgba(') === 0) {
    return v.replace(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,/g, (_m, r, g, b) => {
      const hsl = rgbToHsl(+r, +g, +b);
      const hex = hslToHex(hsl[0] + d, hsl[1], hsl[2]);
      const rgb2 = parseHex(hex);
      return 'rgba(' + rgb2[0] + ',' + rgb2[1] + ',' + rgb2[2] + ',';
    });
  }
  if (v.charAt(0) === '#') return shiftHex(v, d);
  return v;
}

let css = '/* Generated by ui/generate-nord-variants.js — do not edit by hand */\n\n';
for (const { id, delta } of SHIFTS) {
  css += 'html[data-palette="' + id + '"] {\n';
  for (const [k, v] of Object.entries(NORD_BASE)) {
    css += '  ' + k + ': ' + (PRESERVE.has(k) ? v : shiftVal(v, delta)) + ';\n';
  }
  for (const line of DEPTH) css += '  ' + line + '\n';
  css += '}\n\n';
}

const out = path.join(__dirname, 'tokens-nord-variants.css');
fs.writeFileSync(out, css);
console.log('Wrote', out);
