import type { Settings } from '../shared/defaults';
import { KEYS, PRESETS, lum, makeMapper, remap, remapDecls, type Mapper } from './color';
import { CACHE, calmBrand, refreshVars, setButtonAccent, sig, themeShadows, ts, varStyle } from './vars';

export { PRESETS, makeMapper, remap, parseColor } from './color';

let mapper: Mapper | null = null;
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
  const c = /rgba?\(([^)]+)\)/.exec(bg);
  if (c) {
    const [r, g, b] = c[1].split(/[,\s]+/).map(Number);
    const L = lum(r, g, b);
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

function sheets(): CSSStyleSheet[] {
  const out = [...document.styleSheets];
  if (document.adoptedStyleSheets) out.push(...document.adoptedStyleSheets);
  return out;
}

function processRules(all: boolean): void {
  let count = 0;
  for (const sh of sheets()) {
    let rules: CSSRuleList;
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

function processEl(el: Element): void {
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

function processTree(root: Node): void {
  if (root.nodeType !== 1) return;
  const el = root as Element;
  if (el.hasAttribute('style')) processEl(el);
  for (const e of el.querySelectorAll('[style*="rgb"]')) processEl(e);
}

function tick(): void {
  themeShadows();
  if (!ts.palette) return;
  setButtonAccent(); // X's display color can change any time (Settings → Display)
  const varsChanged = refreshVars();
  const m = detectMode();
  if (varsChanged || m !== mode) {
    mode = m;
    mapper = makeMapper(ts.palette, ts.ramp || mode, ts.accent);
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

// on: whether the extension is enabled
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
  if (ts.palette) {
    root.dataset.xsTheme = '1';
    for (const k of KEYS) root.style.setProperty(`--xs-${k}`, ts.palette[k]);
    root.style.setProperty('--xs-accent', ts.accent || ts.palette.accent);
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
    mapper = makeMapper(ts.palette, ts.ramp || mode, ts.accent);
    start();
  } else {
    delete root.dataset.xsTheme;
    varStyle.remove();
    mapper = null;
    stop();
  }
  if (ts.palette || wasOn) {
    processRules(true);
    processTree(root);
  }
  root.dataset.xsFont = on ? t.font : 'default';
  themeShadows();
  if (ts.palette && ts.calm) root.dataset.xsCalm = '';
  else delete root.dataset.xsCalm;
  if (on && t.softText) root.dataset.xsSoft = '';
  else delete root.dataset.xsSoft;
}
