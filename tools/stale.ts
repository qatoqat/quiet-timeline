#!/usr/bin/env bun
// The settings panel's saving: a change is saved, also when the panel closes right after it; and an
// extension reload or update under an open panel (which leaves it behind, its chrome.* calls throwing
// "Extension context invalidated") makes it neither throw, on a change or on close, nor stay open.
// Out of the dev browser's way: a throwaway headless Vivaldi on port 9335 loads the repo, and
// x.com/home is a stub page served over CDP (content scripts inject by URL), so no network is needed.
//
//   bun tools/stale.ts      exit 1 if any check failed
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect, evaluate, extContext, sleep, type Conn } from './lib';

const PORT = 9335;
const dir = mkdtempSync(join(tmpdir(), 'quiettl-stale-'));
const browser = Bun.spawn(
  ['vivaldi', '--headless=new', `--user-data-dir=${dir}`, `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check',
    '--disable-features=DisableLoadExtensionCommandLineSwitch', `--load-extension=${new URL('..', import.meta.url).pathname}`, 'about:blank'],
  { stdout: 'ignore', stderr: 'ignore' },
);

const list = (): Promise<any[]> => fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json()).catch(() => []);
async function find(pred: (t: any) => boolean, tries = 40): Promise<any> {
  for (let i = 0; i < tries; i++) {
    const t = (await list()).find(pred);
    if (t) return t;
    await sleep(250);
  }
}
// Attaching to the first tab while Vivaldi's UI is still starting wedges it: wait for the targets to settle.
async function firstTab(): Promise<any> {
  let last = '';
  for (let i = 0; i < 30; i++) {
    const ts = await list();
    const ids = ts.map((t) => t.id).sort().join();
    const tab = ts.find((t) => t.type === 'page' && t.url === 'about:blank');
    if (tab && ids === last) return tab;
    last = ids;
    await sleep(1000);
  }
}
const isPanel = (t: any) => t.type === 'iframe' && t.url.endsWith('/popup/popup.html');
const thrown = (c: Conn) =>
  c.events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.exception?.description?.split('\n')[0] ?? e.params.exceptionDetails.text);
const flip = `(() => { const el = document.querySelector('[data-path="bot.badges"]'); el.click(); return el.checked; })()`;

async function attach(t: any): Promise<Conn> {
  const c = await connect(t.webSocketDebuggerUrl);
  await c.send('Runtime.enable');
  return c;
}
const stored = (c: Conn) => evaluate(c, `chrome.storage.sync.get('settings').then((r) => r.settings?.bot?.badges)`);
async function ready(c: Conn) {
  for (let i = 0; i < 20 && !(await evaluate(c, `!!document.querySelector('.tabs [aria-selected="true"]')`)); i++) await sleep(250);
}
// flip a switch and let the debounced save run: true if storage then holds the new value
async function flipSaved(c: Conn) {
  const v = await evaluate(c, flip);
  await sleep(600);
  return (await stored(c)) === v;
}

let failed = 0;
async function done() {
  browser.kill();
  await browser.exited;
  rmSync(dir, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
setTimeout(() => (check('run', false, 'timed out'), done()), 60_000);
const check = (name: string, pass: boolean, detail = '') => {
  if (!pass) failed++;
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name}${pass || !detail ? '' : `  — ${detail}`}`);
};

try {
  const page = await attach(await firstTab());
  await page.send('Fetch.enable', { patterns: [{ urlPattern: 'https://x.com/*' }] });
  const stub = btoa('<!doctype html><title>stub</title><main></main>');
  const served = new Set<string>();
  setInterval(() => {
    for (const e of page.events) {
      if (e.method !== 'Fetch.requestPaused' || served.has(e.params.requestId)) continue;
      served.add(e.params.requestId);
      const headers = [{ name: 'Content-Type', value: 'text/html' }];
      page.send('Fetch.fulfillRequest', { requestId: e.params.requestId, responseCode: 200, responseHeaders: headers, body: stub }).catch(() => {});
    }
  }, 30);
  await page.send('Page.navigate', { url: 'https://x.com/home' });
  let ctx = 0;
  for (let i = 0; i < 20 && !ctx; i++) ctx = await extContext(page).catch(() => sleep(500).then(() => 0));
  if (!ctx) throw new Error('content script did not load on the stub page');

  // A: the real panel, left open over the reload. C: a second panel frame, closed mid-change.
  // B: a third, changed (its save timer has fired), then closed after the reload.
  await evaluate(page, 'XS._debug.togglePanel(), 1', ctx);
  const a0 = await find(isPanel);
  const ca0 = await attach(a0);
  await ready(ca0);
  check('a change in the panel is saved', (await flipSaved(ca0)) && (await flipSaved(ca0)));
  const frame = async (id: string, not: string[]) => {
    await evaluate(page, `(() => { const f = document.createElement('iframe'); f.id = '${id}'; f.src = ${JSON.stringify(a0.url)}; document.body.append(f); })()`);
    const t = await find((t) => isPanel(t) && !not.includes(t.id));
    const c = await attach(t);
    await ready(c);
    return [t, c] as const;
  };
  const [c0, cc] = await frame('stale-c', [a0.id]);
  const v = await evaluate(cc, flip);
  await evaluate(page, `document.getElementById('stale-c').remove(), 1`);
  await sleep(500);
  check('closing a panel right after a change still saves it', (await stored(ca0)) === v);
  const [b0, cb0] = await frame('stale-b', [a0.id, c0.id]);
  await flipSaved(cb0);

  await evaluate(ca0, 'setTimeout(() => chrome.runtime.reload(), 50), 1');
  await sleep(2000);
  const a = await find((t) => isPanel(t) && t.id === a0.id, 8);
  const b = await find((t) => isPanel(t) && t.id === b0.id, 8);
  check('both panels outlive the reload (the case under test)', !!(a && b));
  if (a && b) {
    const ca = await attach(a);
    const cb = await attach(b);
    check('chrome.runtime.id is gone in the left-behind panel', (await evaluate(ca, 'chrome.runtime?.id ?? null')) === null);
    await evaluate(ca, flip);
    await sleep(800);
    check('a change in it throws nothing', !thrown(ca).length, thrown(ca).join('; '));
    check('and closes it', !(await evaluate(page, `!!document.getElementById('quiettl-panel')`, ctx)));
    await evaluate(page, `document.getElementById('stale-b').remove(), 1`);
    await sleep(800);
    check('closing one (pagehide) throws nothing', !thrown(cb).length, thrown(cb).join('; '));
  }
  check('nothing thrown in the page', !thrown(page).length, thrown(page).join('; '));
} catch (e) {
  check('run', false, String(e));
}
await done();
