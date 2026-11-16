import type { Kit } from './kit';

// Runs in the page: what each post-related setting promises, on and off.
export async function postChecks(K: Kit, deep = false) {
  const { S, D, TRUST, add, all, anyVisible, author, box, cs, visible, mid, roots, article, avatar, bookmark, share, OLD, POST, onHome, page, html } = K;
  const keyed = roots.filter((r) => r.dataset.xsKey).length;
  add('posts processed', roots.length ? keyed >= roots.length - 1 : null, `${keyed}/${roots.length}`);

  // Under the avatar: bookmark & share on posts tall enough, "Not interested" on top of them
  // (the panel greys it out while bookmark & share is off); it's never shown anywhere else.
  const under = (b: Element | null | undefined, r: HTMLElement) => {
    const a = avatar(r);
    const icon = b && (b.querySelector('svg') || b);
    return !!icon && !!a && visible(icon) && Math.abs(mid(icon) - mid(a)) <= 4 && box(icon).top >= box(a).bottom - 2;
  };
  // a carousel of photos reaching under the avatar: its scroller (the buttons go below it; photos that
  // fit sit in one too, but never scroll)
  const carousel = (r: HTMLElement) => {
    for (const m of all('video, img[src*="pbs.twimg.com/media/"], img[src*="video_thumb"], img[src*="/card_img/"]', r))
      for (let e = m.parentElement; e && e !== r; e = e.parentElement) if (/auto|scroll/.test(cs(e).overflowX) && e.scrollWidth > e.clientWidth + 1) {
        if (box(e).left < box(avatar(r)!).right) return e;
        break;
      }
    return null;
  };
  // clearly tall enough for this many buttons below the avatar (and below such a carousel)
  const tall = (r: HTMLElement, slots: number) => {
    const a = avatar(r);
    const art = article(r);
    const c = visible(a) && carousel(r);
    return visible(a) && !!art && box(art).bottom - (c ? box(c).bottom : box(a).bottom) - 42 >= slots * 36;
  };
  const nis = all('.xs-ni').filter(visible);
  const stray = nis.filter((n) => !under(n, n.closest<HTMLElement>(POST)!));
  add('"Not interested" never in the action bar', !stray.length, stray.length ? `${stray.length} elsewhere` : '');
  if (D.notInterested && D.sideActions && onHome) {
    const missed = roots.filter((r) => r.querySelector('.qt-ni-cell') && !r.dataset.xsSideNi && tall(r, 3));
    add('"Not interested" on tall posts', nis.length || missed.length ? !missed.length : null, `${nis.length} shown, ${missed.length} missed`);
  } else add('"Not interested" not shown', !nis.length, nis.length ? `${nis.length} shown` : '');
  // each one's ⋯ menu has X's item (X offers it only on some posts), found as the button finds it (by
  // icon: the label is in X's language); a menu opens unseen and is closed again without picking anything
  const niPosts = deep ? nis.slice(0, 3).map((n) => n.closest<HTMLElement>(POST)!) : [];
  const offered: string[] = [];
  for (const niPost of niPosts) {
    const more = OLD
      ? all('[data-testid="caret"]', niPost).find((b) => !b.closest('div[role="link"]'))
      : all('button[aria-haspopup="menu"]:not([data-engagement-action])', niPost).find((b) => !b.closest('[role="group"]') && b.closest(POST) === niPost);
    if (!more) continue;
    const before = new Set(document.querySelectorAll('[role="menu"]'));
    html.setAttribute('data-xs-menu-busy', '');
    more.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    more.click();
    let menu: Element | undefined;
    for (let i = 0; i < 60 && !menu; i++) {
      await new Promise((res) => setTimeout(res, 50));
      menu = [...document.querySelectorAll('[role="menu"]')].find((m) => !before.has(m) && m.querySelector('[role="menuitem"]'));
    }
    const item = OLD ? '[role="menuitem"] svg path[d^="M12 13.6c1.64-.013 3.278.76 4.284 2.02"]' : '[role="menuitem"] svg[data-icon="icon-emoji-sad"]';
    offered.push(!menu ? 'no menu' : menu.querySelector(item) ? 'yes' : `no (${menu.querySelectorAll('[role="menuitem"]').length} items)`);
    if (menu && OLD) (menu.parentElement?.firstElementChild as HTMLElement | null)?.click(); // its backdrop
    else if (menu) (menu.contains(document.activeElement) ? document.activeElement! : menu).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    await new Promise((res) => setTimeout(res, 400));
    const open = menu && menu.isConnected;
    html.removeAttribute('data-xs-menu-busy');
    if (open) offered.push('menu left open');
  }
  if (niPosts.length) add('"Not interested" only where X\'s menu has it', offered.length ? offered.every((o) => o === 'yes') : null, offered.join(', '));

  if (D.sideActions && !/\/status\//.test(page)) {
    // (a post hidden by a filter keeps the flags of its last layout until its size change comes through)
    const placed = roots.filter((r) => r.dataset.xsSideBm && visible(r));
    const bad = placed.filter((r) => !under(bookmark(r), r) || !under(share(r), r));
    const missed = roots.filter((r) => r.dataset.xsWantBm && !r.dataset.xsSideBm && bookmark(r) && tall(r, 2));
    const where = (rs: HTMLElement[]) => rs.map((r) => (r.dataset.href || r.querySelector('a[href*="/status/"] time')?.parentElement?.getAttribute('href') || '?') + ` h${Math.round(box(r).height)}`).join(' ');
    add('bookmark & share under the avatar', placed.length || missed.length ? !bad.length && !missed.length : null, `${placed.length} placed, ${bad.length} misplaced, ${missed.length} missed ${where([...bad, ...missed])}`);
    const overlap = placed.filter((r) => {
      const ys = [r.querySelector('.xs-ni'), bookmark(r), share(r)].filter((e) => under(e, r)).map((e) => box(e!.querySelector('svg') || e!).top);
      return ys.some((y, i) => i > 0 && y - ys[i - 1] < 24);
    });
    add('side buttons stacked, not overlapping', placed.length ? !overlap.length : null, overlap.length ? `${overlap.length} posts` : '');
    // nor on the post's photos (a carousel reaches under the avatar)
    const onMedia = placed.filter((r) => {
      const c = carousel(r);
      const icons = [r.querySelector('.xs-ni'), bookmark(r), share(r)].filter((e) => under(e, r)).map((e) => box(e!));
      return !!c && icons.some((b) => b.bottom > box(c).top && b.top < box(c).bottom);
    });
    // the bar's own icons stay in their columns whether bookmark & share moved or not
    const like = (r: HTMLElement) => r.querySelector(OLD ? '[role="group"] :is([data-testid="like"], [data-testid="unlike"])' : '[role="group"] [data-engagement-action="like"]');
    // (ads have no date link, so they keep the view count in their bar; the new app's date is a bare link)
    const ownDate = (r: HTMLElement) => (OLD ? !!r.querySelector('a[href*="/status/"] time') : all('a[data-base-ui-tooltip-trigger][href*="/status/"]', r).some((a) => a.getAttribute('href') === r.dataset.href && !a.closest('[role="group"]')));
    const likeX = roots.filter((r) => visible(r) && visible(like(r)) && ownDate(r)).map((r) => Math.round(box(like(r)!).left - box(article(r)!).left));
    add('action bar icons line up', placed.length && likeX.length > 1 ? Math.max(...likeX) - Math.min(...likeX) <= 2 : null, [...new Set(likeX)].join(', '));
    add('side buttons clear of a carousel', placed.length ? !onMedia.length : null, onMedia.map((r) => r.dataset.href || r.querySelector('a[href*="/status/"] time')?.parentElement?.getAttribute('href')).join(' '));
    // a thread line from the avatar down to a reply is cut where the buttons are (its mask: from, to)
    const lined = placed.filter((r) => {
      const l = avatar(r)?.nextElementSibling;
      return !!l && visible(l) && box(l).width <= 4;
    });
    const crossed = lined.filter((r) => {
      const l = avatar(r)!.nextElementSibling!;
      const px = (cs(l).maskImage.match(/-?[\d.]+px/g) || []).map(parseFloat);
      const icons = [r.querySelector('.xs-ni'), bookmark(r), share(r)].filter((e) => under(e, r)).map((e) => box(e!.querySelector('svg') || e!));
      if (px.length !== 4 || !icons.length) return true;
      const top = box(l).top;
      return top + px[0] > Math.min(...icons.map((b) => b.top)) - 4 || top + px[3] < Math.max(...icons.map((b) => b.bottom)) + 4;
    });
    add('thread line goes around the side buttons', lined.length ? !crossed.length : null, `${lined.length} threads${crossed.length ? `, ${crossed.length} crossed` : ''}`);
  } else {
    const moved = roots.filter((r) => under(bookmark(r), r) || r.dataset.xsSideBm);
    add('bookmark & share stay in the action bar', roots.length ? !moved.length : null, moved.length ? `${moved.length} moved` : '');
  }

  // one avatar column down the page, composers' too (the rounded hover inset once moved posts but not
  // the opened one, or not the reply composer that shares its cell)
  // (old app: not a notification's row of faces)
  const avSel = OLD ? '[data-testid="primaryColumn"] [data-testid^="UserAvatar-Container-"]' : 'main article [data-post-avatar]';
  const avX = all(avSel)
    .filter((a) => visible(a) && box(a).width >= 32 && box(a).width <= 48 && !(OLD && a.closest('article:not([data-testid="tweet"])')))
    .map((a) => Math.round(box(a).left));
  add('avatars in one column', avX.length > 1 ? Math.max(...avX) - Math.min(...avX) <= 2 : null, [...new Set(avX)].join(', '));

  // new app: the opened post isn't a post box, so its quoted post once got judged on its own (marks, blur,
  // and a Hide that hid the opened post's row)
  if (!OLD && /\/status\/\d+/.test(page)) {
    const quotes = all('main article [role="link"][data-href*="/status/"]').filter((q) => !q.parentElement!.closest(POST));
    const judged = quotes.filter((q) => q.dataset.xsKey || q.closest('[data-xs-hidden]'));
    add("opened post's quote left alone", quotes.length ? !judged.length : null, `${quotes.length} quoted${judged.length ? `, ${judged.length} judged` : ''}`);
  }

  // views by the date
  const viewsSel = OLD ? 'article [role="group"] a[href$="/analytics"]' : 'main [role="group"] a[href$="/analytics"]';
  // per post: a count by the date hides the bar's copy (posts without a date, like ads, keep theirs)
  const dated = roots.filter((r) => visible(r) && all('[data-xs-views]', r).some((h) => getComputedStyle(h, '::after').content !== 'none') && !r.closest('[data-xs-state="collapsed"]') && r.dataset.xsState !== 'collapsed');
  const twice = dated.filter((r) => all(viewsSel, r).some(visible));
  if (D.viewsInline) add('views next to the date', roots.length ? dated.length > 0 && !twice.length : null, `${dated.length} by the date, ${twice.length} also in the bar`);
  else add('views stay in the action bar', roots.length ? !dated.length && (anyVisible(viewsSel) || !all(viewsSel).length) : null, `${dated.length} by the date`);
  // the bar's current count (a changed count's old number lingers beside it in a hidden bar, old app,
  // or rolls with it, new app)
  const count = (r: HTMLElement) => {
    const a = r.querySelector(viewsSel);
    return a ? ((a.querySelector('[data-testid="app-text-transition-container"], .sr-only') || a).textContent || '').trim() : '';
  };
  const off = dated.filter((r) => all('[data-xs-views]', r).some((h) => h.dataset.xsViews !== count(r)));
  if (D.viewsInline) add('views by the date = the bar\'s current count', dated.length ? !off.length : null, off.map((r) => `${r.querySelector<HTMLElement>('[data-xs-views]')!.dataset.xsViews} vs ${count(r)}`).join(', '));
  // …in the date's own look
  const holder = dated.length ? dated[0].querySelector<HTMLElement>('[data-xs-views]') : null;
  const date = holder && (holder.querySelector('time') || holder.querySelector('a'));
  if (D.viewsInline && holder && date) {
    const [d, v] = [cs(date), getComputedStyle(holder, '::after')];
    const diff = ['font-family', 'font-size', 'color'].filter((k) => d.getPropertyValue(k) !== v.getPropertyValue(k));
    add('views by the date look like the date', !diff.length, diff.map((k) => `${k}: ${v.getPropertyValue(k)} vs ${d.getPropertyValue(k)}`).join('; '));
  }

  // icons
  const checksAll = all(OLD ? 'svg[data-testid="icon-verified"]' : 'use:is([href^="#icon-verified-"], [data-xs-orig^="#icon-verified-"])');
  const checksDone = all(OLD ? 'svg[data-testid="icon-verified"] use.qt-icon' : 'use[href^="#xs-check-"]');
  add(D.outlineChecks ? 'outlined checkmarks' : "checkmarks as X draws them", checksAll.length ? checksDone.length === (D.outlineChecks ? checksAll.length : 0) : null, `${checksDone.length}/${checksAll.length}`);
  const shares = all(OLD ? 'article [role="group"] svg path[d^="M12 2.59l5.7"]' : 'use[href="#icon-share-ios"], use[data-xs-share]');
  const sharesDone = all(OLD ? 'article [role="group"] use.qt-icon[href^="#xs-share-"]' : 'use[href^="#xs-share-"]');
  add(D.shareIcon !== 'x' ? 'share icon replaced' : "X's share icon", shares.length ? sharesDone.length === (D.shareIcon !== 'x' ? shares.length : 0) : null, `${sharesDone.length}/${shares.length}`);
  // paid checkmark: keep / grey / hide
  const paidIcons = all('[data-xs-paid] svg:has(> use:is([href^="#icon-verified-"], [data-xs-orig^="#icon-verified-"])), [data-xs-paid] svg[data-testid="icon-verified"]').filter((i) => visible(i.closest(POST)));
  const pc = S.paid.check;
  const paidOk = (i: HTMLElement) => (pc === 'hide' ? !visible(i) : visible(i) && /grayscale/.test(cs(i).filter) === (pc === 'grey'));
  add(`paid checkmarks: ${pc}`, paidIcons.length ? paidIcons.every(paidOk) : null, `${paidIcons.filter(paidOk).length}/${paidIcons.length}`);

  // media corners: single photos / videos and each tile of a carousel (or of photos side by side)
  const media = all(
    OLD ? 'article .r-1867qdf:has([data-testid="tweetPhoto"]), article [data-testid="ScrollSnap-List"] > div > div' : 'article :is(div.rounded-md, div.rounded-sm.snap-center).overflow-hidden:has(img[src*="pbs.twimg.com/media/"])',
  ).filter(visible);
  // (round: X's squircle corner makes the radius look about half as big)
  const cornerOk = (m: HTMLElement) => Math.abs(parseFloat(cs(m).borderTopLeftRadius) - D.mediaRadius) < 1 && /^(round|superellipse\(1\))?$/.test(cs(m).getPropertyValue('corner-shape').trim());
  const badCorners = media.filter((m) => !cornerOk(m));
  add('post media corners', media.length ? !badCorners.length : null, `${media.length} boxes${badCorners.length ? `, off: ${badCorners.map((m) => `${cs(m).borderTopLeftRadius} ${cs(m).getPropertyValue('corner-shape')}`).join(', ')}` : ''}`);

  // avatar blur: "Not followed" and "Paid checks" each by its own switch
  const pfps = roots.filter((r) => r.dataset.xsPfp);
  const wrong = pfps.filter((r) => !(r.querySelector('[data-xs-paid]') ? S.pfp.paid : S.pfp.others));
  add('avatar blur follows its switches', pfps.length ? !wrong.length : !S.pfp.others && !S.pfp.paid ? true : null, `${pfps.length} blurred, ${wrong.length} against the setting ${wrong.map((r) => r.dataset.href || r.querySelector('time')?.closest('a')?.getAttribute('href')).join(' ')}`);
  const pfp = pfps.find((r) => !r.matches(':hover'));
  if (pfp) {
    const img = pfp.querySelector(OLD ? '[data-testid="Tweet-User-Avatar"] [data-testid^="UserAvatar-Container"] :is(img, div[style*="background-image"])' : '[data-post-avatar] .x-avatar img');
    add('avatar blur drawn', !!img && /blur|url\(/.test(cs(img).filter), img ? cs(img).filter.slice(0, 40) : 'no avatar');
  }
  // media cover
  const covered = roots.filter((r) => r.dataset.xsMedia);
  if (S.repost.media === 'none' && S.replies.media === 'none') add('no media covered', !covered.length, `${covered.length} covered`);
  const blurred = covered.find((r) => r.dataset.xsMedia === 'blur');
  if (blurred) {
    const m = blurred.querySelector(OLD ? '[data-testid="tweetPhoto"], [data-testid="videoPlayer"]' : 'img[src*="pbs.twimg.com/media/"], video');
    add('media blur drawn', !!m && /blur|url\(/.test(cs(m).filter), m ? cs(m).filter.slice(0, 40) : 'no media element');
  }
  const hid = covered.find((r) => r.dataset.xsMedia === 'hide');
  if (hid) add('hidden media gone', !all(OLD ? '[data-testid="tweetPhoto"], [data-testid="videoPlayer"]' : 'img[src*="pbs.twimg.com/media/"], video', hid).some(visible));

  // marks after names: one switch each (♻ aggregator also needs its detection); never on you or
  // accounts you follow
  const marked = all('[data-xs-badge]');
  const badges = marked.map((e) => e.dataset.xsBadge || '');
  const KINDS: [string, string, (b: string) => boolean][] = [
    ['score', 'score', (b) => b.split(' · ').some((p) => /^\d+$/.test(p))],
    ['reposter', '♻ %', (b) => /♻ \d+%/.test(b)],
    ['aggregator', '♻ aggregator', (b) => b.includes('♻ aggregator')],
    ['list', '♻ marked', (b) => b.includes('♻ marked')],
  ];
  for (const [k, label, has] of KINDS) {
    const off = !S.marks[k] || (k === 'aggregator' && !S.repost.aggregators);
    if (off) add(`no ${label} marks`, !badges.some(has), badges.filter(has).slice(0, 3).join(' | '));
  }
  const onTrusted = marked.filter((e) => TRUST.includes(author(e.closest<HTMLElement>(POST)!)));
  add('no marks on you or accounts you follow', marked.length || onTrusted.length ? !onTrusted.length : null, `${marked.length} marks${onTrusted.length ? `, ${onTrusted.length} on: ${onTrusted.map((e) => author(e.closest<HTMLElement>(POST)!)).join(' ')}` : ''}`);

  // collapsed posts: one header line with a show link
  const col = roots.find((r) => r.dataset.xsState === 'collapsed');
  if (col) {
    const link = col.querySelector('.xs-toggle');
    const more = col.querySelector(OLD ? '[data-testid="caret"]' : 'button[data-slot="xds-menu-trigger"]:not([data-engagement-action])');
    const gap = link && more ? Math.round(box(more).left - box(link).right) : null;
    add('collapsed = one line + show link', box(col).height < 60 && visible(link), `${Math.round(box(col).height)}px`);
    add('show link next to the ⋯ menu', gap === null ? null : gap >= 0 && gap < 30, `gap ${gap}px`);
  }
  // ads (old app: promoted posts have no timestamp)
  const ads = OLD ? roots.filter((r) => !r.querySelector('time') && r.closest('[data-testid="placementTracking"]') && visible(r)) : [];
  if (OLD && D.ads) add('ads hidden', !ads.length, ads.length ? `${ads.length} visible` : '');
}
