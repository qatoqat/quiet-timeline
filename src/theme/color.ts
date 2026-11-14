import type { Palette } from '../shared/types';

export type Rgb = [number, number, number];
export type Mapper = (r: number, g: number, b: number) => Rgb | null;

// X's class names are hashed and change between deploys, but its colors are a small fixed palette: every grey is
// placed on X's own bg→text ramp and moved to the same spot on ours; X's accent blue becomes our accent.
export const PRESETS: Record<string, Palette> = {
  quiettl: { bg: '#15171b', surface: '#1d2026', border: '#2c3038', muted: '#8b919c', text: '#e3e5e9', accent: '#4c8bf5' },
  graphite: { bg: '#121316', surface: '#1b1d22', border: '#2c2f36', muted: '#8a909a', text: '#e4e6ea', accent: '#4c8bf5' },
  nord: { bg: '#2e3440', surface: '#353c4a', border: '#434c5e', muted: '#9aa5b8', text: '#eceff4', accent: '#5e81ac' },
  gruvbox: { bg: '#1d2021', surface: '#282828', border: '#3c3836', muted: '#a89984', text: '#ebdbb2', accent: '#458588' },
  mocha: { bg: '#1e1e2e', surface: '#262637', border: '#45475a', muted: '#a6adc8', text: '#cdd6f4', accent: '#8b6fe0' },
  oled: { bg: '#000000', surface: '#0c0c0e', border: '#222226', muted: '#80848c', text: '#d6d8dc', accent: '#3a7bd5' },
  paper: { bg: '#f6f3ee', surface: '#ece7df', border: '#ddd5c8', muted: '#6f675d', text: '#2b2722', accent: '#b0522c' },
};

// X's own ramps: bg, surface, border, muted text, text.
export const SOURCES: Record<string, Rgb[]> = {
  lightsout: [[0, 0, 0], [22, 24, 28], [47, 51, 54], [113, 118, 123], [231, 233, 234]],
  dim: [[21, 32, 43], [30, 39, 50], [56, 68, 77], [139, 152, 165], [247, 249, 249]],
  light: [[255, 255, 255], [247, 249, 249], [239, 243, 244], [83, 100, 113], [15, 20, 25]],
};
export const KEYS = ['bg', 'surface', 'border', 'muted', 'text'] as const;

export const lum = (r: number, g: number, b: number): number => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
export const lerp = (a: Rgb, b: Rgb, t: number): Rgb => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as Rgb;
export const hex = (h: string): Rgb => (parseColor(h) || { rgb: [0, 0, 0] as Rgb }).rgb;
export function hue(r: number, g: number, b: number): number {
  const mx = Math.max(r, g, b);
  const d = mx - Math.min(r, g, b);
  if (!d) return 0;
  let h = mx === r ? (g - b) / d : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

// mode: a SOURCES key, or an explicit [bg, surface, border, muted, text] ramp. accent: replaces X's blue
// (none: X's own accent stays).
export function makeMapper(palette: Palette, mode: string | Rgb[], accent?: string | null): Mapper {
  const src = Array.isArray(mode) ? mode : SOURCES[mode] || SOURCES.lightsout;
  const dir = lum(...src[4]) > lum(...src[0]) ? 1 : -1;
  const A = src.map((c) => lum(...c) * dir);
  const dst = KEYS.map((k) => hex(palette[k]));
  const acc = accent ? hex(accent) : null;
  return function (r, g, b) {
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (chroma >= 90) {
      const h = hue(r, g, b);
      return acc && h >= 195 && h <= 215 ? acc : null;
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
export function parseColor(s: unknown): { rgb: Rgb; a?: string } | null {
  COLOR.lastIndex = 0;
  const m = COLOR.exec(String(s));
  if (!m) return null;
  if (m[5] === undefined) return { rgb: [+m[1], +m[2], +m[3]], a: m[4] };
  let h = m[5];
  if (h.length <= 4) h = h.replace(/./g, '$&$&');
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return { rgb: [n(0), n(2), n(4)], a: h.length === 8 ? String(+(n(6) / 255).toFixed(3)) : undefined };
}
export function remap(css: string, map: Mapper): string {
  return css.replace(COLOR, (all) => {
    const p = parseColor(all);
    const c = p && map(...p.rgb);
    if (!p || !c) return all;
    return p.a === undefined ? `rgb(${c[0]}, ${c[1]}, ${c[2]})` : `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${p.a})`;
  });
}

// Declarations whose name matches `keep` are left alone. Stylesheets keep every custom property (the
// variable override handles X's, once); inline styles only ours, so X's per-element color variables
// (e.g. an article card's --article-tone) are themed too.
export function remapDecls(cssText: string, map: Mapper, keep = /^--/): string {
  return cssText
    .split(/;(?![^(]*\))/)
    .map((d) => (keep.test(d.trim()) ? d : remap(d, map)))
    .join(';');
}

// shadcn-style HSL tokens ("0 0% 0%") used inside X Chat
export const HSL = /^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/;
export function hslToRgb(h: number, s: number, l: number): Rgb {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return [f(0), f(8), f(4)];
}
export function rgbToHsl(r: number, g: number, b: number): string {
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
export function remapHsl(v: string, map: Mapper): string {
  const m = HSL.exec(v.trim());
  if (!m) return v;
  const c = map(...hslToRgb(+m[1], +m[2], +m[3]));
  return c ? rgbToHsl(...c) : v;
}
