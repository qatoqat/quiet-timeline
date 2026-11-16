import type { Settings } from '../shared/defaults';
import { KEYS, PRESETS, lum, makeMapper, onMedia, parseColor, remapDecls, type Mapper } from './color';
import { CACHE, calmBrand, pageAccent, putStyle, refreshVars, setButtonAccent, sig, softened, styleEl, themeShadows, ts, varStyle } from './vars';

let mapper: Mapper | null = null;
let mediaMap: Mapper | null = null; // on photos and videos, when it differs (color.ts onMedia)
let mode: string | null = null;
let ruleCount = -1;
const origRule = new WeakMap<CSSStyleRule, string>();
const doneRule = new WeakSet<CSSRule>();
const origEl = new WeakMap<Element, [orig: string, written: string]>();
let observer: MutationObserver | null = null;
let timer: ReturnType<typeof setInterval> | undefined;

function detectMode(): string {
  const m = /(?:^|;\s*)night_mode=(\d)/.exec(document.cookie);
  if (m) return m[1] === '0' ? 'light' : m[1] === '1' ? 'dim' : 'lightsout';
  const body = document.body;
  const saved = body && origEl.get(body);
  const bg = (saved ? saved[0] : body && body.getAttribute('style')) || '';
  const c = parseColor(bg);
  if (c) {
    const L = lum(...c.rgb);
    return L > 0.5 ? 'light' : L < 0.05 ? 'lightsout' : 'dim';
  }
  return 'lightsout';
}

function eachRule(list: CSSRuleList, fn: (rule: CSSStyleRule) => void): void {
  for (const rule of list) {
    const r = rule as CSSStyleRule & CSSGroupingRule;
    if (r.style) fn(r);
    if (r.cssRules) eachRule(r.cssRules, fn);
  }
}

function ruleLists(): CSSRuleList[] {
  return [...document.styleSheets, ...(document.adoptedStyleSheets || [])].flatMap((sh) => {
    if ((sh.ownerNode as Element | null)?.id?.startsWith('quiettl-')) return []; // ours: theme colors already
    try {
      return [sh.cssRules];
    } catch (_) {
      return []; // cross-origin sheets throw
    }
  });
}

// Old app: X's classes are shared with the rest of the page, so the ones with whites and blacks get copies
// that apply on media only: photos and videos, a link card's image, the Explore hero (and its ⋯ button
// beside it), the arrows over a carousel.
const ON_MEDIA =
  "[data-testid='tweetPhoto'], [data-testid='videoPlayer'], [data-testid='card.layoutLarge.media'], [data-testid='eventHero'], [data-testid='eventHero'] + div, [data-testid^='ScrollSnap-'][data-testid$='ButtonWrapper']";
const mediaStyle = styleEl('quiettl-media');
const mediaRules = new Map<CSSStyleRule, string>();

function mediaCopy(rule: CSSStyleRule, orig: string, page: string): void {
  if (rule.parentRule || !/^\.r-[\w-]+$/.test(rule.selectorText)) return; // X's atomic classes only
  const ours = page.split(';');
  const decls = remapDecls(orig, mediaMap!).split(';').filter((d, i) => d !== ours[i]);
  if (decls.length) mediaRules.set(rule, `:is(${ON_MEDIA}) ${rule.selectorText} {${decls.join(';')}; }`);
}

function processRules(all: boolean): void {
  let count = 0;
  const copies = mediaRules.size;
  for (const rules of ruleLists()) {
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
      if (mediaMap) mediaCopy(rule, orig, next);
    });
  }
  ruleCount = count;
  if (mediaRules.size !== copies) putStyle(mediaStyle, [...mediaRules.values()].join('\n'));
}

// A copy of one of X's elements (e.g. our button made from X's bookmark button): its inline colors are
// already ours, so hand over X's originals too, or the copy is recolored a second time.
export function cloneThemed<T extends Element>(src: T): T {
  const copy = src.cloneNode(true) as T;
  const from = [src, ...src.querySelectorAll('*')];
  const to = [copy, ...copy.querySelectorAll('*')];
  from.forEach((el, i) => {
    const rec = origEl.get(el);
    if (rec) origEl.set(to[i], [rec[0], rec[1]]);
  });
  return copy;
}

function processEl(el: Element): void {
  const cur = el.getAttribute('style');
  if (!cur) return;
  let rec = origEl.get(el);
  if (!rec || cur !== rec[1]) {
    // first time, or React rewrote it since
    if (!cur.includes('rgb')) return;
    rec = [cur, cur];
  }
  // per declaration, never our own variables (--xs-*, --qt-* on <html>), which are theme colors already
  const map = mediaMap && el.closest(ON_MEDIA) ? mediaMap : mapper;
  let next = map ? remapDecls(rec[0], map, /^--(xs|qt)-/) : rec[0];
  if (map && rec[0].includes('--article-tone')) next = articleText(el, next);
  rec[1] = next;
  origEl.set(el, rec);
  if (cur !== next) el.setAttribute('style', next);
}

// X's Article cards: X picks white or black text for its own cover tone, and the tone is themed here, so it
// can turn light or dark; the text is picked again (--x-white / --x-black are our light / dark ends)
function articleText(el: Element, css: string): string {
  const dark = !!el.closest('[data-theme="dark"]'); // (X's dark: variant)
  const tone = parseColor(new RegExp(`--article-tone${dark ? '-dark' : ''}:\\s*([^;]+)`).exec(css)?.[1]);
  return tone ? `${css.replace(/;?\s*$/, '')}; color: var(--x-${lum(...tone.rgb) > 0.5 ? 'black' : 'white'});` : css;
}

function processTree(root: Node): void {
  if (root.nodeType !== 1) return;
  const el = root as Element;
  if (el.hasAttribute('style')) processEl(el);
  for (const e of el.querySelectorAll('[style*="rgb"]')) processEl(e);
}

function repaint(): void {
  const pal = ts.palette && softened(ts.palette);
  mapper = pal ? makeMapper(pal, ts.ramp || mode!, ts.accent, ts.calm) : null;
  mediaMap = pal && mapper ? onMedia(mapper, pal, ts.ramp || mode!) : null;
  mediaRules.clear();
  mediaStyle.remove();
  processRules(true);
  processTree(document.documentElement);
}

function tick(): void {
  themeShadows();
  if (!ts.palette) return;
  setButtonAccent(); // X's display color can change any time (Settings → Display)
  const varsChanged = refreshVars();
  const m = detectMode();
  if (varsChanged || m !== mode) {
    mode = m;
    repaint();
    return;
  }
  if (ruleLists().reduce((n, l) => n + l.length, 0) !== ruleCount) processRules(false);
}

let tickQueued = false;
function tickSoon(): void {
  if (tickQueued) return;
  tickQueued = true;
  setTimeout(() => {
    tickQueued = false;
    tick();
  }, 250);
}

function start(): void {
  if (observer) return;
  observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'attributes') processEl(m.target as Element);
      else for (const n of m.addedNodes) processTree(n);
    }
    tickSoon(); // X changes the page constantly: at most a few checks per second
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'data-theme'] });
  timer = setInterval(tick, 700);
}

function stop(): void {
  if (observer) observer.disconnect();
  observer = null;
  clearInterval(timer);
}

export function applyTheme(t: Settings['theme'], on: boolean): void {
  const root = document.documentElement;
  const p = !on || t.preset === 'off' ? null : t.preset === 'custom' ? t.custom : PRESETS[t.preset];
  const wasOn = !!ts.palette;
  ts.palette = p || null;
  ts.calm = !!t.calm;
  ts.soft = !!t.softText;
  ts.accent = ts.palette ? (t.accentMode === 'theme' ? ts.palette.accent : t.accentMode === 'custom' ? t.accentColor : null) : null;
  calmBrand(!!(ts.palette && ts.calm));
  mode = detectMode();
  ts.varsFor = null;
  root.toggleAttribute('data-xs-theme', !!ts.palette);
  if (ts.palette) {
    for (const k of KEYS) root.style.setProperty(`--xs-${k}`, ts.palette[k]);
    root.style.setProperty('--xs-accent', pageAccent());
    setButtonAccent();
    // Use the last generated variable CSS right away to avoid a flash of X's colors.
    try {
      const c = JSON.parse(localStorage.getItem(CACHE) || 'null');
      if (c && c.p === sig()) putStyle(varStyle, c.css);
    } catch (_) {}
    refreshVars();
    start();
  } else {
    varStyle.remove();
    stop();
    for (const k of [...KEYS, 'accent']) root.style.removeProperty(`--xs-${k}`); // no theme: X's own colors
  }
  if (ts.palette || wasOn) repaint();
  root.dataset.xsFont = on ? t.font : 'default';
  themeShadows();
  root.toggleAttribute('data-xs-calm', !!(ts.palette && ts.calm));
  root.toggleAttribute('data-xs-soft', on && t.softText);
}
