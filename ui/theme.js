(function (global) {
  'use strict';

  const THEME_STORAGE_KEY = 'advBuilder.theme';
  const PALETTE_STORAGE_KEY = 'advBuilder.palette';

  const NORD_SURFACE = '#434c5e';

  const NORD_HUE_SHIFTS = [
    { id: 'nord-1', delta: 28 },
    { id: 'nord-2', delta: 56 },
    { id: 'nord-3', delta: 84 },
    { id: 'nord-4', delta: 112 },
    { id: 'nord-5', delta: 168 },
    { id: 'nord-6', delta: 195 },
    { id: 'nord-7', delta: 230 },
    { id: 'nord-8', delta: 260 },
    { id: 'nord-9', delta: 285 },
    { id: 'nord-10', delta: 318 },
  ];

  const NORD_PALETTES = [{ id: 'nord', label: 'Nord' }].concat(
    NORD_HUE_SHIFTS.map(function (s, i) {
      return { id: s.id, label: String(i + 1) };
    }),
  );

  let pickerEl = null;

  function parseHex(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
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

  function shiftHex(hex, hueDelta) {
    if (!hex || hex.charAt(0) !== '#') return hex;
    const rgb = parseHex(hex);
    const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    return hslToHex(hsl[0] + hueDelta, hsl[1], hsl[2]);
  }

  function lightenHex(hex, lightnessMultiplier) {
    if (!hex || hex.charAt(0) !== '#') return hex;
    const rgb = parseHex(hex);
    const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    const l = Math.min(78, hsl[2] * lightnessMultiplier);
    return hslToHex(hsl[0], hsl[1], l);
  }

  function getNordSwatchColor(paletteId) {
    let color = NORD_SURFACE;
    if (paletteId !== 'nord') {
      const shift = NORD_HUE_SHIFTS.find(function (s) { return s.id === paletteId; });
      if (shift) color = shiftHex(NORD_SURFACE, shift.delta);
    }
    return lightenHex(color, 2);
  }

  function normalizePalette(palette) {
    if (!palette || palette === 'default') return 'default';
    if (palette === 'nord') return 'nord';
    if (/^nord-\d+$/.test(palette)) {
      const n = parseInt(palette.slice(5), 10);
      if (n >= 1 && n <= 10) return 'nord-' + n;
    }
    return 'default';
  }

  function readStoredTheme() {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) || 'light';
    } catch (_) {
      return 'light';
    }
  }

  function readStoredPalette() {
    try {
      return normalizePalette(localStorage.getItem(PALETTE_STORAGE_KEY) || 'default');
    } catch (_) {
      return 'default';
    }
  }

  function effectiveDomTheme(theme, palette) {
    return palette !== 'default' ? 'dark' : (theme === 'dark' ? 'dark' : 'light');
  }

  function updateToggleUi(theme, palette) {
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;
    const domTheme = effectiveDomTheme(theme, palette);
    toggle.setAttribute('aria-checked', domTheme === 'dark' ? 'true' : 'false');
    toggle.classList.toggle('theme-toggle--palette-nord', palette !== 'default');
    toggle.title = palette !== 'default'
      ? 'Day/night theme (right-click for Nord palettes)'
      : 'Day/night theme (right-click for Nord palettes)';
  }

  function updatePickerHighlight(palette) {
    if (!pickerEl) return;
    pickerEl.querySelectorAll('.theme-picker-swatch').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.palette === palette);
    });
  }

  function applyTheme(theme, palette, opts) {
    opts = opts || {};
    const t = theme === 'dark' ? 'dark' : 'light';
    const p = normalizePalette(palette);
    const root = document.documentElement;
    root.dataset.palette = p;
    root.dataset.theme = effectiveDomTheme(t, p);
    root.classList.add('theme-depth');
    try {
      localStorage.setItem(THEME_STORAGE_KEY, t);
      localStorage.setItem(PALETTE_STORAGE_KEY, p);
    } catch (_) {}
    updateToggleUi(t, p);
    updatePickerHighlight(p);
    if (opts.broadcast && global.parent !== global) {
      try {
        global.parent.postMessage({ type: 'advBuilder:themeChange', theme: t, palette: p }, '*');
      } catch (_) {}
    }
  }

  function closePicker() {
    if (!pickerEl) return;
    pickerEl.classList.remove('open');
  }

  function openPicker(anchor) {
    if (!pickerEl) return;
    const rect = anchor.getBoundingClientRect();
    pickerEl.classList.add('open');
    const menuRect = pickerEl.getBoundingClientRect();
    let top = rect.bottom + 6;
    let left = rect.right - menuRect.width;
    if (left < 8) left = 8;
    if (top + menuRect.height > global.innerHeight - 8) {
      top = rect.top - menuRect.height - 6;
    }
    pickerEl.style.top = top + 'px';
    pickerEl.style.left = left + 'px';
    updatePickerHighlight(readStoredPalette());
  }

  function buildPicker() {
    if (pickerEl) return pickerEl;
    pickerEl = document.createElement('div');
    pickerEl.id = 'theme-picker-menu';
    pickerEl.className = 'theme-picker-menu';
    pickerEl.setAttribute('role', 'menu');
    pickerEl.innerHTML = '<div class="theme-picker-swatches"></div>';
    const row = pickerEl.querySelector('.theme-picker-swatches');
    NORD_PALETTES.forEach(function (entry) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'theme-picker-swatch';
      btn.dataset.palette = entry.id;
      btn.setAttribute('role', 'menuitem');
      btn.title = entry.id === 'nord' ? 'Nord' : 'Nord ' + entry.label;
      btn.style.background = getNordSwatchColor(entry.id);
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        applyTheme('dark', entry.id, { broadcast: true });
        closePicker();
      });
      row.appendChild(btn);
    });
    document.body.appendChild(pickerEl);
    document.addEventListener('pointerdown', function (ev) {
      if (!pickerEl.classList.contains('open')) return;
      if (pickerEl.contains(ev.target)) return;
      if (ev.target.closest && ev.target.closest('#theme-toggle')) return;
      closePicker();
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') closePicker();
    });
    return pickerEl;
  }

  function onToggleClick() {
    let theme = readStoredTheme();
    const palette = readStoredPalette();
    if (palette !== 'default') {
      applyTheme(theme === 'dark' ? 'light' : 'dark', 'default', { broadcast: true });
      return;
    }
    theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(theme, 'default', { broadcast: true });
  }

  function initThemeToggle() {
    buildPicker();
    const theme = readStoredTheme();
    const palette = readStoredPalette();
    applyTheme(theme, palette, { broadcast: false });
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      toggle.addEventListener('click', onToggleClick);
      toggle.addEventListener('contextmenu', function (ev) {
        ev.preventDefault();
        openPicker(toggle);
      });
    }
    global.addEventListener('message', function (ev) {
      if (ev.data?.type === 'advBuilder:theme') {
        const t = ev.data.theme === 'dark' ? 'dark' : 'light';
        const p = normalizePalette(ev.data.palette || readStoredPalette());
        applyTheme(t, p, { broadcast: false });
      }
    });
  }

  global.advTheme = {
    applyTheme: applyTheme,
    initThemeToggle: initThemeToggle,
    getNordSwatchColor: getNordSwatchColor,
    NORD_PALETTES: NORD_PALETTES,
  };
  global.initThemeToggle = initThemeToggle;
  global.applyTheme = applyTheme;
})(typeof window !== 'undefined' ? window : globalThis);
