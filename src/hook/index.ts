// Runs in the page's own JS world (MAIN): forwards user/tweet data from API responses
// and server-rendered inline scripts to the content script.
import { extract, extractFromScript } from './extract';
import type { Extracted } from '../shared/types';

type HookedXHR = XMLHttpRequest & { __xsUrl?: string };

// Buffer everything until the content script says it's listening, then replay.
let ready = false;
const buffer: object[] = [];
const dbg = ((window as any).__quiettlHook = { scripts: 0, sent: 0 }); // read by tools/mem
const send = (out: Extracted) => {
  dbg.sent += out.tweets.length;
  if (!out.users.length && !out.tweets.length && !out.ads.length) return;
  const msg = { __quiettl: 1, users: out.users, tweets: out.tweets, ads: out.ads };
  if (ready) window.postMessage(msg, location.origin);
  else if (buffer.length < 200) buffer.push(msg);
};
window.addEventListener('message', (e) => {
  if (e.source !== window || !e.data || e.data.__quiettlReady !== 1) return;
  ready = true;
  for (const m of buffer.splice(0)) window.postMessage(m, location.origin);
});

const API = /\/graphql\/|\/i\/api\//;

const origFetch = window.fetch;
window.fetch = function (this: unknown, input: RequestInfo | URL) {
  const p = origFetch.apply(this, arguments as unknown as Parameters<typeof fetch>);
  try {
    const url = input instanceof Request ? input.url : String(input);
    if (url && API.test(url)) {
      p.then((res) => res.clone().json())
        .then((j) => send(extract(j)))
        .catch(() => {}); // not JSON (e.g. empty responses)
    }
  } catch (_) {}
  return p;
} as typeof fetch;

const origOpen = XMLHttpRequest.prototype.open;
const origSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.open = function (this: HookedXHR, _method: string, url: string | URL) {
  this.__xsUrl = String(url);
  return origOpen.apply(this, arguments as unknown as Parameters<typeof origOpen>);
} as typeof origOpen;
XMLHttpRequest.prototype.send = function (this: HookedXHR) {
  if (this.__xsUrl && API.test(this.__xsUrl)) {
    this.addEventListener('load', () => {
      try {
        const t = this.responseType;
        const json = t === 'json' ? this.response : t === '' || t === 'text' ? JSON.parse(this.responseText) : null;
        if (json) send(extract(json));
      } catch (_) {}
    });
  }
  return origSend.apply(this, arguments as unknown as Parameters<typeof origSend>);
};

// Inline data scripts are removed after hydration, so catch them as they arrive. Their text
// streams in after the element is inserted, so rescan whenever it grows (the observer runs
// before each script executes).
const scannedLen = new WeakMap<HTMLScriptElement, number>();
const scanScript = (s: HTMLScriptElement) => {
  if (s.src) return;
  const text = s.textContent || '';
  if ((scannedLen.get(s) || 0) >= text.length) return;
  scannedLen.set(s, text.length);
  dbg.scripts++;
  send(extractFromScript(text));
};
for (const s of document.getElementsByTagName('script')) scanScript(s);
const mo = new MutationObserver((muts) => {
  const todo = new Set<HTMLScriptElement>();
  for (const m of muts) {
    const t = m.type === 'characterData' ? m.target.parentNode : m.target;
    if (t && t.nodeName === 'SCRIPT') todo.add(t as HTMLScriptElement);
    for (const n of m.addedNodes) if (n.nodeName === 'SCRIPT') todo.add(n as HTMLScriptElement);
  }
  for (const s of todo) scanScript(s);
});
mo.observe(document, { childList: true, subtree: true, characterData: true });
document.addEventListener('DOMContentLoaded', () => {
  for (const s of document.getElementsByTagName('script')) scanScript(s); // final, complete text
  setTimeout(() => mo.disconnect(), 5000);
});
