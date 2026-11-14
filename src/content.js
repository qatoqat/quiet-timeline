(function (XS) {
  'use strict';

  const LEVEL = { dim: 1, collapse: 2, hide: 3 };
  const RESERVED = new Set([
    'home', 'explore', 'notifications', 'messages', 'search', 'settings', 'i', 'compose', 'bookmarks',
    'lists', 'communities', 'jobs', 'premium', 'login', 'logout', 'tos', 'privacy',
  ]);
  // A post is a role=link box whose data-href is its permalink; a quoted post is
  // the same kind of box nested inside it.
  const POST = '[role="link"][data-href*="/status/"]';
  const MEDIA = 'video, img[src*="pbs.twimg.com/media/"], img[src*="video_thumb"], img[src*="/card_img/"]';

  let S = XS.merge(XS.DEFAULTS, null);
  let ver = 0;
  let filter = XS.createWordFilter(S);
  let allow = new Set();
  let repostList = new Set();
  let myHandle = null;

  const users = new Map(); // id → user
  const byHandle = new Map(); // lowercase handle → user
  const tweets = new Map(); // id → tweet
  const dup = new Map(); // cleaned text → Map(userId → Set(tweetId))
  const langCache = new Map(); // tweetId → {slur, prof, custom}
  const tally = new Map(); // userId → [original, nonOriginal] (persisted)
  const revealed = new Set();
  const mediaRevealed = new Set();
  const playAllowed = new Set(); // posts whose video you started yourself
  const adIds = new Set(); // promoted posts (from X's data)
  // Posts we hid or collapsed: re-applied the moment X re-creates them (e.g. when
  // scrolling back up), before they're drawn — otherwise the list jumps.
  const sizeState = new Map(); // id → { hidden: true } | { why }
  // X's list measures a post the moment it's created — before any script can
  // run — so hidden/collapsed states are also written as CSS keyed on the post
  // id, which applies at creation.
  const sizeCss = document.createElement('style');
  sizeCss.id = 'quiettl-sizes';
  let sizeCssQueued = false;
  function updateSizeCss() {
    if (sizeCssQueued) return;
    sizeCssQueued = true;
    queueMicrotask(() => {
      sizeCssQueued = false;
      const top = (id) => `[role="link"][data-href$="/status/${id}"]:not([role="link"] [role="link"])`;
      const hidden = [];
      const rules = [];
      const ids = [...sizeState.keys()].slice(-600);
      for (const id of ids) {
        if (!/^\d+$/.test(id) || revealed.has(id)) continue;
        const st = sizeState.get(id);
        if (st.hidden) hidden.push(`li[data-index]:has(${top(id)})`);
        else if (st.why) rules.push(collapseCss(top(id), st.why));
      }
      if (hidden.length) {
        rules.unshift(`${hidden.join(',\n')} { height: 1px !important; overflow: hidden !important; }`);
        rules.unshift(`${hidden.map((h) => h + ' > *').join(',\n')} { display: none !important; }`);
      }
      rules.unshift(collapseCss('[data-xs-state="collapsed"]'));
      sizeCss.textContent = S.enabled ? rules.join('\n') : '';
      if (!sizeCss.isConnected) document.documentElement.appendChild(sizeCss);
    });
  }
  const stats = { hidden: new Set(), collapsed: new Set(), dimmed: new Set(), masked: new Set(), popups: new Set(), media: new Set(), ads: new Set() };
  XS._debug = { stats, users, tweets, tally, get settings() { return S; }, togglePanel: () => togglePanel(), scanNow: () => scan(), processOne: (r) => processPost(r, pageCtx()) }; // for tools/cdp.mjs evalx

  function cap(map, max) {
    if (map.size <= max) return;
    let n = map.size - max * 0.8;
    for (const k of map.keys()) {
      if (n-- <= 0) break;
      map.delete(k);
    }
  }

  // ---------- data from hook.js ----------

  function trackDup(t) {
    const key = XS.cleanText(t.text);
    if (key.length < 15 || !t.userId) return;
    let byUser = dup.get(key);
    if (!byUser) dup.set(key, (byUser = new Map()));
    let ids = byUser.get(t.userId);
    if (!ids) byUser.set(t.userId, (ids = new Set()));
    ids.add(t.id);
  }

  function dupCounts(t) {
    if (!t) return { dupSameUser: 0, dupUsers: 0 };
    const byUser = dup.get(XS.cleanText(t.text));
    if (!byUser) return { dupSameUser: 0, dupUsers: 0 };
    return { dupSameUser: byUser.get(t.userId)?.size || 0, dupUsers: byUser.size };
  }

  // Per-account counts, kept across sessions: { o: originals, n: non-original,
  // m: with media, ids: recently counted post ids (so reloads don't recount) }.
  let tallyDirty = false;
  function tallyRow(userId) {
    let row = tally.get(userId);
    if (!row) tally.set(userId, (row = { o: 0, n: 0, m: 0, ids: [] }));
    return row;
  }
  function trackOriginality(t) {
    if (!t.userId) return;
    const row = tallyRow(t.userId);
    if (row.ids.includes(t.id)) return;
    row.ids.push(t.id);
    if (row.ids.length > 300) row.ids.splice(0, row.ids.length - 300);
    if (XS.nonOriginal(t)) row.n++;
    else row.o++;
    if (t.hasMedia) row.m++;
    if (t.replyTo) row.r = (row.r || 0) + 1;
    // topic words, for single-topic accounts (only original posts count)
    if (!t.replyTo && !t.isRetweet) {
      if (row.wv !== WORDS_VERSION) Object.assign(row, { w: {}, wt: 0, wv: WORDS_VERSION }); // tokenizer changed
      const w = row.w;
      row.wt = (row.wt || 0) + 1;
      for (const tok of XS.topicTokens(t.text)) w[tok] = (w[tok] || 0) + 1;
      const keys = Object.keys(w);
      if (keys.length > 60) for (const k of keys) if (w[k] < 2) delete w[k]; // keep it small
    }
    tally.delete(t.userId); // re-insert = most recent last (for capping)
    tally.set(t.userId, row);
    tallyDirty = true;
  }
  const WORDS_VERSION = 2;
  function mergeCounts(a, b) {
    const out = { ...(a || {}) };
    for (const [k, v] of Object.entries(b || {})) out[k] = (out[k] || 0) + v;
    return out;
  }
  setInterval(() => {
    if (!tallyDirty) return;
    tallyDirty = false;
    cap(tally, 3000);
    try {
      chrome.storage.local.set({ tally2: Object.fromEntries(tally) });
    } catch (_) {} // extension reloaded
  }, 5000);
  chrome.storage.local.remove('tally'); // old format, double-counted
  chrome.storage.local.get('tally2', (r) => {
    for (const [id, saved] of Object.entries((r && r.tally2) || {})) {
      const cur = tally.get(id);
      if (!cur) {
        tally.set(id, saved);
        continue;
      }
      // merge posts counted this session before storage loaded
      const ids = new Set(saved.ids);
      tally.set(id, {
        o: saved.o + cur.o,
        n: saved.n + cur.n,
        m: saved.m + cur.m,
        r: (saved.r || 0) + (cur.r || 0),
        wt: (saved.wv === WORDS_VERSION ? saved.wt || 0 : 0) + (cur.wt || 0),
        w: saved.wv === WORDS_VERSION ? mergeCounts(saved.w, cur.w) : cur.w,
        wv: WORDS_VERSION,
        ids: [...saved.ids, ...cur.ids.filter((x) => !ids.has(x))].slice(-300),
      });
    }
    schedule();
  });

  const DAY = 864e5;
  const ID_SWITCH = Date.UTC(2013, 10, 1); // accounts with small ids predate this

  // → { tag, why } if the account counts as a reposter / aggregator, else null
  function reposterInfo(u) {
    if (!u) return null;
    if (repostList.has(u.handle.toLowerCase())) return { tag: '♻ marked', why: 'on your reposter list' };
    const row = tally.get(u.id);
    const total = row ? row.o + row.n : 0;
    if (total >= S.repost.minPosts) {
      const pct = Math.round((row.n / total) * 100);
      if (pct >= S.repost.ratio) return { tag: `♻ ${pct}%`, why: `${pct}% of seen posts are reposts or others' content` };
    }
    // Aggregators: very high volume, nearly everything is media.
    // Business / government accounts (gold, grey checks) post a lot by design.
    if (S.repost.aggregators && !u.vtype && total >= 6 && typeof u.statuses === 'number') {
      const created = u.createdMs || (u.oldId ? ID_SWITCH : null);
      const perDay = created ? u.statuses / Math.max((Date.now() - created) / DAY, 1) : 0;
      const mediaPct = Math.round((row.m / total) * 100);
      if (perDay >= S.repost.aggPerDay && mediaPct >= 70) {
        return { tag: '♻ aggregator', why: `aggregator: ~${Math.round(perDay)} posts/day, ${mediaPct}% media` };
      }
    }
    if (S.repost.themed && !u.vtype) {
      const th = row && row.wv === WORDS_VERSION && XS.themeOf(row, u);
      if (th) return { tag: `◎ ${th.word}`, why: `single-topic account: ${th.pct}% of seen posts are about “${th.word}”`, themed: true };
    }
    return null;
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data) return;
    if (e.data.__quiettlDev === 'reload') chrome.runtime.sendMessage({ type: 'quiettl-dev-reload' });
    if (e.data.__quiettl !== 1) return;
    for (const u of e.data.users || []) {
      if (!u.id) continue;
      // Some responses carry only a handle; don't let them overwrite full data.
      if (u._partial && users.has(u.id)) continue;
      users.set(u.id, u);
      byHandle.set(u.handle.toLowerCase(), u);
    }
    for (const id of e.data.ads || []) adIds.add(id);
    for (const t of e.data.tweets || []) {
      if (!t.id || tweets.has(t.id)) continue;
      tweets.set(t.id, t);
      trackDup(t);
      trackOriginality(t);
    }
    cap(users, 20000);
    cap(byHandle, 20000);
    cap(tweets, 30000);
    cap(dup, 30000);
    schedule();
  });
  // Tell hook.js we're listening (repeat in case it loaded after us).
  const ready = () => window.postMessage({ __quiettlReady: 1 }, location.origin);
  ready();
  document.addEventListener('DOMContentLoaded', ready);
  window.addEventListener('load', ready);

  // ---------- reading X's DOM ----------

  function readPost(root) {
    const m = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/.exec(root.getAttribute('data-href') || '');
    if (!m) return null;
    const handle = m[1];
    const id = m[2];
    const quotes = [...root.querySelectorAll(POST)];
    const outside = (el) => !quotes.some((q) => q.contains(el));

    // Display-name link: links to the profile, has text, isn't the avatar.
    let nameEl = null;
    for (const a of root.querySelectorAll(`a[href="/${handle}" i]`)) {
      if (outside(a) && !a.querySelector('img') && a.textContent.trim() && !a.textContent.trim().startsWith('@')) {
        nameEl = a.parentElement;
        break;
      }
    }
    const texts = [...root.querySelectorAll('article div[dir="auto"]')];
    const main = texts.find(outside);
    const media = [...root.querySelectorAll(MEDIA)].filter(outside);
    const paidIcon = [...root.querySelectorAll('svg[aria-label="Verified account"] use')].some(
      (u) => outside(u) && /premium/.test(u.getAttribute('href') || ''),
    );
    return { id, handle, nameEl, texts, text: main ? main.textContent : '', media, paidIcon };
  }

  function pageCtx() {
    const p = location.pathname;
    const st = /\/status\/(\d+)/.exec(p);
    const pr = /^\/([A-Za-z0-9_]{1,15})(?:\/(?:with_replies|media|highlights|likes|articles|superfollows))?\/?$/.exec(p);
    const profile = pr && !RESERVED.has(pr[1].toLowerCase()) ? pr[1].toLowerCase() : null;
    const au = /^\/([A-Za-z0-9_]{1,15})\/status\//.exec(p);
    return { statusId: st ? st[1] : null, profile, author: au ? au[1].toLowerCase() : null };
  }

  function ownHandle() {
    const img = document.querySelector('button[aria-label="Account menu"] img[alt^="@"]');
    return img ? img.getAttribute('alt').slice(1).toLowerCase() : null;
  }

  // ---------- language filter ----------

  function langFor(id, text) {
    let r = langCache.get(id);
    if (!r) {
      r = { slur: false, prof: false, custom: false };
      for (const h of filter.find(text)) r[h.kind] = true;
      langCache.set(id, r);
      cap(langCache, 30000);
    }
    return r;
  }

  function maskText(info) {
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
        const next = filter.mask(n.nodeValue, kinds);
        if (next !== n.nodeValue) {
          n.nodeValue = next; // edit in place: React keeps owning the node
          changed = true;
        }
      }
    }
    return changed;
  }

  // ---------- "don't load" media ----------

  const MEDIA_IMG = 'img[src*="pbs.twimg.com/media/"], img[src*="video_thumb"], img[src*="/card_img/"]';
  // Remove image sources before they load; keep them to restore on click.
  function stripMedia(root) {
    for (const img of root.querySelectorAll(MEDIA_IMG)) {
      img.dataset.xsSrc = img.getAttribute('src');
      img.removeAttribute('src');
      if (img.hasAttribute('srcset')) {
        img.dataset.xsSrcset = img.getAttribute('srcset');
        img.removeAttribute('srcset');
      }
    }
    for (const v of root.querySelectorAll('video')) {
      v.preload = 'none';
      if (!v.paused) v.pause();
    }
  }
  function restoreMedia(root) {
    for (const img of root.querySelectorAll('img[data-xs-src]')) {
      if (img.dataset.xsSrcset) img.setAttribute('srcset', img.dataset.xsSrcset);
      img.setAttribute('src', img.dataset.xsSrc);
      delete img.dataset.xsSrc;
      delete img.dataset.xsSrcset;
    }
  }

  // ---------- mosaic blur style ----------

  // Draw the image once into a tiny canvas laid over it; the browser enlarges
  // it with hard pixel edges. Nothing is re-filtered while scrolling. (A
  // cross-origin image "taints" the canvas, but we only display it.)
  function mosaic(img, cells, cls) {
    const box = img.parentElement;
    if (!box || !img.getAttribute('src')) return;
    let cv = box.querySelector(':scope > canvas.qt-mosaic');
    const key = `${img.currentSrc}|${S.blurMono}`;
    if (cv && cv.dataset.key === key) return;
    const draw = () => {
      const w = img.clientWidth || box.clientWidth;
      const h = img.clientHeight || box.clientHeight;
      if (!w || !h || !img.naturalWidth) return;
      if (!cv) {
        cv = document.createElement('canvas');
        cv.className = `qt-mosaic ${cls}`;
        if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
        img.after(cv);
      }
      cv.width = Math.max(2, Math.round(w >= h ? cells : (cells * w) / h));
      cv.height = Math.max(2, Math.round(w >= h ? (cells * h) / w : cells));
      // crop like object-fit: cover
      const r = Math.max(cv.width / img.naturalWidth, cv.height / img.naturalHeight);
      const sw = cv.width / r;
      const sh = cv.height / r;
      const ctx = cv.getContext('2d');
      ctx.filter = S.blurMono ? 'grayscale(1)' : 'none';
      ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, cv.width, cv.height);
      cv.dataset.key = key;
    };
    if (img.complete) draw();
    else img.addEventListener('load', draw, { once: true });
  }
  function applyMosaic(root) {
    if (S.blurStyle !== 'mosaic') return;
    if (root.dataset.xsPfp) {
      const img = root.querySelector(':scope > article > div > div > [data-post-avatar] .x-avatar img');
      if (img) mosaic(img, 6, 'qt-pfp');
    }
    if (root.dataset.xsMedia === 'blur') {
      for (const img of root.querySelectorAll(MEDIA_IMG)) if (!img.closest('[data-post-avatar]')) mosaic(img, 14, 'qt-media');
    }
  }

  // SVG filters for the "contour" style: blur, then posterize into flat bands.
  function ensureContourFilters() {
    if (document.getElementById('quiettl-contour')) return;
    const steps = '0 0.2 0.4 0.6 0.8 1';
    const f = (id, sd) => `<filter id="${id}" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%"><feGaussianBlur stdDeviation="${sd}" edgeMode="duplicate"/><feComponentTransfer>${['R', 'G', 'B'].map((c) => `<feFunc${c} type="discrete" tableValues="${steps}"/>`).join('')}</feComponentTransfer></filter>`;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'quiettl-contour';
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    svg.innerHTML = f('quiettl-contour-sm', 4) + f('quiettl-contour-lg', 14);
    document.documentElement.appendChild(svg);
  }

  // ---------- per-post decision ----------

  function reset(root, info) {
    if (info && info.id && sizeState.delete(info.id)) updateSizeCss();
    delete root.dataset.xsState;
    delete root.dataset.xsWhy;
    delete root.dataset.xsMedia;
    delete root.dataset.xsNoplay;
    delete root.dataset.xsPfp;
    delete root.dataset.xsLabel;
    const cell = root.closest('li[data-index]');
    if (cell) delete cell.dataset.xsHidden;
    const n = info.nameEl;
    if (n) {
      for (const k of ['xsBadge', 'xsLvl', 'xsPaid', 'xsTag']) delete n.dataset[k];
      if (n.hasAttribute('data-xs-title')) {
        n.removeAttribute('title');
        n.removeAttribute('data-xs-title');
      }
    }
  }

  function processPost(root, page) {
    const info = readPost(root);
    if (!info) return;
    const id = info.id;
    const t = tweets.get(id) || null;
    const u = (t && users.get(t.userId)) || byHandle.get(info.handle.toLowerCase()) || null;

    // Detect before masking, then mask on every pass (React may restore the text).
    const lang = langFor(id, (t && t.text) || info.text);
    if (maskText(info)) stats.masked.add(id);

    if (root.dataset.xsMedia === 'unload') stripMedia(root);

    // Ads: X marks them in its data; "Ad from …" label as a fallback.
    const isAd = adIds.has(id) || [...root.querySelectorAll('a[target="_blank"] div')].some((d) => /^(Ad from |Promoted\b)/.test(d.textContent));
    if (S.declutter.ads && isAd) {
      const cell = root.closest('li[data-index]');
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
    const key = `${id}|${t ? 1 : 0}|${u ? 1 : 0}|${rp ? rp.tag : 0}|${ver}|${revealed.has(id) ? 1 : 0}|${mediaRevealed.has(id) ? 1 : 0}|${playAllowed.has(id) ? 1 : 0}`;
    if (root.dataset.xsKey === key) return;
    root.dataset.xsKey = key;
    reset(root, info);

    const handle = info.handle.toLowerCase();
    const focal = page.statusId === id;
    const trusted = handle === myHandle || allow.has(handle) || !!(u && u.followedByMe);
    const owner = (page.profile && page.profile === handle) || page.author === handle; // the profile / thread you opened
    const exempt = trusted || focal || owner;
    const isReply = t ? !!t.replyTo : !!page.statusId && !focal;
    const paid = u ? XS.isPaid(u) : info.paidIcon;

    let verdict = null;
    const consider = (action, why, label) => {
      const lvl = LEVEL[action] || 0;
      if (lvl && (!verdict || lvl > verdict.lvl)) verdict = { lvl, action, why, label };
    };

    if (lang.custom) consider(S.lang.customAction, 'muted word', 'muted word');
    if (lang.slur) consider(S.lang.slurAction, 'slur', 'slur');
    if (lang.prof) consider(S.lang.profanityAction, 'profanity', 'profanity');

    const badge = [];
    let lvl = null;
    let reasons = [];
    if (u && !trusted && (S.bot.scope === 'all' || isReply)) {
      const row = tally.get(u.id);
      const seen = row && { total: row.o + row.n, replies: row.r || 0 };
      const ctx = { isReply, parent: t && t.replyTo ? tweets.get(t.replyTo) : null, domText: info.text, seen, ...dupCounts(t) };
      const r = XS.scoreTweet(u, t, ctx, S);
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

    // Reposters / non-original content
    const nonOrig = XS.nonOriginal(t);
    if (rp && (rp.themed || S.repost.mark)) {
      badge.unshift(rp.tag);
      lvl = lvl || (rp.themed ? 'themed' : 'repost');
      reasons = [rp.why, ...reasons];
    }
    if (nonOrig) reasons = [`this post: ${nonOrig}`, ...reasons];
    const wasUnloaded = root.querySelector('img[data-xs-src]');
    const flaggedMedia = (rp && !(rp.themed && !S.repost.themedMedia)) || nonOrig;
    let mediaMode = flaggedMedia ? S.repost.media : 'none';
    if (mediaMode === 'none' && isReply && !focal && !owner) mediaMode = S.replies.media;
    if (mediaMode !== 'none' && !trusted && (info.media.length || wasUnloaded) && !mediaRevealed.has(id)) {
      root.dataset.xsMedia = mediaMode;
      stats.media.add(id);
      if (mediaMode === 'unload') stripMedia(root);
    }
    if (wasUnloaded && root.dataset.xsMedia !== 'unload') restoreMedia(root);
    const quiet = (S.repost.noAutoplay && flaggedMedia) || (root.dataset.xsMedia && root.dataset.xsMedia !== 'none');
    if (quiet && !trusted && !playAllowed.has(id) && (t ? t.hasMedia : info.media.length)) {
      root.dataset.xsNoplay = '1';
      for (const v of root.querySelectorAll('video')) if (!v.paused) v.pause();
    }

    if (paid && info.nameEl) info.nameEl.dataset.xsPaid = '1';
    // Blur the avatar of accounts you don't follow (hovering the post shows it).
    if (u && !trusted && !owner && (paid ? S.pfp.paid : S.pfp.others)) root.dataset.xsPfp = '1';
    if (paid && !exempt && isReply) consider(S.paid.replyAction, `@${info.handle} · paid checkmark reply`);

    // View count after the date ("· 28M views")
    const date = [...root.querySelectorAll(`a[href$="/status/${id}"][data-base-ui-tooltip-trigger]`)].find((a) => !a.closest('[role="group"]'));
    const views = root.querySelector('a[aria-label="View count"]');
    if (date) {
      const holder = date.parentElement;
      if (S.declutter.viewsInline && views && views.textContent.trim()) holder.dataset.xsViews = views.textContent.trim();
      else delete holder.dataset.xsViews;
    }

    // Under-avatar extras: timeline posts only — replies and thread pages keep X's layout.
    const timelinePost = !isReply && !page.statusId;
    if (S.declutter.sideActions && timelinePost) root.dataset.xsWantSide = '1';
    else {
      delete root.dataset.xsWantSide;
      delete root.dataset.xsSide;
    }
    // X only offers "Not interested" in the home feed
    const wantNI = S.declutter.notInterested && timelinePost && location.pathname === '/home' && u && !u.followedByMe && handle !== myHandle;
    // "Not interested" lives in the bookmark/share box (first in line), so it
    // follows that box: in the action bar, or under the avatar with it.
    const box = root.querySelector(':scope > article [role="group"] > div:has([data-engagement-action="bookmark"])');
    let ni = root.querySelector(':scope > article .xs-ni');
    if (ni && ni.parentElement !== box) {
      ni.remove();
      ni = null;
    }
    if (wantNI && box) {
      if (!ni) {
        ni = document.createElement('button');
        ni.type = 'button';
        // Same look and hover as X's bookmark button: copy its classes.
        const bmBtn = box.querySelector('[data-engagement-action="bookmark"] button');
        const pill = bmBtn && bmBtn.querySelector(':scope > span');
        ni.className = `${bmBtn ? bmBtn.className : ''} xs-ni`;
        ni.dataset.xsTip = 'Not interested';
        ni.setAttribute('aria-label', 'Not interested in this post');
        const face = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 16.2c1.9-1.8 5.1-1.8 7 0"/><circle cx="9" cy="10" r=".6" fill="currentColor"/><circle cx="15" cy="10" r=".6" fill="currentColor"/></svg>';
        ni.innerHTML = pill ? `<span class="${pill.className}">${face}</span>` : face;
        box.appendChild(ni);
      }
      root.dataset.xsNi = '1';
    } else {
      if (ni) ni.remove();
      delete root.dataset.xsNi;
    }

    if (info.nameEl && badge.length) {
      info.nameEl.dataset.xsBadge = badge.join(' · ');
      info.nameEl.dataset.xsLvl = lvl;
    }
    if (info.nameEl && reasons.length) {
      info.nameEl.setAttribute('title', `Quiet Timeline\n${reasons.join('\n')}`);
      info.nameEl.setAttribute('data-xs-title', '');
    }

    for (const s of [stats.hidden, stats.collapsed, stats.dimmed]) s.delete(id);
    const wouldCollapse = verdict && (verdict.action === 'collapse' || (verdict.action === 'hide' && (focal || !root.closest('li[data-index]'))));
    setToggle(root, verdict && revealed.has(id) && wouldCollapse ? 'hide' : verdict && wouldCollapse ? 'show' : null, verdict);
    if (!verdict || revealed.has(id)) return;

    let action = verdict.action;
    if (focal && action === 'hide') action = 'collapse'; // never hide the post you opened
    if (action === 'hide') {
      const cell = root.closest('li[data-index]');
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
      if (verdict.label) root.dataset.xsLabel = verdict.label;
      sizeState.set(id, { why: root.dataset.xsWhy });
      updateSizeCss();
      stats.collapsed.add(id);
    } else {
      root.dataset.xsState = 'dim';
      stats.dimmed.add(id);
    }
  }

  // "show" / "hide" link in a collapsed (or revealed) post's header, just
  // before the ⋯ menu. Collapsed posts keep only that header row.
  const HEADER = "[class*='@container/post-actions']";
  function setToggle(root, mode, verdict) {
    const header = root.querySelector(`:scope > article ${HEADER}`);
    const slot = header && header.lastElementChild;
    let link = root.querySelector(':scope > article .xs-toggle');
    if (!mode || !slot) {
      if (link) link.remove();
      return;
    }
    if (!link || link.parentElement !== slot) {
      if (link) link.remove();
      link = document.createElement('button');
      link.type = 'button';
      link.className = 'xs-toggle';
      slot.prepend(link);
    }
    const text = mode === 'show' && verdict.label ? `${verdict.label} · show` : mode;
    if (link.textContent !== text) link.textContent = text;
    link.dataset.xsTip = mode === 'show' ? verdict.why : 'Collapse again';
  }

  // Collapsed post: header row only (name, check, badge, handle, date, views,
  // ⋯), no avatar/text/media/actions. Posts without that header fall back to a
  // one-line note. `sel` is the post box selector.
  function collapseCss(sel, why) {
    const has = `${sel}:has(> article ${HEADER})`;
    const not = `${sel}:not(:has(> article ${HEADER}))`;
    const note = why ? JSON.stringify(why) : 'attr(data-xs-why)';
    return [
      `${has} > article > :not(:has(${HEADER})), ${has} > article > div > :not(:has(${HEADER})) > *, ${has} > article :has(> ${HEADER}) ~ *, ${has} > article :has(> ${HEADER}) > :not(${HEADER}), ${has} ${HEADER} > :last-child > :not(.xs-toggle, [data-slot='xds-menu-trigger']) { display: none !important; }`,
      `${has} > article { opacity: 0.6; transition: opacity 0.15s; } ${has}:hover > article { opacity: 1; }`,
      `${not} > * { display: none !important; }`,
      `${not}::before { content: '⊘  ' ${note} '  ·  click to show'; display: block; padding: 10px 16px; font: 13px/1.4 system-ui, sans-serif; color: var(--x-fg-secondary, #8b8f97); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }`,
    ].join('\n');
  }

  // Move the bookmark/share box (with "Not interested") under the avatar — only
  // when the post is tall enough for it; short posts keep it in the action bar.
  const SLOT = 36; // px per button
  const sizeWatch = new ResizeObserver((entries) => {
    for (const e of entries) {
      const root = e.target.parentElement;
      if (root) layoutSide(root);
    }
  });
  const watched = new WeakSet();
  function layoutSide(root) {
    if (root.dataset.xsWantSide !== '1') return;
    const article = root.querySelector(':scope > article');
    const av = article && article.querySelector('[data-post-avatar]');
    const box = article && article.querySelector('[role="group"] > div:has([data-engagement-action="bookmark"])');
    if (!av || !box) return;
    if (!watched.has(article)) {
      watched.add(article);
      sizeWatch.observe(article);
    }
    // offsets within the article (independent of scrolling)
    let top = av.offsetHeight;
    let left = av.offsetWidth / 2;
    for (let e = av; e && e !== article; e = e.offsetParent) {
      top += e.offsetTop;
      left += e.offsetLeft;
      if (e.offsetParent && !article.contains(e.offsetParent)) break;
    }
    const base = Math.round(top + 8);
    let top0 = base + 4; // a little breathing room under the avatar
    // If the post has media or a quoted post, line the stack up with its top…
    const ar = article.getBoundingClientRect();
    const blocks = [...article.querySelectorAll('div.rounded-md.overflow-hidden, ' + POST)].filter(
      (el) => el !== root && !el.closest('[role="group"]') && el.parentElement.closest(POST) === root,
    );
    const firstBlock = blocks.map((el) => Math.round(el.getBoundingClientRect().top - ar.top)).sort((x, y) => x - y)[0];
    // …only when it starts right below the avatar (about one line of text above
    // it); with more text the stack stays under the avatar.
    if (firstBlock !== undefined && firstBlock >= base - 8 && firstBlock <= base + 34) top0 = firstBlock;
    const count = box.querySelector('.xs-ni') ? 3 : 2;
    if (article.offsetHeight - top0 >= count * SLOT) {
      article.style.setProperty('--xs-side-left', `${Math.round(left - SLOT / 2)}px`);
      article.style.setProperty('--xs-stack-top', `${top0}px`);
      root.dataset.xsSide = '1';
    } else {
      delete root.dataset.xsSide;
    }
  }

  function clearAll() {
    for (const root of document.querySelectorAll('[data-xs-key]')) {
      const info = readPost(root);
      if (info) reset(root, info);
      delete root.dataset.xsKey;
    }
  }

  // ---------- nag popups ----------

  // Only dialogs whose text matches one of these get closed — never compose,
  // menus, image viewers or anything else.
  const NAG = new RegExp(
    [
      'one subscription', 'get plus', 'get premium', 'claim offer', 'subscribe to premium', 'upgrade to premium',
      'try premium', 'get verified', 'premium\\+? (?:is|gives|members)',
      'boost your account security', 'two-factor authentication',
      'turn on notifications', 'allow notifications', 'download the (?:x )?app', 'get the app',
      'add a phone number', 'verify your (?:email|phone)', 'try grok', 'meet grok', 'ask grok',
      'what\'s new on x', 'don\'t miss what\'s happening',
    ].join('|'),
    'i',
  );
  const DISMISS = /^(?:close|not now|maybe later|skip(?: for now)?|dismiss|no,? thanks|no thanks)$/i;
  const closed = new WeakSet();

  function closeNags() {
    for (const d of document.querySelectorAll('[role="dialog"], [role="alertdialog"]')) {
      if (closed.has(d) || !d.isConnected) continue;
      const text = d.innerText || '';
      if (!NAG.test(text.slice(0, 600))) continue;
      const btns = [...d.querySelectorAll('button, [role="button"]')];
      const btn = btns.find((b) => DISMISS.test((b.getAttribute('aria-label') || b.innerText || '').trim()));
      if (!btn) continue;
      closed.add(d);
      stats.popups.add(text.slice(0, 40));
      btn.click();
    }
  }

  // ---------- scheduling ----------

  let pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    // Animation frames stop when the tab or window isn't being drawn (background
    // tab, window behind others), so a timer backs them up; whichever is first runs.
    const run = () => pending && scan();
    requestAnimationFrame(run);
    setTimeout(run, 120);
  }

  function scan() {
    pending = false;
    if (!S.enabled) return;
    myHandle = myHandle || ownHandle();
    const page = pageCtx();
    for (const root of document.querySelectorAll(POST)) {
      if (root.parentElement && root.parentElement.closest(POST)) continue; // quoted post
      try {
        processPost(root, page);
        layoutSide(root);
        applyMosaic(root);
      } catch (err) {
        console.debug('[quiettl]', err);
      }
    }
    if (S.declutter.popups) closeNags();
    if (S.declutter.upsells) hideUpsellCallouts();
    navTooltips();
    outlineChecks();
    // X's share button has no tooltip; give it one (its own, translated label)
    for (const b of document.querySelectorAll('button[data-engagement-action="share"]:not([data-xs-tip])')) {
      b.dataset.xsTip = b.getAttribute('aria-label') || 'Share';
    }
  }

  // Icon-only menu: tooltip with the item's name, styled like X's own tooltips.
  function navTooltips() {
    const nav = document.querySelector('nav a[href="/home"]')?.closest('nav');
    if (!nav) return;
    for (const el of nav.querySelectorAll('a, button')) {
      const label = el.textContent.trim();
      if (S.declutter.navIcons && label) {
        if (el.dataset.xsTip !== label) el.dataset.xsTip = label;
      } else if (el.dataset.xsTip) {
        delete el.dataset.xsTip;
      }
    }
  }

  const tip = document.createElement('div');
  tip.id = 'quiettl-tip';
  tip.className = 'rounded-xs bg-(--x-tooltip-bg) text-(--x-tooltip-fg) px-2 py-1 text-subtext3'; // X's tooltip classes
  // Same timing as X's tooltips: appear after ~1s of hovering, hide on leave.
  const TIP_DELAY = 1000;
  let tipTimer = null;
  let tipFor = null;
  const hideTip = () => {
    clearTimeout(tipTimer);
    tipFor = null;
    tip.classList.remove('xs-show');
  };
  window.addEventListener('mouseover', (e) => {
    const el = e.target.closest && e.target.closest('[data-xs-tip]');
    if (el === tipFor) return;
    hideTip();
    if (!el) return;
    tipFor = el;
    tipTimer = setTimeout(() => {
      if (!el.isConnected) return;
      const r = el.getBoundingClientRect();
      tip.textContent = el.dataset.xsTip;
      if (!tip.isConnected) document.body.appendChild(tip);
      const below = !!el.closest('[role="group"]'); // post action buttons: below, like X's
      tip.classList.toggle('xs-below', below);
      tip.style.left = `${Math.round(below ? r.left + r.width / 2 : r.right + 8)}px`;
      tip.style.top = `${Math.round(below ? r.bottom + 4 : r.top + r.height / 2)}px`;
      tip.classList.add('xs-show');
    }, TIP_DELAY);
  });
  window.addEventListener('pointerdown', hideTip, true);
  window.addEventListener('scroll', hideTip, true);

  // Outlined verified checkmarks: our own symbols, same colors as X's.
  const CHECKS = { premium: '#1d9bf0', business: '#d18800', government: '#829aab' };
  function ensureCheckSprite() {
    if (document.getElementById('quiettl-sprite')) return;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.id = 'quiettl-sprite';
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    svg.innerHTML = Object.entries(CHECKS)
      .map(
        ([k, c]) =>
          `<symbol id="xs-check-${k}" viewBox="0 0 24 24"><path d="M12 1.75c1.4 0 2.62.87 3.34 2.19 1.44-.43 2.92-.17 3.91.81s1.24 2.47.81 3.91c1.32.72 2.2 1.94 2.2 3.34s-.88 2.62-2.2 3.34c.43 1.44.18 2.92-.81 3.9-.99 1-2.47 1.25-3.91.82-.72 1.32-1.94 2.19-3.34 2.19s-2.62-.87-3.34-2.2c-1.44.44-2.92.18-3.9-.8-1-.99-1.24-2.47-.82-3.91-1.32-.72-2.19-1.95-2.19-3.34 0-1.4.87-2.62 2.2-3.34-.43-1.44-.18-2.92.8-3.9.99-1 2.47-1.25 3.91-.82.72-1.32 1.95-2.19 3.34-2.19z" fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/>` +
          `<path d="M8.2 12.3l2.6 2.6 5-5.4" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>`,
      )
      .join('') +
      // Share icons (X's looks like "upload")
      '<symbol id="xs-share-forward" viewBox="0 0 24 24"><path d="M14 5.5 20.5 12 14 18.5M20 12h-8.5C7.4 12 4 15.4 4 19.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>' +
      '<symbol id="xs-share-nodes" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="17.5" cy="5.5" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="18.5" r="2.5"/><path d="m8.7 10.7 6.6-3.9m-6.6 6.5 6.6 3.9"/></g></symbol>';
    document.body.appendChild(svg);
  }
  function swapShareIcons() {
    const want = S.declutter.shareIcon;
    for (const u of document.querySelectorAll('use[href="#icon-share-ios"], use[data-xs-share]')) {
      if (want !== 'x') {
        u.dataset.xsShare = '1';
        u.setAttribute('href', `#xs-share-${want}`);
      } else {
        u.setAttribute('href', '#icon-share-ios');
        delete u.dataset.xsShare;
      }
    }
  }

  function outlineChecks() {
    const on = S.declutter.outlineChecks;
    if ((on || S.declutter.shareIcon !== 'x') && document.body) ensureCheckSprite();
    swapShareIcons();
    for (const u of document.querySelectorAll('use[href^="#icon-verified-"], use[data-xs-orig]')) {
      const href = u.getAttribute('href');
      if (on && href.startsWith('#icon-verified-')) {
        const kind = /business/.test(href) ? 'business' : /government/.test(href) ? 'government' : 'premium';
        u.dataset.xsOrig = href;
        u.setAttribute('href', `#xs-check-${kind}`);
      } else if (!on && u.dataset.xsOrig) {
        u.setAttribute('href', u.dataset.xsOrig);
        delete u.dataset.xsOrig;
      }
    }
  }

  const navStyle = document.createElement('style');
  navStyle.id = 'quiettl-nav';
  function applyNavVisibility() {
    const hidden = XS.NAV_ITEMS.filter(([k]) => S.enabled && S.nav[k] === false).map(([, , sel]) => `nav ${sel}`);
    navStyle.textContent = hidden.length ? `${hidden.join(',\n')} { display: none !important; }` : '';
    if (!navStyle.isConnected) document.documentElement.appendChild(navStyle);
  }

  // In-page upsell boxes ("you aren't verified yet", …): no stable markup, match text.
  const UPSELL = /aren.t verified yet|get verified|subscribe to premium|upgrade to premium|premium\+? (?:is|gives)/i;
  function hideUpsellCallouts() {
    for (const c of document.querySelectorAll('[data-slot="xds-callout"]:not([data-xs-checked])')) {
      c.setAttribute('data-xs-checked', '');
      if (UPSELL.test(c.textContent.slice(0, 300))) (c.parentElement || c).setAttribute('data-xs-gone', '');
    }
  }

  // Re-apply remembered hidden/collapsed states synchronously (runs before
  // layout and paint, so X's list measures the post at its final size).
  function applyKnownSize(node) {
    if (node.nodeType !== 1 || !sizeState.size) return;
    const roots = node.matches(POST) ? [node] : node.querySelectorAll(POST);
    for (const root of roots) {
      const m = /\/status\/(\d+)/.exec(root.getAttribute('data-href') || '');
      const st = m && sizeState.get(m[1]);
      if (!st || revealed.has(m[1])) continue;
      if (st.hidden) {
        const cell = root.closest('li[data-index]');
        if (cell) cell.dataset.xsHidden = '1';
      } else if (st.why) {
        root.dataset.xsState = 'collapsed';
        root.dataset.xsWhy = st.why;
      }
    }
  }

  new MutationObserver((muts) => {
    if (S.enabled && sizeState.size) for (const m of muts) for (const n of m.addedNodes) applyKnownSize(n);
    if (S.repost.media === 'unload') {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType === 1 && (n.matches(MEDIA_IMG) || n.querySelector(MEDIA_IMG))) {
            scan(); // now, not next frame: before the image starts downloading
            return;
          }
        }
      }
    }
    for (const m of muts) {
      if (m.type === 'childList' || m.target.parentElement?.closest('article div[dir="auto"]')) {
        schedule();
        return;
      }
    }
  }).observe(document.documentElement, { subtree: true, childList: true, characterData: true });

  // No autoplay for flagged posts: pause any play that you didn't start.
  document.addEventListener(
    'play',
    (e) => {
      const v = e.target;
      if (!v || v.tagName !== 'VIDEO' || !S.enabled) return;
      // The video may mount before the post has been processed — do it now.
      const root = v.closest(POST);
      if (root && !root.dataset.xsKey) {
        try {
          processPost(root, pageCtx());
        } catch (_) {}
      }
      if (v.closest('[data-xs-noplay]')) v.pause();
    },
    true,
  );
  // Pressing on the video (or its controls) counts as you starting it.
  window.addEventListener(
    'pointerdown',
    (e) => {
      const root = e.target.closest && e.target.closest('[data-xs-noplay]');
      if (!root || !e.target.closest('article [data-press-control], article video')) return;
      const info = readPost(root);
      if (info) playAllowed.add(info.id);
      delete root.dataset.xsNoplay;
    },
    true,
  );

  // "Not interested" button: open the post's ⋯ menu and pick X's own item
  // (found by its icon, so it works in any language).
  window.addEventListener(
    'click',
    async (e) => {
      const btn = e.target.closest && e.target.closest('.xs-ni');
      if (!btn) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const article = btn.closest('article');
      const more = [...article.querySelectorAll('button[aria-haspopup="menu"]:not([data-engagement-action])')].find(
        (b) => !b.closest('[role="group"]') && !b.closest(POST + ' ' + POST),
      );
      if (!more) return;
      // Keep the menu invisible while we use it (it still opens and loads normally).
      const html = document.documentElement;
      html.setAttribute('data-xs-menu-busy', '');
      const done = () => setTimeout(() => html.removeAttribute('data-xs-menu-busy'), 400);
      more.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      more.click();
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 50));
        const item = [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].find((m) => m.querySelector('svg[data-icon="icon-emoji-sad"]'));
        if (item) {
          // X's menu needs a real press/release sequence, not just a click event.
          const o = { bubbles: true, cancelable: true, pointerType: 'mouse', button: 0, buttons: 1, isPrimary: true };
          item.dispatchEvent(new PointerEvent('pointerdown', o));
          item.dispatchEvent(new MouseEvent('mousedown', o));
          item.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }));
          item.dispatchEvent(new MouseEvent('mouseup', { ...o, buttons: 0 }));
          item.dispatchEvent(new MouseEvent('click', { ...o, buttons: 0 }));
          done();
          setTimeout(() => document.activeElement && document.activeElement.blur(), 50); // no lingering focus ring
          return;
        }
      }
      // not offered: close the menu again
      const menu = document.querySelector('[role="menu"]');
      if (menu) menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      done();
      setTimeout(() => document.activeElement && document.activeElement.blur(), 50);
    },
    true,
  );

  // Click a collapsed post to reveal it; click blurred media to show it.
  window.addEventListener(
    'click',
    (e) => {
      if (!e.target.closest) return;
      const toggle = e.target.closest('.xs-toggle');
      if (toggle) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const root = toggle.closest(POST);
        const info = root && readPost(root);
        if (!info) return;
        if (revealed.has(info.id)) revealed.delete(info.id);
        else revealed.add(info.id);
        if (revealed.has(info.id)) delete root.dataset.xsState;
        hideTip();
        updateSizeCss();
        schedule();
        return;
      }
      // links in a collapsed post's header (name, handle, date) work as usual
      const collapsed = !e.target.closest('a, button') && e.target.closest('[data-xs-state="collapsed"]');
      const blurred = !collapsed && e.target.closest('[data-xs-media="blur"], [data-xs-media="unload"]');
      const onMedia = blurred && e.target.closest('article [data-press-control], article video, article img, article div.rounded-md');
      const root = collapsed || (onMedia && blurred);
      if (!root) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const info = readPost(root);
      if (collapsed) {
        if (info) revealed.add(info.id);
        updateSizeCss();
        delete root.dataset.xsState;
      } else {
        if (info) mediaRevealed.add(info.id);
        delete root.dataset.xsMedia;
        restoreMedia(root);
      }
      schedule();
    },
    true,
  );

  // ---------- in-page settings panel (toolbar button) ----------

  const PANEL_ORIGIN = new URL(chrome.runtime.getURL('')).origin;
  let panel = null;

  function closePanel() {
    if (!panel) return;
    panel.remove();
    panel = null;
  }

  function togglePanel() {
    if (panel) return closePanel();
    panel = document.createElement('iframe');
    panel.id = 'quiettl-panel';
    panel.src = chrome.runtime.getURL('popup/popup.html');
    panel.setAttribute('title', 'Quiet Timeline settings');
    document.documentElement.appendChild(panel);
  }

  window.addEventListener('message', (e) => {
    if (e.origin !== PANEL_ORIGIN || !panel || e.source !== panel.contentWindow || !e.data) return;
    if (e.data.quiettlPanel === 'close') closePanel();
    if (typeof e.data.quiettlPanelHeight === 'number') panel.style.height = `${Math.ceil(e.data.quiettlPanelHeight)}px`;
  });
  window.addEventListener('keydown', (e) => e.key === 'Escape' && closePanel(), true);
  window.addEventListener('pointerdown', (e) => panel && e.target !== panel && closePanel(), true);

  // ---------- settings ----------

  function applySettings(raw) {
    const prevEnabled = S.enabled;
    S = XS.merge(XS.DEFAULTS, raw);
    ver++;
    filter = XS.createWordFilter(S);
    allow = new Set(XS.parseList(S.allow));
    repostList = new Set(XS.parseList(S.repost.list));
    langCache.clear();

    const root = document.documentElement;
    const on = S.enabled;
    const flag = (name, cond, val = '') => (on && cond ? root.setAttribute(name, val) : root.removeAttribute(name));
    flag('data-xs-upsells', S.declutter.upsells);
    flag('data-xs-sidebar', S.declutter.sidebar);
    flag('data-xs-logo', S.declutter.logo);
    flag('data-xs-navicons', S.declutter.navIcons);
    flag('data-xs-profile-top', S.declutter.profileTop);
    flag('data-xs-narrow-tabs', S.declutter.narrowTabs);
    flag('data-xs-noborders', S.declutter.borders);
    flag('data-xs-rounded', S.declutter.rounded);
    flag('data-xs-views-inline', S.declutter.viewsInline);
    flag('data-xs-paid-check', true, S.paid.check);
    flag('data-xs-blur', true, S.blurStyle);
    flag('data-xs-blur-mono', S.blurMono);
    if (on && S.blurStyle === 'contour') ensureContourFilters();
    root.style.setProperty('--xs-card-radius', `${S.declutter.cardRadius}px`);
    root.style.setProperty('--xs-search-radius', `${S.declutter.searchRadius}px`);
    root.style.setProperty('--xs-media-radius', `${S.declutter.mediaRadius}px`);
    root.style.setProperty('--xs-banner-radius', `${S.declutter.bannerRadius}px`);
    root.style.setProperty('--xs-menu-radius', `${S.declutter.menuRadius}px`);
    XS.theme.apply(S.theme, on);
    applyNavVisibility();

    if (!on && prevEnabled) clearAll();
    updateSizeCss();
    schedule();
  }

  chrome.storage.sync.get('settings', (r) => applySettings(r && r.settings));
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === 'sync' && ch.settings) applySettings(ch.settings.newValue);
  });

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg && msg.type === 'quiettl-toggle-panel') {
      togglePanel();
      reply({ ok: true });
      return;
    }
    if (msg && msg.type === 'quiettl-stats') {
      const out = {};
      for (const [k, v] of Object.entries(stats)) out[k] = v.size;
      reply(out);
    }
  });
})(globalThis.XS);
