(function (XS) {
  'use strict';

  // X's class names are hashed and change between deploys, but its colors are a
  // small fixed palette. So instead of targeting classes, rewrite colors: every
  // grey is placed on X's own bg→text ramp and moved to the same spot on ours;
  // X's accent blue becomes our accent. Like-pink, retweet-green etc. stay.
  const PRESETS = {
    quiettl: { bg: '#15171b', surface: '#1d2026', border: '#2c3038', muted: '#8b919c', text: '#e3e5e9', accent: '#4c8bf5' },
    graphite: { bg: '#121316', surface: '#1b1d22', border: '#2c2f36', muted: '#8a909a', text: '#e4e6ea', accent: '#4c8bf5' },
    nord: { bg: '#2e3440', surface: '#353c4a', border: '#434c5e', muted: '#9aa5b8', text: '#eceff4', accent: '#5e81ac' },
    gruvbox: { bg: '#1d2021', surface: '#282828', border: '#3c3836', muted: '#a89984', text: '#ebdbb2', accent: '#458588' },
    mocha: { bg: '#1e1e2e', surface: '#262637', border: '#45475a', muted: '#a6adc8', text: '#cdd6f4', accent: '#8b6fe0' },
    oled: { bg: '#000000', surface: '#0c0c0e', border: '#222226', muted: '#80848c', text: '#d6d8dc', accent: '#3a7bd5' },
    paper: { bg: '#f6f3ee', surface: '#ece7df', border: '#ddd5c8', muted: '#6f675d', text: '#2b2722', accent: '#b0522c' },
  };

  // X's own ramps: bg, surface, border, muted text, text.
  const SOURCES = {
    lightsout: [[0, 0, 0], [22, 24, 28], [47, 51, 54], [113, 118, 123], [231, 233, 234]],
    dim: [[21, 32, 43], [30, 39, 50], [56, 68, 77], [139, 152, 165], [247, 249, 249]],
    light: [[255, 255, 255], [247, 249, 249], [239, 243, 244], [83, 100, 113], [15, 20, 25]],
  };
  const KEYS = ['bg', 'surface', 'border', 'muted', 'text'];

  const lum = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const hex = (h) => (parseColor(h) || { rgb: [0, 0, 0] }).rgb; // '#rrggbb' → [r, g, b]
  function hue(r, g, b) {
    const mx = Math.max(r, g, b);
    const d = mx - Math.min(r, g, b);
    if (!d) return 0;
    let h = mx === r ? (g - b) / d : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    return h < 0 ? h + 360 : h;
  }

  // mode: a SOURCES key, or an explicit [bg, surface, border, muted, text] ramp of [r,g,b]
  function makeMapper(palette, mode) {
    const src = Array.isArray(mode) ? mode : SOURCES[mode] || SOURCES.lightsout;
    const dir = lum(...src[4]) > lum(...src[0]) ? 1 : -1;
    const A = src.map((c) => lum(...c) * dir);
    const dst = KEYS.map((k) => hex(palette[k]));
    const acc = hex(accent || palette.accent);
    return function (r, g, b) {
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      if (chroma >= 90) {
        const h = hue(r, g, b);
        return h >= 195 && h <= 215 ? acc : null;
      }
      if (chroma > 30) return null;
      const L = lum(r, g, b) * dir;
      if (L <= A[0]) return dst[0];
      for (let i = 0; i < 4; i++) {
        if (L <= A[i + 1]) return lerp(dst[i], dst[i + 1], (L - A[i]) / (A[i + 1] - A[i] || 1));
      }
      return dst[4];
    };
  }

  const COLOR = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)|#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi;
  function parseColor(s) {
    COLOR.lastIndex = 0;
    const m = COLOR.exec(String(s));
    if (!m) return null;
    if (m[5] === undefined) return { rgb: [+m[1], +m[2], +m[3]], a: m[4] };
    let h = m[5];
    if (h.length <= 4) h = h.replace(/./g, '$&$&');
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return { rgb: [n(0), n(2), n(4)], a: h.length === 8 ? String(+(n(6) / 255).toFixed(3)) : undefined };
  }
  function remap(css, map) {
    return css.replace(COLOR, (all) => {
      const p = parseColor(all);
      const c = p && map(...p.rgb);
      if (!c) return all;
      return p.a === undefined ? `rgb(${c[0]}, ${c[1]}, ${c[2]})` : `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${p.a})`;
    });
  }

  // Leave custom properties alone: those are handled (once) by the variable override.
  function remapDecls(cssText, map) {
    return cssText
      .split(/;(?![^(]*\))/)
      .map((d) => (d.trim().startsWith('--') ? d : remap(d, map)))
      .join(';');
  }

  // ---- new X web app: colors are CSS variables (--x-bg-primary, --x-fg-secondary, …) ----
  const VAR_NAME = /^--x-(?:bg|fg|border|btn|brand|ring|overlay|toast|tooltip|skeleton|segmented|shadow|black|white|neutral|gray|grey)/;
  let calm = false;
  let soft = false;
  let accent = null; // accent override (hex) or null = X's own accent color
  const varStyle = typeof document !== 'undefined' ? document.createElement('style') : null;
  if (varStyle) varStyle.id = 'quiettl-vars';

  // Read X's own values (with our override switched off).
  function readVars() {
    const was = varStyle.isConnected;
    if (was) varStyle.remove();
    const cs = getComputedStyle(document.documentElement);
    const vars = {};
    for (const name of cs) {
      if (!name.startsWith('--x-') || !VAR_NAME.test(name)) continue;
      const v = cs.getPropertyValue(name).trim();
      if (/#|rgb/.test(v)) vars[name] = v;
    }
    if (was) document.documentElement.appendChild(varStyle);
    return vars;
  }

  function varRamp(vars) {
    const pick = ['--x-bg-primary', '--x-bg-secondary', '--x-bg-tertiary', '--x-fg-secondary', '--x-fg-primary'].map((k) => parseColor(vars[k]));
    return pick.every(Boolean) ? pick.map((p) => p.rgb) : null;
  }

  // "Calm": white primary buttons become quiet surface buttons, colored
  // callouts/badges become neutral.
  const calmVars = (p) => ({
    '--x-btn-primary': p.border,
    '--x-btn-primary-hover': `color-mix(in srgb, ${p.text} 10%, ${p.border})`,
    '--x-btn-primary-pressed': `color-mix(in srgb, ${p.text} 18%, ${p.border})`,
    '--x-fg-subscribe': p.muted,
    '--x-bg-subscribe': p.surface,
    '--x-bg-success': p.surface,
    '--x-bg-info': p.surface,
    '--x-bg-warning': p.surface,
  });

  // Accent override (new app): X's brand color → links, brand buttons, hover tints.
  // Like / repost / etc. have their own colors and stay.
  const brandVars = (a, p) => ({
    '--x-fg-brand': a,
    '--x-btn-brand': a,
    '--x-btn-brand-hover': `color-mix(in srgb, ${a} 82%, ${p.text})`,
    '--x-btn-brand-pressed': `color-mix(in srgb, ${a} 64%, ${p.text})`,
    '--x-brand-subtle': `color-mix(in srgb, ${a} 14%, ${p.bg})`,
    '--x-brand-wash': `color-mix(in srgb, ${a} 58%, transparent)`,
  });

  // Softer text: ease the text color toward the background, so every text
  // variable derived from it (primary, alpha whites, icons) softens together.
  const softened = (pal) => (soft ? { ...pal, text: '#' + lerp(hex(pal.text), hex(pal.bg), 0.14).map((v) => v.toString(16).padStart(2, '0')).join('') } : pal);

  // vars: { '--x-…': value } read from X → declarations with our colors
  function overrides(vars, pal, calm) {
    const ramp = varRamp(vars);
    if (!ramp) return null;
    const p2 = softened(pal);
    const map = makeMapper(p2, ramp);
    const out = {};
    for (const [k, v] of Object.entries(vars)) {
      const nv = /^\d/.test(v) ? remapHsl(v, map) : remap(v, map);
      if (nv !== v) out[k] = nv; // leave X's own (e.g. its brand color) live, not frozen in our sheet
    }
    if (calm) Object.assign(out, calmVars(p2));
    if (accent) Object.assign(out, brandVars(accent, p2));
    return Object.entries(out)
      .map(([k, v]) => `${k}: ${v} !important;`)
      .join('\n  ');
  }

  // shadcn-style HSL tokens ("0 0% 0%") used inside X Chat
  const HSL = /^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/;
  function hslToRgb(h, s, l) {
    s /= 100;
    l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
    return [f(0), f(8), f(4)];
  }
  function rgbToHsl(r, g, b) {
    const h = hue(r, g, b);
    r /= 255;
    g /= 255;
    b /= 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    const d = mx - mn;
    const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    return `${Math.round(h)} ${Math.round(s * 1000) / 10}% ${Math.round(l * 1000) / 10}%`;
  }
  function remapHsl(v, map) {
    const m = HSL.exec(v.trim());
    if (!m) return v;
    const c = map(...hslToRgb(+m[1], +m[2], +m[3]));
    return c ? rgbToHsl(...c) : v;
  }

  // ---- runtime (browser only) ----
  let mapper = null;
  let palette = null;
  let mode = null;
  let ruleCount = -1;
  const origRule = new WeakMap(); // CSSStyleRule → original cssText
  const doneRule = new WeakSet();
  const origEl = new WeakMap(); // Element → [original style text, what we wrote]
  let observer = null;
  let timer = null;

  function detectMode() {
    const m = /(?:^|;\s*)night_mode=(\d)/.exec(document.cookie);
    if (m) return m[1] === '0' ? 'light' : m[1] === '1' ? 'dim' : 'lightsout';
    const body = document.body;
    const saved = body && origEl.get(body);
    const bg = (saved ? saved[0] : body && body.getAttribute('style')) || '';
    const c = /rgba?\(([^)]+)\)/.exec(bg);
    if (c) {
      const [r, g, b] = c[1].split(/[,\s]+/).map(Number);
      const L = lum(r, g, b);
      return L > 0.5 ? 'light' : L < 0.05 ? 'lightsout' : 'dim';
    }
    return 'lightsout';
  }

  function eachRule(list, fn) {
    for (const rule of list) {
      if (rule.style) fn(rule);
      if (rule.cssRules) eachRule(rule.cssRules, fn);
    }
  }

  function sheets() {
    const out = [...document.styleSheets];
    if (document.adoptedStyleSheets) out.push(...document.adoptedStyleSheets);
    return out;
  }

  function processRules(all) {
    let count = 0;
    for (const sh of sheets()) {
      let rules;
      try {
        rules = sh.cssRules; // cross-origin sheets throw
      } catch (_) {
        continue;
      }
      count += rules.length;
      eachRule(rules, (rule) => {
        if (!all && doneRule.has(rule)) return;
        doneRule.add(rule);
        let orig = origRule.get(rule);
        if (orig === undefined) {
          orig = rule.style.cssText;
          if (!orig.includes('rgb')) return;
          origRule.set(rule, orig);
        }
        const next = mapper ? remapDecls(orig, mapper) : orig;
        if (rule.style.cssText !== next) rule.style.cssText = next;
      });
    }
    ruleCount = count;
  }

  function processEl(el) {
    const cur = el.getAttribute('style');
    if (!cur) return;
    let rec = origEl.get(el);
    if (!rec || cur !== rec[1]) {
      // first time, or React rewrote it since
      if (!cur.includes('rgb')) return;
      rec = [cur, cur];
    }
    const next = mapper ? remap(rec[0], mapper) : rec[0];
    rec[1] = next;
    origEl.set(el, rec);
    if (cur !== next) el.setAttribute('style', next);
  }

  function processTree(root) {
    if (root.nodeType !== 1) return;
    if (root.hasAttribute('style')) processEl(root);
    for (const el of root.querySelectorAll('[style*="rgb"]')) processEl(el);
  }

  // Variables only exist once X's stylesheet has loaded; (re)build when they
  // appear or when X switches between light/dark.
  let varsFor = null; // "<data-theme>|<palette json>" the current var CSS was built for
  let ramp = null; // X's own [bg, surface, border, muted, text] from the vars
  const CACHE = 'quiettl-var-css';
  // everything the generated colors depend on (besides X's light/dark mode)
  const sig = () => JSON.stringify(palette) + calm + soft + accent + xDisplayColor();

  function refreshVars() {
    const key = document.documentElement.getAttribute('data-theme') + sig();
    if (key === varsFor) return false;
    const vars = readVars();
    const decl = overrides(vars, palette, calm);
    if (!decl) return false;
    const css = `html[data-xs-theme], html[data-xs-theme] body, html[data-xs-theme] [data-theme] {\n  ${decl}\n}`;
    varsFor = key;
    ramp = varRamp(vars);
    varStyle.textContent = css;
    if (!varStyle.isConnected) document.documentElement.appendChild(varStyle);
    try {
      localStorage.setItem(CACHE, JSON.stringify({ p: sig(), css }));
    } catch (_) {}
    return true;
  }

  // X Chat renders inside a shadow root with its own copy of the variables.
  const shadowStyles = new WeakMap(); // shadowRoot → <style>
  function themeShadows() {
    // Only X Chat uses a shadow root: the chat page or the docked chat window.
    // (Scanning every div of a long feed on each change froze tabs.)
    const dock = document.querySelector('[data-slot="xds-dock-window"]');
    const onChat = location.pathname.startsWith('/i/chat');
    if (!dock && !onChat) return;
    const hosts = [];
    for (const scope of [dock, onChat && document.querySelector('main')]) {
      if (scope) for (const e of scope.querySelectorAll('div')) if (e.shadowRoot) hosts.push(e);
    }
    for (const host of hosts) {
      const sr = host.shadowRoot;
      const rootEl = sr.querySelector('[data-xchat-root], [data-theme]');
      let st = shadowStyles.get(sr);
      if (!palette || !rootEl) {
        if (st) st.textContent = '';
        continue;
      }
      const key = sig() + rootEl.getAttribute('data-theme');
      if (st && st.dataset.key === key && st.isConnected) continue;
      if (!st) {
        st = document.createElement('style');
        shadowStyles.set(sr, st);
      }
      st.textContent = ''; // read X's own values
      const cs = getComputedStyle(rootEl);
      const vars = {};
      for (const name of cs) {
        if (!name.startsWith('--')) continue;
        const v = cs.getPropertyValue(name).trim();
        if ((name.startsWith('--x-') && VAR_NAME.test(name) && /#|rgb/.test(v)) || HSL.test(v)) vars[name] = v;
      }
      const decl = overrides(vars, palette, calm);
      if (!decl) continue;
      st.textContent =
        `:host, [data-xchat-root], [data-theme] {\n  ${decl}\n}` +
        // calm buttons need light text here too (the page stylesheet can't reach in)
        (calm ? `\n.bg-btn-primary { color: var(--x-fg-primary) !important; }` : '');
      st.dataset.key = key;
      if (!st.isConnected) sr.appendChild(st);
    }
  }

  function tick() {
    themeShadows();
    if (!palette) return;
    setButtonAccent(); // X's display color can change any time (Settings → Display)
    const varsChanged = refreshVars();
    const m = detectMode();
    if (varsChanged || m !== mode) {
      mode = m;
      mapper = makeMapper(palette, ramp || mode);
      processRules(true);
      processTree(document.documentElement);
      return;
    }
    let count = 0;
    for (const sh of sheets()) {
      try {
        count += sh.cssRules.length;
      } catch (_) {}
    }
    if (count !== ruleCount) processRules(false);
  }

  let tickQueued = false;
  function tickSoon() {
    if (tickQueued) return;
    tickQueued = true;
    setTimeout(() => {
      tickQueued = false;
      tick();
    }, 250);
  }

  function start() {
    if (observer) return;
    observer = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'attributes') processEl(m.target);
        else for (const n of m.addedNodes) processTree(n);
      }
      tickSoon(); // X changes the page constantly: at most a few checks per second
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'data-theme'] });
    timer = setInterval(tick, 700);
  }

  function stop() {
    if (observer) observer.disconnect();
    observer = null;
    clearInterval(timer);
  }

  // Accent for Post / Follow buttons: the override, else X's own color (your X
  // display color, e.g. purple), else the theme's; plus readable text on it.
  function setButtonAccent() {
    const c = accent || xDisplayColor() || palette.accent;
    const root = document.documentElement;
    if (root.style.getPropertyValue('--qt-accent') === c) return;
    root.style.setProperty('--qt-accent', c);
    const [r, g, b] = hex(c);
    root.style.setProperty('--qt-on-accent', 0.2126 * r + 0.7152 * g + 0.0722 * b > 150 ? '#15171b' : '#ffffff');
  }

  // X's display color setting (Settings → Display), shared by both web apps.
  const X_COLORS = { blue: '#1d9bf0', yellow: '#ffd400', magenta: '#f91880', pink: '#f91880', purple: '#7856ff', orange: '#ff7a00', green: '#00ba7c' };
  function xDisplayColor() {
    try {
      const c = JSON.parse(localStorage.getItem('xweb.display') || 'null');
      const name = c && /^[a-z]+/.exec(String(c.color || ''));
      return (name && X_COLORS[name[0]]) || null;
    } catch (_) {
      return null;
    }
  }

  // Old app, calm: its accent-filled buttons (inline style, already remapped to
  // the accent) become quiet surface buttons, like the new app's.
  const calmBrandStyle = typeof document !== 'undefined' ? document.createElement('style') : null;
  function calmBrand(onoff) {
    if (!calmBrandStyle) return;
    if (!onoff) return calmBrandStyle.remove();
    const [r, g, b] = hex(accent || palette.accent);
    const sel = `:is(a, button, [role='button'])[style*='background-color: rgb(${r}, ${g}, ${b})']`;
    calmBrandStyle.textContent = `html[data-xs-calm] ${sel} { background-color: var(--xs-border) !important; }\nhtml[data-xs-calm] ${sel} :is(span, div) { color: var(--xs-text) !important; }`;
    if (!calmBrandStyle.isConnected) document.documentElement.appendChild(calmBrandStyle);
  }

  // themeSettings: S.theme; on: whether the extension is enabled
  function apply(t, on) {
    const root = document.documentElement;
    const p = !on || t.preset === 'off' ? null : t.preset === 'custom' ? t.custom : PRESETS[t.preset];
    const wasOn = !!palette;
    palette = p || null;
    calm = !!t.calm;
    soft = !!t.softText;
    accent = palette ? (t.accentMode === 'theme' ? palette.accent : t.accentMode === 'custom' ? t.accentColor : null) : null;
    calmBrand(palette && calm);
    mode = detectMode();
    varsFor = null;
    if (palette) {
      root.dataset.xsTheme = '1';
      for (const k of KEYS) root.style.setProperty(`--xs-${k}`, palette[k]);
      root.style.setProperty('--xs-accent', accent || palette.accent);
      setButtonAccent();
      // Use the last generated variable CSS right away to avoid a flash of X's colors.
      try {
        const c = JSON.parse(localStorage.getItem(CACHE) || 'null');
        if (c && c.p === sig()) {
          varStyle.textContent = c.css;
          if (!varStyle.isConnected) root.appendChild(varStyle);
        }
      } catch (_) {}
      refreshVars();
      mapper = makeMapper(palette, ramp || mode);
      start();
    } else {
      delete root.dataset.xsTheme;
      varStyle.remove();
      mapper = null;
      stop();
    }
    if (palette || wasOn) {
      processRules(true);
      processTree(root);
    }
    root.dataset.xsFont = on ? t.font : 'default';
    themeShadows();
    if (palette && calm) root.dataset.xsCalm = '';
    else delete root.dataset.xsCalm;
    if (on && t.softText) root.dataset.xsSoft = '';
    else delete root.dataset.xsSoft;
  }

  XS.theme = { apply, PRESETS, makeMapper, remap, parseColor };
})((globalThis.XS = globalThis.XS || {}));
