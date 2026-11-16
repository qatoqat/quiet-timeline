import type { Palette } from '../shared/types';
import { ends, HSL, hex, lerp, makeMapper, onAccent, parseColor, remap, remapHsl, type Rgb } from './color';

type Vars = Record<string, string>;

// New X web app: colors are CSS variables (--x-bg-primary, --x-fg-secondary, …).
const VAR_NAME = /^--x-(?:bg|fg|border|btn|brand|ring|overlay|toast|tooltip|skeleton|segmented|shadow|black|white|neutral|gray|grey)/;
export const CACHE = 'quiettl-var-css';

export const ts = {
  palette: null as Palette | null,
  calm: false,
  soft: false,
  accent: null as string | null, // override (hex) or null = X's own accent color
  varsFor: null as string | null, // "<data-theme>" + sig() the current var CSS was built for
  ramp: null as Rgb[] | null, // X's own [bg, surface, border, muted, text] from the vars
};

export const styleEl = (id: string) => Object.assign(document.createElement('style'), { id });
export function putStyle(el: HTMLStyleElement, css: string, parent: Node = document.documentElement): void {
  el.textContent = css;
  if (!el.isConnected) parent.appendChild(el);
}

export const varStyle = styleEl('quiettl-vars');

function colorVars(el: Element, hsl = false): Vars {
  const cs = getComputedStyle(el);
  const vars: Vars = {};
  for (const name of cs) {
    const v = cs.getPropertyValue(name).trim();
    if ((VAR_NAME.test(name) && /#|rgb/.test(v)) || (hsl && name.startsWith('--') && HSL.test(v))) vars[name] = v;
  }
  return vars;
}

// X's own values, with our override switched off.
function readVars(): Vars {
  const was = varStyle.isConnected;
  if (was) varStyle.remove();
  const vars = colorVars(document.documentElement);
  if (was) document.documentElement.appendChild(varStyle);
  return vars;
}

function varRamp(vars: Vars): Rgb[] | null {
  const pick = ['--x-bg-primary', '--x-bg-secondary', '--x-bg-tertiary', '--x-fg-secondary', '--x-fg-primary'].map((k) => parseColor(vars[k]));
  return pick.every(Boolean) ? pick.map((p) => p!.rgb) : null;
}

// "Calm": white primary buttons become quiet surface buttons, colored callouts/badges become neutral.
const calmVars = (p: Palette): Vars => ({
  '--x-btn-primary': p.border,
  '--x-btn-primary-hover': `color-mix(in srgb, ${p.text} 10%, ${p.border})`,
  '--x-btn-primary-pressed': `color-mix(in srgb, ${p.text} 18%, ${p.border})`,
  '--x-fg-subscribe': p.muted,
  '--x-bg-subscribe': p.surface,
  '--x-bg-success': p.surface,
  '--x-bg-info': p.surface,
  '--x-bg-warning': p.surface,
});

// Like / repost / etc. have their own colors and stay.
const brandVars = (a: string, p: Palette): Vars => ({
  '--x-fg-brand': a,
  '--x-btn-brand': a,
  '--x-btn-brand-hover': `color-mix(in srgb, ${a} 82%, ${p.text})`,
  '--x-btn-brand-pressed': `color-mix(in srgb, ${a} 64%, ${p.text})`,
  '--x-brand-subtle': `color-mix(in srgb, ${a} 14%, ${p.bg})`,
  '--x-brand-wash': `color-mix(in srgb, ${a} 58%, transparent)`,
});

// Easing the text color toward the bg softens every text variable derived from it (primary, alpha whites, icons).
export const softened = (pal: Palette): Palette =>
  ts.soft ? { ...pal, text: '#' + lerp(hex(pal.text), hex(pal.bg), 0.14).map((v) => v.toString(16).padStart(2, '0')).join('') } : pal;

// X's named whites and blacks, the text it puts on its scrims (on-color: a video's play button and time, a
// toast; white in both its modes) and a toast's fill (#2229 in both): strong ones are fixed colors (text and
// scrims on photos), so they become the light / dark end of our palette whatever X's own mode is; faint
// ones (under 15%) tint hovers and follow the page like any other grey.
const FIXED = /^--x-(white|black|fg-on-color|toast-bg)(?:-(\d+))?$/;
const DARK = new Set(['black', 'toast-bg']);

export function overrides(vars: Vars, pal: Palette, calm: boolean): string | null {
  const ramp = varRamp(vars);
  if (!ramp) return null;
  const p2 = softened(pal);
  const map = makeMapper(p2, ramp, ts.accent, calm);
  const [dark, light] = ends(p2);
  const out: Vars = {};
  for (const [k, v] of Object.entries(vars)) {
    const f = FIXED.exec(k);
    const fixed = f && !(f[2] && +f[2] < 15) ? (DARK.has(f[1]) ? dark : light) : null;
    const nv = fixed ? remap(v, () => fixed) : /^\d/.test(v) ? remapHsl(v, map) : remap(v, map);
    if (nv !== v) out[k] = nv; // leave X's own (e.g. its brand color) live, not frozen in our sheet
  }
  if (calm) Object.assign(out, calmVars(p2));
  if (ts.accent) Object.assign(out, brandVars(ts.accent, p2));
  // text on a brand fill: X's own (white, black on its yellow, orange and green), or as on our accent buttons
  if (vars['--x-fg-on-brand']) out['--x-fg-on-brand'] = ts.accent ? 'var(--qt-on-accent)' : vars['--x-fg-on-brand'];
  return Object.entries(out)
    .map(([k, v]) => `${k}: ${v} !important;`)
    .join('\n  ');
}

// Everything the generated colors depend on besides X's light/dark mode.
export const sig = (): string => JSON.stringify(ts.palette) + ts.calm + ts.soft + ts.accent + xDisplayColor();

// Variables only exist once X's stylesheet has loaded; (re)build when they appear or X switches light/dark.
export function refreshVars(): boolean {
  const key = document.documentElement.getAttribute('data-theme') + sig();
  if (key === ts.varsFor) return false;
  const vars = readVars();
  const decl = overrides(vars, ts.palette!, ts.calm);
  if (!decl) return false;
  const css = `html[data-xs-theme], html[data-xs-theme] body, html[data-xs-theme] [data-theme] {\n  ${decl}\n}`;
  ts.varsFor = key;
  ts.ramp = varRamp(vars);
  putStyle(varStyle, css);
  try {
    localStorage.setItem(CACHE, JSON.stringify({ p: sig(), css }));
  } catch (_) {}
  return true;
}

// X Chat renders inside a shadow root with its own copy of the variables.
const shadowStyles = new WeakMap<ShadowRoot, HTMLStyleElement>();
export function themeShadows(): void {
  // Only the chat page or a docked window use a shadow root (scanning every div of a long feed froze tabs).
  const docks = [...document.querySelectorAll('[data-slot="xds-dock-window"]')];
  const onChat = location.pathname.startsWith('/i/chat');
  if (!docks.length && !onChat) return;
  const hosts: Element[] = [];
  for (const scope of [...docks, onChat && document.querySelector('main')]) {
    if (scope) for (const e of scope.querySelectorAll('div')) if (e.shadowRoot) hosts.push(e);
  }
  for (const host of hosts) {
    const sr = host.shadowRoot!;
    const rootEl = sr.querySelector('[data-xchat-root], [data-theme]');
    let st = shadowStyles.get(sr);
    if (!ts.palette || !rootEl) {
      if (st) {
        st.textContent = '';
        delete st.dataset.key;
      }
      continue;
    }
    const key = sig() + rootEl.getAttribute('data-theme');
    if (st && st.dataset.key === key && st.isConnected) continue;
    if (!st) {
      st = document.createElement('style');
      shadowStyles.set(sr, st);
    }
    st.textContent = ''; // read X's own values
    const decl = overrides(colorVars(rootEl, true), ts.palette, ts.calm);
    if (!decl) continue;
    putStyle(
      st,
      `:host, [data-xchat-root], [data-theme] {\n  ${decl}\n}` +
        // the page stylesheet can't reach in, so calm buttons need their light text here too
        (ts.calm ? `\n.bg-btn-primary { color: var(--x-fg-primary) !important; }` : ''),
      sr,
    );
    st.dataset.key = key;
  }
}

// The accent on the page: the override, else X's own (its display color, e.g. purple; blue by default).
export const pageAccent = (): string => ts.accent || xDisplayColor() || '#1d9bf0';

// Post / Follow buttons in the accent, with readable text on it.
export function setButtonAccent(): void {
  const c = pageAccent();
  const root = document.documentElement;
  if (root.style.getPropertyValue('--qt-accent') === c) return;
  root.style.setProperty('--qt-accent', c);
  root.style.setProperty('--qt-on-accent', onAccent(c));
}

// X's display color setting (Settings → Display), shared by both web apps.
const X_COLORS: Record<string, string> = {
  blue: '#1d9bf0',
  yellow: '#ffd400',
  magenta: '#f91880',
  pink: '#f91880',
  purple: '#7856ff',
  orange: '#ff7a00',
  green: '#00ba7c',
};
export function xDisplayColor(): string | null {
  try {
    const c = JSON.parse(localStorage.getItem('xweb.display') || 'null');
    const name = c && /^[a-z]+/.exec(String(c.color || ''));
    return (name && X_COLORS[name[0]]) || null;
  } catch (_) {
    return null;
  }
}

// Old app, calm: its accent-filled buttons (inline style, already remapped to the accent) become quiet surface buttons.
const calmBrandStyle = styleEl('quiettl-calm');
export function calmBrand(onoff: boolean): void {
  if (!onoff) return calmBrandStyle.remove();
  const [r, g, b] = hex(pageAccent());
  const sel = `:is(a, button, [role='button'])[style*='background-color: rgb(${r}, ${g}, ${b})']`;
  putStyle(calmBrandStyle, `html[data-xs-calm] ${sel} { background-color: var(--xs-border) !important; }\nhtml[data-xs-calm] ${sel} :is(span, div) { color: var(--xs-text) !important; }`);
}
