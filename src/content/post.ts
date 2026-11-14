import { appOf, CELL } from '../apps';
import { isPaid, nonOriginal, scoreTweet } from '../shared/score';
import type { PostInfo } from '../shared/types';
import { dupCounts, reposterInfo } from './data';
import { restoreMedia, setReblur, stripMedia } from './media';
import { setToggle } from './side';
import { sizeState, updateSizeCss } from './sizes';
import {
  adIds, byHandle, cap, langCache, LEVEL, mediaRevealed, playAllowed, RESERVED, revealed, st, stats, tally, tweets, users,
  type LangHits,
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
  return img ? img.getAttribute('alt')!.slice(1).toLowerCase() : null;
}

function langFor(id: string, text: string): LangHits {
  let r = langCache.get(id);
  if (!r) {
    r = { slur: false, prof: false, custom: false };
    for (const h of st.filter.find(text)) r[h.kind] = true;
    langCache.set(id, r);
    cap(langCache, 30000);
  }
  return r;
}

function maskText(info: PostInfo): boolean {
  const S = st.S;
  const kinds = {
    slur: S.lang.slurAction === 'mask',
    prof: S.lang.profanityAction === 'mask',
    custom: S.lang.customAction === 'mask',
  };
  if (!kinds.slur && !kinds.prof && !kinds.custom) return false;
  let changed = false;
  for (const el of info.texts) {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const next = st.filter.mask(n.nodeValue!, kinds);
      if (next !== n.nodeValue) {
        n.nodeValue = next; // edit in place: React keeps owning the node
        changed = true;
      }
    }
  }
  return changed;
}

export function reset(root: HTMLElement, info: PostInfo): void {
  if (sizeState.delete(info.id)) updateSizeCss();
  delete root.dataset.xsState;
  delete root.dataset.xsWhy;
  delete root.dataset.xsMedia;
  delete root.dataset.xsNoplay;
  delete root.dataset.xsPfp;
  const cell = root.closest<HTMLElement>(CELL);
  if (cell) delete cell.dataset.xsHidden;
  const n = info.nameEl;
  if (n) {
    for (const k of ['xsBadge', 'xsLvl', 'xsPaid']) delete n.dataset[k];
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

  // Detect before masking, then mask on every pass (React may restore the text).
  const lang = langFor(id, (t && t.text) || info.text);
  if ((lang.slur || lang.prof || lang.custom) && maskText(info)) stats.masked.add(id);

  if (root.dataset.xsMedia === 'unload') stripMedia(root);

  // X marks ads in its data; the "Ad from …" label is a fallback.
  const isAd = adIds.has(id) || A.isAd(root, info);
  if (S.declutter.ads && isAd) {
    const cell = root.closest<HTMLElement>(CELL);
    if (cell && !cell.dataset.xsHidden) {
      cell.dataset.xsHidden = '1';
      stats.ads.add(id);
      sizeState.set(id, { hidden: true });
      updateSizeCss();
    }
    root.dataset.xsKey = 'ad';
    return;
  }

  const rp = reposterInfo(u);
  // media can arrive after the post; X re-renders can drop our buttons
  const key = `${id}|${t ? 1 : 0}|${u ? 1 : 0}|${rp ? rp.tag : 0}|${st.ver}|${revealed.has(id) ? 1 : 0}|${mediaRevealed.has(id) ? 1 : 0}|${playAllowed.has(id) ? 1 : 0}|${info.media.length}|${root.querySelector('.xs-ni, .xs-toggle, .qt-reblur') ? 1 : 0}`;
  if (root.dataset.xsKey === key) return;
  root.dataset.xsKey = key;
  reset(root, info);

  const handle = info.handle.toLowerCase();
  const focal = page.statusId === id;
  const trusted = handle === st.myHandle || st.allow.has(handle) || !!(u && u.followedByMe);
  const owner = (page.profile && page.profile === handle) || page.author === handle; // the profile / thread you opened
  const exempt = trusted || focal || owner;
  const isReply = t ? !!t.replyTo : !!page.statusId && !focal;
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
    const ctx = { isReply, parent: t && t.replyTo ? tweets.get(t.replyTo) : null, domText: info.text, seen, ...dupCounts(t) };
    const r = scoreTweet(u, t, ctx, S);
    reasons = r.reasons;
    if (!exempt) {
      const why = `@${u.handle} · score ${r.score}: ${r.reasons.join(', ')}`;
      if (r.score >= S.bot.high) consider(S.bot.highAction, why);
      else if (r.score >= S.bot.mid) consider(S.bot.midAction, why);
    }
    if (S.bot.badges && r.score >= 20) {
      badge.push(String(r.score));
      lvl = r.score >= S.bot.high ? 'high' : r.score >= S.bot.mid ? 'mid' : 'low';
    }
  }

  const nonOrig = nonOriginal(t);
  if (rp && (rp.themed || S.repost.mark)) {
    badge.unshift(rp.tag);
    lvl = lvl || (rp.themed ? 'themed' : 'repost');
    reasons = [rp.why, ...reasons];
  }
  if (nonOrig) reasons = [`this post: ${nonOrig}`, ...reasons];
  const wasUnloaded = root.querySelector('img[data-xs-src]');
  const flaggedMedia = (rp && !(rp.themed && !S.repost.themedMedia)) || nonOrig;
  let mediaMode: string = flaggedMedia ? S.repost.media : 'none';
  if (mediaMode === 'none' && isReply && !focal && !owner) mediaMode = S.replies.media;
  if (mediaMode === 'unload' && !A.canUnload) mediaMode = 'blur';
  const wantMedia = mediaMode !== 'none';
  const coverable = wantMedia && !trusted && (info.media.length || wasUnloaded);
  if (coverable && !mediaRevealed.has(id)) {
    root.dataset.xsMedia = mediaMode;
    stats.media.add(id);
    if (mediaMode === 'unload') stripMedia(root);
  }
  // covered media shows an eye (click to show), revealed media a crossed eye (cover again)
  setReblur(root, coverable && mediaMode !== 'hide' ? mediaMode : null, !mediaRevealed.has(id));
  if (wasUnloaded && root.dataset.xsMedia !== 'unload') restoreMedia(root);
  const quiet = (S.repost.noAutoplay && flaggedMedia) || root.dataset.xsMedia;
  if (quiet && !trusted && !playAllowed.has(id) && (t ? t.hasMedia : info.media.length)) {
    root.dataset.xsNoplay = '1';
    for (const v of root.querySelectorAll('video')) if (!v.paused) v.pause();
  }

  if (paid && info.nameEl) info.nameEl.dataset.xsPaid = '1';
  // blur the avatar of accounts you don't follow (hovering the post shows it)
  if (u && !trusted && !owner && (paid ? S.pfp.paid : S.pfp.others)) root.dataset.xsPfp = '1';
  if (paid && !exempt && isReply) consider(S.paid.replyAction, `@${info.handle} · paid checkmark reply`);

  // view count after the date ("· 28M views")
  const date = A.dateLink(root, id);
  const views = A.viewsLink(root, id);
  if (date) {
    const holder = date.parentElement!;
    const vt = views ? (views.textContent || '').trim() : '';
    if (S.declutter.viewsInline && vt) holder.dataset.xsViews = vt;
    else delete holder.dataset.xsViews;
  }

  // under-avatar extras: timeline posts only; replies and thread pages keep X's layout
  const timelinePost = !isReply && !page.statusId;
  if (S.declutter.sideActions && timelinePost) root.dataset.xsWantSide = '1';
  else {
    delete root.dataset.xsWantSide;
    delete root.dataset.xsSide;
  }
  // X only offers "Not interested" in the home feed
  const wantNI = S.declutter.notInterested && timelinePost && location.pathname === '/home' && u && !u.followedByMe && handle !== st.myHandle;
  // "Not interested" lives in (and follows) the bookmark/share box: in the action bar or under the avatar.
  const box = A.actionBox(root);
  let ni = root.querySelector<HTMLElement>('.xs-ni');
  if (ni && (!wantNI || A.niHost(ni).parentElement !== box)) {
    A.niHost(ni).remove();
    ni = null;
  }
  if (wantNI && box) {
    if (!ni) A.makeNI(box);
    root.dataset.xsNi = '1';
  } else delete root.dataset.xsNi;

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
    if (cell) {
      cell.dataset.xsHidden = '1';
      stats.hidden.add(id);
      sizeState.set(id, { hidden: true });
      updateSizeCss();
      return;
    }
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
