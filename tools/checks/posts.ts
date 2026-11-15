import type { Kit } from './kit';

// Runs in the page: what each post-related setting promises, on and off.
export async function postChecks(K: Kit, deep = false) {
  const { S, D, add, all, anyVisible, box, cs, visible, mid, roots, article, avatar, bookmark, share, OLD, POST, onHome, page, html } = K;
  const keyed = roots.filter((r) => r.dataset.xsKey).length;
  add('posts processed', roots.length ? keyed >= roots.length - 1 : null, `${keyed}/${roots.length}`);

  // Under the avatar: bookmark & share on posts tall enough, "Not interested" on top of them
  // (the panel greys it out while bookmark & share is off); it's never shown anywhere else.
  const under = (b: Element | null | undefined, r: HTMLElement) => {
    const a = avatar(r);
    const icon = b && (b.querySelector('svg') || b);
    return !!icon && !!a && visible(icon) && Math.abs(mid(icon) - mid(a)) <= 4 && box(icon).top >= box(a).bottom - 2;
  };
  // clearly tall enough for this many buttons below the avatar
  const tall = (r: HTMLElement, slots: number) => {
    const a = avatar(r);
    const art = article(r);
    return visible(a) && !!art && box(art).bottom - box(a).bottom - 42 >= slots * 36;
  };
  const nis = all('.xs-ni').filter(visible);
  const stray = nis.filter((n) => !under(n, n.closest<HTMLElement>(POST)!));
  add('"Not interested" never in the action bar', !stray.length, stray.length ? `${stray.length} elsewhere` : '');
  if (D.notInterested && D.sideActions && onHome) {
    const missed = roots.filter((r) => r.querySelector('.qt-ni-cell') && !r.dataset.xsSideNi && tall(r, 3));
    add('"Not interested" on tall posts', nis.length || missed.length ? !missed.length : null, `${nis.length} shown, ${missed.length} missed`);
  } else add('"Not interested" not shown', !nis.length, nis.length ? `${nis.length} shown` : '');
  // its post's ⋯ menu has X's item, found as the button finds it (by icon: the label is in X's language);
  // the menu opens unseen and is closed again without picking anything
  const niPost = deep && nis.length ? nis[0].closest<HTMLElement>(POST) : null;
  const more = niPost && (OLD
    ? all('[data-testid="caret"]', niPost).find((b) => !b.closest('div[role="link"]'))
    : all('button[aria-haspopup="menu"]:not([data-engagement-action])', niPost).find((b) => !b.closest('[role="group"]') && b.closest(POST) === niPost));
  if (more) {
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
    add('"Not interested" finds X\'s menu item', menu ? !!menu.querySelector(item) : null, menu ? `${menu.querySelectorAll('[role="menuitem"]').length} items` : 'no menu opened');
    if (menu && OLD) (menu.parentElement?.firstElementChild as HTMLElement | null)?.click(); // its backdrop
    else if (menu) (menu.contains(document.activeElement) ? document.activeElement! : menu).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    await new Promise((res) => setTimeout(res, 400));
    html.removeAttribute('data-xs-menu-busy');
  }

  if (D.sideActions && !/\/status\//.test(page)) {
    const placed = roots.filter((r) => r.dataset.xsSideBm);
    const bad = placed.filter((r) => !under(bookmark(r), r) || !under(share(r), r));
    const missed = roots.filter((r) => r.dataset.xsWantBm && !r.dataset.xsSideBm && bookmark(r) && tall(r, 2));
    const where = (rs: HTMLElement[]) => rs.map((r) => (r.dataset.href || r.querySelector('a[href*="/status/"] time')?.parentElement?.getAttribute('href') || '?') + ` h${Math.round(box(r).height)}`).join(' ');
    add('bookmark & share under the avatar', placed.length || missed.length ? !bad.length && !missed.length : null, `${placed.length} placed, ${bad.length} misplaced, ${missed.length} missed ${where([...bad, ...missed])}`);
    const overlap = placed.filter((r) => {
      const ys = [r.querySelector('.xs-ni'), bookmark(r), share(r)].filter((e) => under(e, r)).map((e) => box(e!.querySelector('svg') || e!).top);
      return ys.some((y, i) => i > 0 && y - ys[i - 1] < 24);
    });
    add('side buttons stacked, not overlapping', placed.length ? !overlap.length : null, overlap.length ? `${overlap.length} posts` : '');
  } else {
    const moved = roots.filter((r) => under(bookmark(r), r) || r.dataset.xsSideBm);
    add('bookmark & share stay in the action bar', roots.length ? !moved.length : null, moved.length ? `${moved.length} moved` : '');
  }

  // views by the date
  const viewsSel = OLD ? 'article [role="group"] a[href$="/analytics"]' : 'main [role="group"] a[href$="/analytics"]';
  // per post: a count by the date hides the bar's copy (posts without a date, like ads, keep theirs)
  const dated = roots.filter((r) => all('[data-xs-views]', r).some((h) => getComputedStyle(h, '::after').content !== 'none') && !r.closest('[data-xs-state="collapsed"]') && r.dataset.xsState !== 'collapsed');
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

  // media corners
  const media = OLD ? document.querySelector('article .r-1867qdf:has([data-testid="tweetPhoto"])') : document.querySelector('article div.rounded-md.overflow-hidden:has(img[src*="pbs.twimg.com/media/"])');
  add('post media corners', media ? Math.abs(parseFloat(cs(media).borderTopLeftRadius) - D.mediaRadius) < 1 : null, media ? cs(media).borderTopLeftRadius : '');

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

  // badges: score numbers by "Score badges", ♻ by "Tag ♻", ◎ by "Single-topic ◎"
  const badges = all('[data-xs-badge]').map((e) => e.dataset.xsBadge || '');
  if (!S.bot.badges) add('no score badges', !badges.some((b) => /\d/.test(b)), badges.filter((b) => /\d/.test(b)).slice(0, 3).join(' | '));
  if (!S.repost.mark) add('no ♻ tags', !badges.some((b) => b.includes('♻')));
  if (!S.repost.themed) add('no ◎ tags', !badges.some((b) => b.includes('◎')));

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
