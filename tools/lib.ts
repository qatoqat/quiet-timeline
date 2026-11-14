// DevTools-protocol connection to the dev Vivaldi started by vivaldi.sh.
export type Msg = { id?: number; method?: string; params?: any; result?: any; error?: { message: string } };
export type Target = { type: string; url: string; title: string; webSocketDebuggerUrl: string };
export type Conn = { events: Msg[]; send(method: string, params?: object): Promise<any>; close(): void };

export const BASE = `http://127.0.0.1:${process.env.CDP_PORT || 9333}`;
export const X_URL = /^https:\/\/(x|twitter)\.com\//;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function connect(url: string): Promise<Conn> {
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

export async function targets(): Promise<Target[]> {
  try {
    return await (await fetch(`${BASE}/json/list`)).json();
  } catch {
    throw new Error('dev Vivaldi not running (tools/vivaldi.sh)');
  }
}

// an X tab, preferably one whose URL matches `prefer` (e.g. the home feed, not a post someone opened)
export async function xTab(prefer?: RegExp): Promise<Conn> {
  const tabs = (await targets()).filter((t) => t.type === 'page' && X_URL.test(t.url));
  const t = (prefer && tabs.find((t) => prefer.test(t.url))) || tabs[0];
  if (!t) throw new Error('no x.com tab open');
  return connect(t.webSocketDebuggerUrl);
}

export async function evaluate(c: Conn, expression: string, contextId?: number): Promise<any> {
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
export async function extContext(c: Conn): Promise<number> {
  c.events.length = 0;
  await c.send('Runtime.disable'); // enable reports the existing contexts again
  await c.send('Runtime.enable');
  await sleep(300);
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
