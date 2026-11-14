#!/usr/bin/env node
// Memory snapshot of the X tab: JS heap, DOM size, renderer RSS, Quiet Timeline's own maps.
//   node tools/mem.mjs [scrolls]   — optionally scroll N screens first
const BASE = 'http://127.0.0.1:9333';
const l = await (await fetch(`${BASE}/json/list`)).json();
const t = l.find((t) => t.type === 'page' && /^https:\/\/(x|twitter)\.com\//.test(t.url));
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0;
const P = new Map();
const events = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.method) events.push(m);
  if (P.has(m.id)) (P.get(m.id)(m), P.delete(m.id));
};
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) => new Promise((r) => { const i = ++id; P.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression, contextId) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, ...(contextId ? { contextId } : {}) })).result?.result?.value;

const scrolls = Number(process.argv[2] || 0);
for (let i = 0; i < scrolls; i++) {
  await ev('scrollBy(0, innerHeight)');
  await new Promise((r) => setTimeout(r, 700));
}
await send('HeapProfiler.collectGarbage');
await send('Performance.enable');
const metrics = Object.fromEntries((await send('Performance.getMetrics')).result.metrics.map((m) => [m.name, m.value]));
const mb = (b) => `${(b / 1048576).toFixed(0)} MB`;

await send('Runtime.enable');
await new Promise((r) => setTimeout(r, 200));
let xs = null;
for (const e of events.filter((e) => e.method === 'Runtime.executionContextCreated' && e.params.context.name.startsWith('Quiet Timeline')).reverse()) {
  xs = await ev(`typeof XS === 'object' && XS._debug ? (() => { const d = XS._debug; const json = (x) => JSON.stringify(x).length; return { users: d.users.size, tweets: d.tweets.size, tally: d.tally.size, approxBytes: json([...d.users.values()]) + json([...d.tweets.values()]) + json([...d.tally.values()]) }; })() : null`, e.params.context.id);
  if (xs) break;
}
const page = await ev(`({ media: document.querySelectorAll('video').length, imgs: document.images.length, posts: document.querySelectorAll('[data-href*="/status/"]').length, hook: window.__quiettlHook && { scripts: window.__quiettlHook.scripts, sent: window.__quiettlHook.sent } })`);
console.log(JSON.stringify({
  url: t.url,
  jsHeapUsed: mb(metrics.JSHeapUsedSize),
  jsHeapTotal: mb(metrics.JSHeapTotalSize),
  domNodes: metrics.Nodes,
  listeners: metrics.JSEventListeners,
  documents: metrics.Documents,
  frames: metrics.Frames,
  page,
  quiettl: xs && { ...xs, approxBytes: mb(xs.approxBytes) },
}, null, 1));
process.exit(0);
