#!/usr/bin/env bun
// End-to-end checks against live X in the dev browser: each setting's visible effect, as its label
// in the settings panel promises, on and off, for whichever X web app the tab runs.
//
//   bun tools/check.ts                 the stored settings, in the home tab (dev profile, port 9333)
//   bun tools/check.ts --old           switch the tab to X's old app first
//   bun tools/check.ts --url /elonmusk/status/123   open a page first
//   bun tools/check.ts --matrix        every panel control set to each other value, one at a time,
//                                      from the defaults and from "all switches on" (catches one
//                                      setting depending on another); stored settings restored after
//       --only <text>                  just the variants whose name contains <text>
//   CDP_PORT=9334 bun tools/check.ts   logged-out profile (new app)
//
// A check passes, fails, or is skipped (nothing on the page to check it against). Exit 1 if any failed.
import { readFileSync } from 'node:fs';
import { ACTIONS, DEFAULTS, MASK, MEDIA, NAV_ITEMS } from '../src/shared/defaults';
import { PRESETS } from '../src/theme/color';
import { kit, offChecks } from './checks/kit';
import { pageChecks } from './checks/page';
import { postChecks } from './checks/posts';
import { evaluate, extContext, sleep, xTab } from './lib';

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const matrix = flag('--matrix');
const c = await xTab(/x\.com\/home/);
const ev = (js: string, ctx?: number) => evaluate(c, js, ctx);

if (flag('--old')) {
  await c.send('Page.navigate', { url: 'https://x.com/i/topics' });
  await sleep(7000);
  const r = await ev(`(() => { if (![...document.scripts].some((s) => /responsive-web/.test(s.src))) return false; history.pushState({}, '', ${JSON.stringify(opt('--url') || '/home')}); dispatchEvent(new PopStateEvent('popstate')); return true; })()`);
  if (!r) console.log('note: X served the new app even on /i/topics');
  await sleep(6000);
} else if (opt('--url')) {
  await c.send('Page.navigate', { url: `https://x.com${opt('--url')}` });
  await sleep(9000);
}
// let lazily rendered posts and the extension settle: wait for action bars, scroll a little
await ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 40 && !document.querySelector('article [role="group"] :is([data-testid="bookmark"], [data-engagement-action="bookmark"])') && document.querySelector('article'); i++) await wait(250);
  for (let i = 0; i < 3; i++) { scrollBy(0, 900); await wait(700); }
  scrollTo(0, 0);
  await wait(1500);
})()`);

const ctx = await extContext(c).catch(() => null);
if (!ctx) {
  console.log('FAIL  extension loaded — Quiet Timeline content script not found');
  process.exit(1);
}

type Result = [name: string, status: string, detail: string];
// Show on hover: :hover can't be made by a page script, and a hidden tab drops pointer events, so
// DevTools forces :hover on the media and its ancestors (as a pointer over it would)
async function hoverCheck(S: any): Promise<Result[]> {
  if (!S.enabled) return [];
  const sel = '[data-xs-media="blur"] :is(img[src*="pbs.twimg.com/media/"], video, [data-testid="tweetPhoto"], [data-testid="videoPlayer"])';
  const found = await ev(`(async () => {
    const find = () => [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.getBoundingClientRect().width > 60);
    let m = find();
    for (let i = 0; i < 15 && !m; i++) {
      scrollBy(0, 900); // the feed only keeps posts near the screen: look further down
      await new Promise((r) => setTimeout(r, 700));
      m = find();
    }
    if (!m) return false;
    m.setAttribute('data-qt-probe', '');
    for (let e = m; e && e !== document.body; e = e.parentElement) e.setAttribute('data-qt-hover', '');
    return true;
  })()`);
  const name = S.mediaHover ? 'blurred media shows on hover' : 'blurred media stays blurred on hover';
  if (!found) return [[name, 'skip', 'no blurred media on the page']];
  const filter = () => ev(`getComputedStyle(document.querySelector('[data-qt-probe]')).filter`);
  await c.send('DOM.enable');
  await c.send('CSS.enable');
  const { root } = await c.send('DOM.getDocument', { depth: 0 });
  const { nodeIds } = await c.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '[data-qt-hover]' });
  const force = (on: boolean) => Promise.all(nodeIds.map((nodeId: number) => c.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: on ? ['hover'] : [] })));
  await force(true);
  const over = await filter();
  await force(false);
  const away = await filter();
  await ev(`(document.querySelectorAll('[data-qt-hover], [data-qt-probe]').forEach((e) => e.removeAttribute('data-qt-hover') || e.removeAttribute('data-qt-probe')), scrollTo(0, 0), 1)`);
  const ok = (S.mediaHover ? over === 'none' : over !== 'none') && away !== 'none';
  return [[name, ok ? 'pass' : 'fail', `over: ${over.slice(0, 32)} · away: ${away.slice(0, 32)}`]];
}
const run = async (S: any, deep: boolean): Promise<Result[]> =>
  [...(await ev(`(async () => {
    const K = (${kit})(${JSON.stringify(S)}, ${JSON.stringify(NAV_ITEMS)}, ${JSON.stringify(S.theme.preset === 'off' ? null : S.theme.preset === 'custom' ? S.theme.custom : PRESETS[S.theme.preset])});
    if (!K.S.enabled) (${offChecks})(K);
    else { await (${postChecks})(K, ${deep}); await (${pageChecks})(K, ${deep}); }
    return [['app', 'info', (K.OLD ? 'old' : 'new') + ' app at ' + location.pathname], ...K.out];
  })()`)), ...(await hoverCheck(S))];
const print = (rs: Result[], quiet = false) => {
  for (const [name, status, detail] of rs) {
    if (quiet && status !== 'fail') continue;
    const tag = ({ pass: 'pass', fail: 'FAIL', skip: 'skip', info: '    ' } as Record<string, string>)[status]!;
    console.log(`${quiet ? '   ' : ''}${tag.padEnd(5)} ${name}${detail ? `  — ${detail}` : ''}`);
  }
  return rs.filter((r) => r[1] === 'fail').length;
};

if (!matrix) {
  setTimeout(() => { console.error('timed out'); process.exit(2); }, 120000).unref();
  const failed = print(await run(await ev('XS._debug.settings', ctx), true));
  c.close();
  process.exit(failed ? 1 : 0);
}

// --- matrix ---
type Variant = { name: string; S: any };
const get = (o: any, path: string) => path.split('.').reduce((x, k) => x?.[k], o);
const withValue = (o: any, path: string, v: unknown) => {
  const out = structuredClone(o);
  const keys = path.split('.');
  const last = keys.pop()!;
  keys.reduce((x, k) => x[k], out)[last] = v;
  return out;
};
// the panel's controls and the values each can take
function controls(): { path: string; values: unknown[] }[] {
  const html = readFileSync(new URL('../popup/popup.html', import.meta.url), 'utf8');
  const attr = (a: string, n: string) => new RegExp(`${n}="([^"]*)"`).exec(a)?.[1];
  const out: { path: string; values: unknown[] }[] = [];
  for (const [, a, body] of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
    const cls = attr(a, 'class') || '';
    const listed = [...body.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);
    const opts = listed.length ? listed : cls.includes('media') ? MEDIA : cls.includes('mask') ? [ACTIONS[0], MASK, ...ACTIONS.slice(1)] : ACTIONS;
    out.push({ path: attr(a, 'data-path')!, values: listed.length ? listed : (opts as [string, string][]).map(([v]) => v) });
  }
  for (const [, a] of html.matchAll(/<input\b([^>]*)>/g)) {
    const path = attr(a, 'data-path');
    const type = attr(a, 'type');
    if (!path) continue;
    if (type === 'checkbox') out.push({ path, values: [true, false] });
    else if (type === 'number') out.push({ path, values: [Number(attr(a, 'min') || 0)] });
  }
  for (const [k] of NAV_ITEMS) out.push({ path: `nav.${k}`, values: [true, false] });
  return out;
}
const ctl = controls();
const switches = ctl.filter((x) => x.values[0] === true && x.path !== 'enabled').map((x) => x.path);
const allOn = switches.reduce((s, p) => withValue(s, p, true), structuredClone(DEFAULTS));
const variants: Variant[] = [{ name: 'defaults', S: DEFAULTS }];
for (const { path, values } of ctl) for (const v of values) if (v !== get(DEFAULTS, path)) variants.push({ name: `${path} = ${v}`, S: withValue(DEFAULTS, path, v) });
variants.push({ name: 'all switches on', S: allOn });
for (const p of switches) variants.push({ name: `all on, ${p} = false`, S: withValue(allOn, p, false) });
const only = opt('--only');
const todo = variants.filter((v, i) => !only || i === 0 || v.name.includes(only));

const stored = await ev(`new Promise((r) => chrome.storage.sync.get('settings', (x) => r(x.settings ?? null)))`, ctx);
let restored = false;
const restore = async () => {
  if (restored) return;
  restored = true;
  await ev(stored ? `chrome.storage.sync.set({ settings: ${JSON.stringify(stored)} })` : `chrome.storage.sync.remove('settings')`, ctx);
  console.log('stored settings restored');
};
const bail = async (msg: string) => {
  console.error(msg);
  await restore().catch(() => console.error('COULD NOT RESTORE SETTINGS — saved copy:', JSON.stringify(stored)));
  process.exit(2);
};
process.on('SIGINT', () => bail('interrupted'));
setTimeout(() => bail('timed out'), todo.length * 15000 + 60000).unref();

console.log(`${todo.length} variants`);
let failed = 0;
const failing: string[] = [];
try {
  for (const v of todo) {
    await ev(`chrome.storage.sync.set({ settings: ${JSON.stringify(v.S)} })`, ctx);
    const want = JSON.stringify(JSON.stringify(v.S));
    for (let i = 0; i < 40 && !(await ev(`JSON.stringify(XS._debug.settings) === ${want}`, ctx)); i++) await sleep(100);
    await sleep(/theme\.|enabled|all/.test(v.name) ? 1800 : 1000);
    const deep = v.name === 'defaults' || v.name === 'all switches on';
    let rs = await run(v.S, deep);
    // a failure right after a change can be X still loading images: look once more before reporting it
    if (rs.some((r) => r[1] === 'fail')) {
      await sleep(2000);
      rs = await run(v.S, deep);
    }
    const n = rs.filter((r) => r[1] === 'fail').length;
    console.log(`${n ? 'FAIL' : 'ok  '}  ${v.name}${n ? '' : `  (${rs.filter((r) => r[1] === 'pass').length} passed)`}`);
    if (n) {
      print(rs, true);
      failed += n;
      failing.push(v.name);
    }
  }
} finally {
  await restore();
}
console.log(failed ? `\n${failed} failed checks in ${failing.length} variants: ${failing.join('; ')}` : `\nall ${todo.length} variants passed`);
c.close();
process.exit(failed ? 1 : 0);
