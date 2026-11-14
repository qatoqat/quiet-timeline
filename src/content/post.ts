import { addNI, ANY_MEDIA, appOf, CELL } from '../apps';
import { isPaid, nonOriginal, scoreTweet } from '../shared/score';
import { MEDIA } from '../shared/defaults';
import type { PostInfo } from '../shared/types';
import { dupCounts, reposterInfo } from './data';
import { restoreMedia, setReblur, stripMedia } from './media';
import { setToggle } from './side';
import { sizeState, updateSizeCss } from './sizes';
import {
  adIds, byHandle, cap, langCache, LEVEL, mediaRevealed, playAllowed, RESERVED, revealed, setData, st, stats, tally, tweets,
  unset, users, type LangHits,
} from './state';

export interface Page {
  statusId: string | null;
  profile: string | null;
  author: string | null;
}

export interface Verdict {
  lvl: number;
  action: string;
  why: string;
  label?: string;
}

export const readPost = (root: HTMLElement): PostInfo | null => appOf(root).read(root);

function hideCell(cell: HTMLElement, id: string, stat: Set<string>): void {
  cell.dataset.xsHidden = '1';
  stat.add(id);
  sizeState.set(id, { hidden: true });
  updateSizeCss();
}

export function pageCtx(): Page {
  const p = location.pathname;
  const sm = /\/status\/(\d+)/.exec(p);
  const pr = /^\/([A-Za-z0-9_]{1,15})(?:\/(?:with_replies|media|highlights|likes|articles|superfollows))?\/?$/.exec(p);
  const profile = pr && !RESERVED.has(pr[1].toLowerCase()) ? pr[1].toLowerCase() : null;
  const au = /^\/([A-Za-z0-9_]{1,15})\/status\//.exec(p);
  return { statusId: sm ? sm[1] : null, profile, author: au ? au[1].toLowerCase() : null };
}

export function ownHandle(): string | null {
  const img = document.querySelector('button[aria-label="Account menu"] img[alt^="@"]');
  if (img) return img.getAttribute('alt')!.slice(1).toLowerCase();
  // old app: the account button's avatar is named after the handle
  const av = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"] [data-testid^="UserAvatar-Container-"]');
  return (av && av.getAttribute('data-testid')!.replace('UserAvatar-Container-', '').toLowerCase()) || null;
}

function langFor(key: string, text: string): LangHits {
  let r = langCache.get(key);
  if (!r) {
    r = { slur: false, prof: false, custom: false };
    for (const h of st.filter.find(text)) r[h.kind] = true;
    langCache.set(key, r);
    cap(langCache, 30000);
  }
  return r;
}

// What we masked, per text node, so a filter turned off (or the extension) can write the original back;
// when React changes the node itself, its new text is the original.
const masked = new WeakMap<Text, { orig: string; out: string }>();
export function maskText(info: PostInfo, kinds: { slur: boolean; prof: boolean; custom: boolean }): boolean {
  let any = false;
  for (const el of info.texts) {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode() as Text | null; n; n = walk.nextNode() as Text | null) {
      const was = masked.get(n);
      const orig = was && was.out === n.nodeValue ? was.orig : n.nodeValue!;
      const out = st.filter.mask(orig, kinds);
      if (out !== n.nodeValue) n.nodeValue = out; // edit in place: React keeps owning the node
      if (out === orig) masked.delete(n);
      else {
        masked.set(n, { orig, out });
        any = true;
      }
    }
  }
  return any;
}

export function reset(root: HTMLElement, info: PostInfo): void {
  if (sizeState.delete(info.id)) updateSizeCss();
  unset(root, 'xsState', 'xsWhy', 'xsMedia', 'xsNoplay', 'xsPfp');
  const cell = root.closest<HTMLElement>(CELL);
  if (cell) delete cell.dataset.xsHidden;
  // anywhere in the post, not just the current name element: an earlier pass may have taken another
  // element for the name (before the display name rendered) and left its marks behind
  for (const n of root.querySelectorAll<HTMLElement>('[data-xs-badge], [data-xs-paid], [data-xs-title]')) {
    unset(n, 'xsBadge', 'xsLvl', 'xsPaid');
    if (n.hasAttribute('data-xs-title')) {
      n.removeAttribute('title');
      n.removeAttribute('data-xs-title');
    }
  }
}

export function processPost(root: HTMLElement, page: Page): void {
  const S = st.S;
  const A = appOf(root);
  const info = A.read(root);
  if (!info) return;
  const id = info.id;
  const t = tweets.get(id) || null;
  const u = (t && t.userId && users.get(t.userId)) || byHandle.get(info.handle.toLowerCase()) || null;

  // Words: found in X's own text and in what's shown (an auto-translation can differ), cached by the
  // shown text's length (masking keeps it, a translation swapped in changes it); masked on every pass
  // (React may restore the text), unmasked when a filter stops masking.
  const shown = info.text;
  const lang = langFor(`${id}|${shown.length}`, t && t.text && t.text !== shown ? `${t.text}\n${shown}` : shown);
  const kinds = {
    slur: lang.slur && S.lang.slurAction === 'mask',
    prof: lang.prof && S.lang.profanityAction === 'mask',
    custom: lang.custom && S.lang.customAction === 'mask',
  };
  if (kinds.slur || kinds.prof || kinds.custom || root.dataset.xsMasked) {
    const did = maskText(info, kinds);
    setData(root, 'xsMasked', did && '1');
    if (did) stats.masked.add(id);
  }

  if (root.dataset.xsMedia === 'unload') stripMedia(root);

  const handle = info.handle.toLowerCase();
  const focal = page.statusId === id;
  const owner = (page.profile && page.profile === handle) || page.author === handle; // the profile / thread you opened
  // X marks ads in its data; the "Ad from …" label is a fallback. The post / profile you opened stays.
  const isAd = adIds.has(id) || A.isAd(root, info);
  if (S.declutter.ads && isAd && !focal && !owner) {
    const cell = root.closest<HTMLElement>(CELL);
    if (cell && !cell.dataset.xsHidden) hideCell(cell, id, stats.ads);
    root.dataset.xsKey = 'ad';
    return;
  }

  const rp = reposterInfo(u);
  // media and the bookmark button can arrive after the post (the old app fills its action bar in
  // later, without changing the post's size); X re-renders can drop our buttons; the photo viewer
  // changes the URL over the page
  const media = root.querySelectorAll(ANY_MEDIA).length; // incl. a quoted post's
  const bookmark = root.querySelector('[data-testid="bookmark"], [data-testid="removeBookmark"], [data-engagement-action="bookmark"]');
  const key = `${id}|${t ? 1 : 0}|${u ? 1 : 0}|${rp ? rp.tag : 0}|${st.ver}|${revealed.has(id) ? 1 : 0}|${mediaRevealed.has(id) ? 1 : 0}|${playAllowed.has(id) ? 1 : 0}|${media}|${bookmark ? 1 : 0}|${root.querySelector('.xs-ni, .xs-toggle, .qt-reblur') ? 1 : 0}|${location.pathname}`;
  if (root.dataset.xsKey === key) return;
  root.dataset.xsKey = key;
  reset(root, info);

  const trusted = handle === st.myHandle || st.allow.has(handle) || !!(u && u.followedByMe);
  const exempt = trusted || focal || owner;
  const parent = t && t.replyTo ? tweets.get(t.replyTo) : null;
  // a part of the author's own thread isn't a reply to someone
  const isReply = t ? !!t.replyTo && !(parent && parent.userId === t.userId) : !!page.statusId && !focal;
  const paid = u ? isPaid(u) : info.paidIcon;

  let verdict = null as Verdict | null;
  const consider = (action: string, why: string, label?: string) => {
    const lvl = LEVEL[action] || 0;
    if (lvl && (!verdict || lvl > verdict.lvl)) verdict = { lvl, action, why, label };
  };

  if (lang.custom) consider(S.lang.customAction, 'muted word', 'muted word');
  if (lang.slur) consider(S.lang.slurAction, 'slur', 'slur');
  if (lang.prof) consider(S.lang.profanityAction, 'profanity', 'profanity');

  const badge: string[] = [];
  let lvl: string | null = null;
  let reasons: string[] = [];
  if (u && !trusted && (S.bot.scope === 'all' || isReply)) {
    const row = u.id ? tally.get(u.id) : undefined;
    const seen = row ? { total: row.o + row.n, replies: row.r || 0 } : undefined;
    const ctx = { isReply, parent, domText: info.text, seen, ...dupCounts(t) };
    const r = scoreTweet(u, t, ctx, S);
    const before = verdict;
    if (!exempt) {
      const why = `@${u.handle} · score ${r.score}: ${r.reasons.join(', ')}`;
      // each row is "from this score, at least this"; the strongest that applies wins
      if (r.score >= S.bot.high) consider(S.bot.highAction, why);
      if (r.score >= S.bot.mid) consider(S.bot.midAction, why);
    }
    const shown = S.bot.badges && r.score >= Math.min(20, S.bot.mid, S.bot.high);
    if (shown) {
      badge.push(String(r.score));
      lvl = r.score >= S.bot.high ? 'high' : r.score >= S.bot.mid ? 'mid' : 'low';
    }
    // the reasons tooltip goes with a badge or an action, not on every name
    if (shown || verdict !== before) reasons = r.reasons;
  }

  const nonOrig = nonOriginal(t);
  if (rp && (rp.themed || S.repost.mark)) {
    badge.unshift(rp.tag);
    lvl = lvl && lvl !== 'low' ? lvl : rp.themed ? 'themed' : 'repost';
    reasons = [rp.why, ...reasons];
  }
  if (nonOrig) reasons = [`this post: ${nonOrig}`, ...reasons];
  const wasUnloaded = root.querySelector('img[data-xs-src], video[data-xs-poster]');
  const flaggedMedia = (rp && !(rp.themed && !S.repost.themedMedia)) || nonOrig;
  // Reposters and Replies can both apply: the stronger mode wins (none < blur < unload < hide)
  const rank = (m: string) => MEDIA.findIndex(([v]) => v === m);
  const modes = [flaggedMedia ? S.repost.media : 'none', isReply && !focal && !owner ? S.replies.media : 'none'];
  let mediaMode = modes.sort((a, b) => rank(b) - rank(a))[0];
  if (mediaMode === 'hide' && (focal || owner)) mediaMode = 'blur'; // the post / profile you opened stays reachable
  if (mediaMode === 'unload' && !A.canUnload) mediaMode = 'blur';
  const wantMedia = mediaMode !== 'none';
  const coverable = wantMedia && !trusted && (media || wasUnloaded);
  stats.media.delete(id);
  if (coverable && !mediaRevealed.has(id)) {
    root.dataset.xsMedia = mediaMode;
    stats.media.add(id);
    if (mediaMode === 'unload') stripMedia(root);
  }
  setReblur(root, coverable && mediaMode !== 'hide' ? mediaMode : null, !mediaRevealed.has(id));
  if (wasUnloaded && root.dataset.xsMedia !== 'unload') restoreMedia(root);
  const quiet = (S.repost.noAutoplay && flaggedMedia) || root.dataset.xsMedia;
  if (quiet && !trusted && !playAllowed.has(id) && ((t && t.hasMedia) || media)) {
    root.dataset.xsNoplay = '1';
    for (const v of root.querySelectorAll('video')) if (!v.paused) v.pause();
  }

  if (paid && info.nameEl) info.nameEl.dataset.xsPaid = '1';
  if (u && !trusted && !owner && (paid ? S.pfp.paid : S.pfp.others)) root.dataset.xsPfp = '1';
  if (paid && !exempt && isReply) consider(S.paid.replyAction, `@${info.handle} · paid checkmark reply`);

  const date = A.dateLink(root, id);
  const views = A.viewsLink(root, id);
  if (date) {
    const holder = date.parentElement!;
    const vt = views ? (views.textContent || '').trim() : '';
    setData(holder, 'xsViews', vt); // shown by the date with Views by date, and on a collapsed post
  }

  // Under the avatar (timeline posts only): bookmark & share, with "Not interested" on top of them;
  // side.ts places them on posts tall enough.
  const wantBm = S.declutter.sideActions && !isReply && !page.statusId;
  setData(root, 'xsWantBm', wantBm && '1');
  // X only offers "Not interested" in the home feed
  const wantNI = wantBm && S.declutter.notInterested && location.pathname === '/home' && u && !u.followedByMe && handle !== st.myHandle;
  const bm = A.bookmarkCell(root);
  let ni = root.querySelector('.qt-ni-cell');
  if (ni && (!wantNI || ni.nextElementSibling !== bm)) {
    ni.remove();
    ni = null;
  }
  if (wantNI && bm && !ni) addNI(A, bm);

  if (info.nameEl && badge.length) {
    info.nameEl.dataset.xsBadge = badge.join(' · ');
    info.nameEl.dataset.xsLvl = lvl!;
  }
  if (info.nameEl && reasons.length) {
    info.nameEl.setAttribute('title', `Quiet Timeline\n${reasons.join('\n')}`);
    info.nameEl.setAttribute('data-xs-title', '');
  }

  for (const s of [stats.hidden, stats.collapsed, stats.dimmed]) s.delete(id);
  const wouldCollapse = verdict && (verdict.action === 'collapse' || (verdict.action === 'hide' && (focal || !root.closest(CELL))));
  setToggle(root, verdict && revealed.has(id) && wouldCollapse ? 'hide' : verdict && wouldCollapse ? 'show' : null, verdict);
  if (!verdict || revealed.has(id)) return;

  let action = verdict.action;
  if (focal && action === 'hide') action = 'collapse'; // never hide the post you opened
  if (action === 'hide') {
    const cell = root.closest<HTMLElement>(CELL);
    if (cell) return hideCell(cell, id, stats.hidden);
    action = 'collapse';
  }
  if (action === 'collapse') {
    root.dataset.xsState = 'collapsed';
    root.dataset.xsWhy = verdict.why.length > 140 ? verdict.why.slice(0, 139) + '…' : verdict.why;
    sizeState.set(id, { why: root.dataset.xsWhy });
    updateSizeCss();
    stats.collapsed.add(id);
  } else {
    root.dataset.xsState = 'dim';
    stats.dimmed.add(id);
  }
}
