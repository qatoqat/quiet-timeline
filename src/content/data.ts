import { cleanText, nonOriginal, themeOf, topicTokens } from '../shared/score';
import type { Extracted, TallyRow, Tweet, User } from '../shared/types';
import { schedule } from './scan';
import { adIds, byHandle, cap, dup, st, tally, tweets, users } from './state';

export interface Reposter {
  tag: string;
  why: string;
  themed?: boolean;
}

function trackDup(t: Tweet): void {
  const key = cleanText(t.text);
  if (key.length < 15 || !t.userId) return;
  let byUser = dup.get(key);
  if (!byUser) dup.set(key, (byUser = new Map()));
  let ids = byUser.get(t.userId);
  if (!ids) byUser.set(t.userId, (ids = new Set()));
  ids.add(t.id!);
}

export function dupCounts(t: Tweet | null): { dupSameUser: number; dupUsers: number } {
  if (!t) return { dupSameUser: 0, dupUsers: 0 };
  const byUser = dup.get(cleanText(t.text));
  if (!byUser) return { dupSameUser: 0, dupUsers: 0 };
  return { dupSameUser: byUser.get(t.userId!)?.size || 0, dupUsers: byUser.size };
}

// Per-account counts kept across sessions (TallyRow); ids = recently counted posts so reloads don't recount.
// Small on purpose: 3000 accounts stay far below the 10 MB quota.
let tallyDirty = false;
const IDS_KEPT = 60;
const WORDS_VERSION = 2;

function tallyRow(userId: string): TallyRow {
  let row = tally.get(userId);
  if (!row) tally.set(userId, (row = { o: 0, n: 0, m: 0, ids: [] }));
  return row;
}

function trackOriginality(t: Tweet): void {
  if (!t.userId) return;
  const row = tallyRow(t.userId);
  if (row.ids.includes(t.id!)) return;
  row.ids.push(t.id!);
  if (row.ids.length > IDS_KEPT) row.ids.splice(0, row.ids.length - IDS_KEPT);
  if (nonOriginal(t)) row.n++;
  else row.o++;
  if (t.hasMedia) row.m++;
  if (t.replyTo) row.r = (row.r || 0) + 1;
  // topic words for single-topic accounts: original posts only
  if (!t.replyTo && !t.isRetweet) {
    if (row.wv !== WORDS_VERSION) Object.assign(row, { w: {}, wt: 0, wv: WORDS_VERSION }); // tokenizer changed
    const w = row.w!;
    row.wt = (row.wt || 0) + 1;
    for (const tok of topicTokens(t.text)) w[tok] = (w[tok] || 0) + 1;
    const keys = Object.keys(w);
    if (keys.length > 60) for (const k of keys) if (w[k] < 2) delete w[k];
  }
  tally.delete(t.userId); // re-insert = most recent last (for capping)
  tally.set(t.userId, row);
  tallyDirty = true;
}

function saveTally(): void {
  if (!tallyDirty) return;
  tallyDirty = false;
  cap(tally, 3000);
  try {
    chrome.storage.local.set({ tally2: Object.fromEntries(tally) });
  } catch (_) {} // extension reloaded
}

const DAY = 864e5;
const ID_SWITCH = Date.UTC(2013, 10, 1); // accounts with small ids predate this

export function reposterInfo(u: User | null): Reposter | null {
  if (!u) return null;
  const S = st.S;
  if (st.repostList.has(u.handle.toLowerCase())) return { tag: '♻ marked', why: 'on your reposter list' };
  const row = u.id ? tally.get(u.id) : undefined;
  const total = row ? row.o + row.n : 0;
  if (row && total >= S.repost.minPosts) {
    const pct = Math.round((row.n / total) * 100);
    if (pct >= S.repost.ratio) return { tag: `♻ ${pct}%`, why: `${pct}% of seen posts are reposts or others' content` };
  }
  // Aggregators: very high volume, nearly all media. Business / government accounts post a lot by design.
  if (row && S.repost.aggregators && !u.vtype && total >= 6 && typeof u.statuses === 'number') {
    const created = u.createdMs || (u.oldId ? ID_SWITCH : null);
    const perDay = created ? u.statuses / Math.max((Date.now() - created) / DAY, 1) : 0;
    const mediaPct = Math.round((row.m / total) * 100);
    if (perDay >= S.repost.aggPerDay && mediaPct >= 70) {
      return { tag: '♻ aggregator', why: `aggregator: ~${Math.round(perDay)} posts/day, ${mediaPct}% media` };
    }
  }
  if (S.repost.themed && !u.vtype) {
    const th = row && row.wv === WORDS_VERSION && themeOf(row, u);
    if (th) return { tag: `◎ ${th.word}`, why: `single-topic account: ${th.pct}% of seen posts are about “${th.word}”`, themed: true };
  }
  return null;
}

function onHookData(e: MessageEvent): void {
  if (e.source !== window || !e.data) return;
  const d = e.data as Partial<Extracted> & { __quiettl?: number };
  if (d.__quiettl !== 1) return;
  for (const u of d.users || []) {
    if (!u.id) continue;
    // some responses carry only a handle; don't let them overwrite full data
    if (u._partial && users.has(u.id)) continue;
    users.set(u.id, u);
    byHandle.set(u.handle.toLowerCase(), u);
  }
  for (const id of d.ads || []) adIds.add(id);
  for (const t of d.tweets || []) {
    if (!t.id || tweets.has(t.id)) continue;
    tweets.set(t.id, t);
    trackDup(t);
    if (unloaded) unloaded.push(t);
    else trackOriginality(t);
  }
  cap(users, 20000);
  cap(byHandle, 20000);
  cap(tweets, 30000);
  cap(dup, 30000);
  schedule();
}

// Posts that arrive before storage loads are counted after it, so the saved ids can skip ones already counted.
let unloaded: Tweet[] | null = [];

function loadTally(r: { tally2?: Record<string, TallyRow> } | undefined): void {
  for (const [id, saved] of Object.entries((r && r.tally2) || {})) tally.set(id, saved);
  const queued = unloaded || [];
  unloaded = null;
  for (const t of queued) trackOriginality(t);
  schedule();
}

export function initData(): void {
  setInterval(saveTally, 15000);
  addEventListener('pagehide', saveTally);
  document.addEventListener('visibilitychange', () => document.hidden && saveTally());
  chrome.storage.local.get('tally2', (r) => loadTally(r as { tally2?: Record<string, TallyRow> }));
  window.addEventListener('message', onHookData);
  // tell hook.js we're listening (repeated in case it loaded after us)
  const ready = () => window.postMessage({ __quiettlReady: 1 }, location.origin);
  ready();
  document.addEventListener('DOMContentLoaded', ready);
  window.addEventListener('load', ready);
}
