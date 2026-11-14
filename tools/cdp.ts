#!/usr/bin/env bun
// DevTools-protocol helper for the dev Vivaldi started by vivaldi.sh (usage at the bottom).
// eval runs in X's page world, evalx in the extension's content-script world (globalThis.XS).
import { mkdirSync, writeFileSync } from 'node:fs';

type Msg = { id?: number; method?: string; params?: any; result?: any; error?: { message: string } };
type Target = { type: string; url: string; title: string; webSocketDebuggerUrl: string };
type Conn = { events: Msg[]; send(method: string, params?: object): Promise<any>; close(): void };

const BASE = `http://127.0.0.1:${process.env.CDP_PORT || 9333}`;
const X_URL = /^https:\/\/(x|twitter)\.com\//;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function connect(url: string): Promise<Conn> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let n = 0;
    const pending = new Map<number, [(v: any) => void, (e: Error) => void]>();
    const events: Msg[] = [];
    ws.onmessage = (e) => {
      const m: Msg = JSON.parse(e.data as string);
      if (m.id && pending.has(m.id)) {
        const [ok, fail] = pending.get(m.id)!;
        pending.delete(m.id);
        m.error ? fail(new Error(m.error.message)) : ok(m.result);
      } else if (m.method) events.push(m);
    };
    ws.onerror = () => reject(new Error(`cannot connect to ${url}`));
    ws.onopen = () =>
      resolve({
        events,
        send: (method, params = {}) =>
          new Promise((ok, fail) => {
            const id = ++n;
            pending.set(id, [ok, fail]);
            ws.send(JSON.stringify({ id, method, params }));
          }),
        close: () => ws.close(),
      });
  });
}

async function targets(): Promise<Target[]> {
  try {
    return await (await fetch(`${BASE}/json/list`)).json();
  } catch {
    throw new Error('dev Vivaldi not running (tools/vivaldi.sh)');
  }
}

async function xTab() {
  const t = (await targets()).find((t) => t.type === 'page' && X_URL.test(t.url));
  if (!t) throw new Error('no x.com tab open');
  return connect(t.webSocketDebuggerUrl);
}

async function evaluate(c: Conn, expression: string, contextId?: number) {
  const r = await c.send('Runtime.evaluate', {
    expression: `(async () => (${expression}))()`,
    awaitPromise: true,
    returnByValue: true,
    ...(contextId ? { contextId } : {}),
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

// The live content-script world in this tab, not a leftover from before an extension reload.
async function extContext(c: Conn): Promise<number> {
  await c.send('Runtime.enable');
  await sleep(200);
  const { frameTree } = await c.send('Page.getFrameTree');
  const cands = c.events
    .filter((e) => e.method === 'Runtime.executionContextCreated' && e.params.context.name.startsWith('Quiet Timeline') && e.params.context.auxData?.frameId === frameTree.frame.id)
    .reverse();
  for (const e of cands) {
    const ok = await evaluate(c, 'typeof XS === "object" && !!XS._debug && !!chrome.runtime?.id', e.params.context.id).catch(() => false);
    if (ok) return e.params.context.id;
  }
  throw new Error('Quiet Timeline content script not found in tab');
}

async function mouseClick(c: Conn, x: number, y: number) {
  for (const type of ['mousePressed', 'mouseReleased']) await c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
}

const out = (v: unknown) => console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 1));
const [cmd, a1, a2] = process.argv.slice(2);
setTimeout(() => { console.error('timed out'); process.exit(2); }, 40000).unref();

try {
  if (cmd === 'tabs') {
    out((await targets()).filter((t) => t.type === 'page').map((t) => `${t.title} — ${t.url}`));
  } else if (cmd === 'eval') {
    const c = await xTab();
    out(await evaluate(c, a1));
    c.close();
  } else if (cmd === 'evalx') {
    const c = await xTab();
    out(await evaluate(c, a1, await extContext(c)));
    c.close();
  } else if (cmd === 'click') {
    // real mouse click at viewport x,y:  click 900,32
    const c = await xTab();
    const [x, y] = a1.split(',').map(Number);
    await mouseClick(c, x, y);
    out('clicked');
    c.close();
  } else if (cmd === 'storeshot') {
    // 1280×800 PNG for the Chrome Web Store; optional JS to run once laid out
    const c = await xTab();
    await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await sleep(2500);
    const click = a2 && /^click:(\d+),(\d+)$/.exec(a2); // real mouse click (reaches iframes)
    if (click) await mouseClick(c, +click[1], +click[2]);
    else if (a2) await evaluate(c, a2);
    await sleep(1500);
    const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(a1, Buffer.from(data, 'base64'));
    await c.send('Emulation.clearDeviceMetricsOverride');
    out(`saved ${a1}`);
    c.close();
  } else if (cmd === 'shot') {
    const c = await xTab();
    let clip;
    if (a2) {
      const r = await evaluate(c, `(() => { const e = document.querySelector(${JSON.stringify(a2)}); if (!e) return null; e.scrollIntoView({block:'center'}); const b = e.getBoundingClientRect(); return {x:b.x, y:b.y, width:b.width, height:Math.min(b.height, 1600), scale:1}; })()`);
      if (!r) throw new Error('selector not found');
      clip = r;
    }
    const { data } = await c.send('Page.captureScreenshot', { format: 'jpeg', quality: 60, ...(clip ? { clip } : {}) });
    writeFileSync(a1 || 'shot.jpg', Buffer.from(data, 'base64'));
    out(`saved ${a1 || 'shot.jpg'}`);
    c.close();
  } else if (cmd === 'reload') {
    // background.js reloads the extension on this message (unpacked installs only).
    const x = await xTab();
    await evaluate(x, `(chrome.runtime.sendMessage({ type: 'quiettl-dev-reload' }), 1)`, await extContext(x));
    await sleep(1500);
    x.close();
    // every X tab: the reload strips the extension's styles from all of them
    const tabs = (await targets()).filter((t) => t.type === 'page' && X_URL.test(t.url));
    for (const t of tabs) {
      const c = await connect(t.webSocketDebuggerUrl);
      await c.send('Page.reload');
      c.close();
    }
    out(`extension + ${tabs.length} X tab(s) reloaded`);
  } else if (cmd === 'net') {
    // net <url-regex> <out-dir>: reload the X tab and save matching JSON responses.
    const re = new RegExp(a1 || 'graphql|/i/api/');
    const dir = a2 || '.';
    mkdirSync(dir, { recursive: true });
    const x = await xTab();
    await x.send('Network.enable', { maxTotalBufferSize: 200e6, maxResourceBufferSize: 50e6 });
    await x.send('Page.reload');
    await sleep(8000);
    const seen = x.events.filter((e) => e.method === 'Network.responseReceived' && re.test(e.params.response.url));
    let n = 0;
    for (const e of seen) {
      const url: string = e.params.response.url;
      try {
        const b = await x.send('Network.getResponseBody', { requestId: e.params.requestId });
        const body: string = b.base64Encoded ? Buffer.from(b.body, 'base64').toString() : b.body;
        const name = `${String(++n).padStart(2, '0')}-${new URL(url).pathname.split('/').pop()!.slice(0, 40)}.json`;
        writeFileSync(`${dir}/${name}`, body);
        out(`${name}  ${body.length}b  ${url.slice(0, 120)}`);
      } catch (err) {
        out(`skip ${url.slice(0, 100)}: ${(err as Error).message}`);
      }
    }
    x.close();
  } else if (cmd === 'nav') {
    const c = await xTab();
    await c.send('Page.navigate', { url: a1 });
    out('ok');
    c.close();
  } else {
    out('usage: tabs | eval <js> | evalx <js> | shot <file> [selector] | storeshot <file.png> [js|click:x,y] | click x,y | reload | net [regex] [dir] | nav <url>   (old app: bun tools/check.ts --old --url <path>)');
  }
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
