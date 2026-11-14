#!/usr/bin/env bun
// Memory snapshot of the X tab: JS heap, DOM size, renderer RSS, Quiet Timeline's own maps.
//   bun tools/mem.ts [scrolls]   — optionally scroll N screens first
import { evaluate, extContext, sleep, xTab } from './lib';

const c = await xTab();
const ev = (expression: string, contextId?: number) => evaluate(c, expression, contextId);
const scrolls = Number(process.argv[2] || 0);
for (let i = 0; i < scrolls; i++) {
  await ev('scrollBy(0, innerHeight)');
  await sleep(700);
}
await c.send('HeapProfiler.collectGarbage');
await c.send('Performance.enable');
const metrics: Record<string, number> = Object.fromEntries(
  (await c.send('Performance.getMetrics')).metrics.map((m: { name: string; value: number }) => [m.name, m.value]),
);
const mb = (b: number) => `${(b / 1048576).toFixed(0)} MB`;

const xsCtx = await extContext(c).catch(() => null);
const xs: { users: number; tweets: number; tally: number; approxBytes: number } | null = xsCtx
  ? await ev(`(() => { const d = XS._debug; const json = (x) => JSON.stringify(x).length; return { users: d.users.size, tweets: d.tweets.size, tally: d.tally.size, approxBytes: json([...d.users.values()]) + json([...d.tweets.values()]) + json([...d.tally.values()]) }; })()`, xsCtx)
  : null;
const page = await ev(`({ media: document.querySelectorAll('video').length, imgs: document.images.length, posts: document.querySelectorAll('[data-href*="/status/"]').length, hook: window.__quiettlHook && { scripts: window.__quiettlHook.scripts, sent: window.__quiettlHook.sent } })`);
console.log(JSON.stringify({
  url: await ev('location.href'),
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
