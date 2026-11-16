import type { Kit } from './kit';

// Runs in the page: what each page-level setting promises, on and off.
export async function pageChecks(K: Kit, deep: boolean) {
  const { S, D, NAV, PAL, add, all, anyVisible, shown, box, cs, visible, transparent, rgb, mid, OLD, POST, html, accent, page } = K;
  const T = S.theme;
  const themed = T.preset !== 'off';
  add('theme applied', themed ? html.hasAttribute('data-xs-theme') : !html.hasAttribute('data-xs-theme'), T.preset);
  // the page's theme colors are exactly the chosen palette (nothing recolors our own variables)
  if (PAL) {
    const v = (k: string) => cs(html).getPropertyValue(`--xs-${k}`).trim().toLowerCase();
    const off = ['bg', 'surface', 'border', 'muted', 'text'].filter((k) => v(k) !== PAL[k].toLowerCase());
    add('theme colors as chosen', !off.length, off.map((k) => `${k} ${v(k)} ≠ ${PAL[k]}`).join(', '));
    // every grey X sets inline (incl. per-element color variables) is on the theme's bg→text ramp
    const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const ramp = ['bg', 'surface', 'border', 'muted', 'text'].map((k) => hexRgb(PAL[k]));
    if (T.softText) ramp[4] = ramp[4].map((x, i) => Math.round(x + (ramp[0][i] - x) * 0.14));
    const onRamp = (c: number[]) =>
      ramp.slice(1).some((b, i) => {
        const a = ramp[i];
        const ab = b.map((x, j) => x - a[j]);
        const t = Math.max(0, Math.min(1, c.reduce((s, x, j) => s + (x - a[j]) * ab[j], 0) / (ab.reduce((s, x) => s + x * x, 0) || 1)));
        return Math.hypot(...c.map((x, j) => x - (a[j] + ab[j] * t))) <= 4;
      });
    const unthemed = new Set<string>();
    for (const e of all('[style*="rgb"]')) {
      for (const d of (e.getAttribute('style') || '').split(';')) {
        if (/^\s*--(xs|qt)-/.test(d)) continue;
        for (const m of d.matchAll(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/g)) {
          const c = [+m[1], +m[2], +m[3]];
          if (Math.max(...c) - Math.min(...c) <= 30 && !onRamp(c)) unthemed.add(d.trim().slice(0, 60));
        }
      }
    }
    add("X's inline greys themed", !unthemed.size, [...unthemed].slice(0, 3).join(' | '));
  }
  const font = cs(document.body).fontFamily;
  add(`font: ${T.font}`, T.font === 'system' ? /^system-ui/.test(font) : !/^system-ui/.test(font), font.slice(0, 30));

  // left menu
  const logo = OLD ? 'header[role="banner"] h1 a[aria-label="X"]' : 'div.sticky a[aria-label="X"][href="/home"], nav a[aria-label="X"][href="/home"]';
  add(D.logo ? 'X logo hidden' : 'X logo shown', all(logo).length ? anyVisible(logo) === !D.logo : null);
  const home = all('nav a[href]:not([aria-label="X"])').find(visible); // the first menu item (Home, unless hidden)
  const wide = innerWidth >= 1300; // narrower windows: X itself shows icons only
  if (home) add(D.navIcons ? 'icon-only menu' : 'menu with names', D.navIcons ? box(home).width < 90 : wide ? box(home).width >= 90 : null, `${Math.round(box(home).width)}px`);
  const acct = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"], button[aria-haspopup="menu"]:has(img[alt^="@"])');
  if (acct && home) {
    add(D.profileTop ? 'profile button on top' : 'profile button at the bottom', (box(acct).top < box(home).top) === !!D.profileTop);
    if (D.profileTop && D.logo) {
      const gap = Math.round(box(home.querySelector('svg')!).top - box(acct.querySelector('img') || acct).bottom);
      add('profile close to the menu', gap >= 0 && gap <= 60, `${gap}px`);
    }
  }
  if (D.navIcons && home) {
    const pic = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"] [data-testid^="UserAvatar-Container"], button[aria-haspopup="menu"] img[alt^="@"]');
    const post = document.querySelector('[data-testid="SideNav_NewTweet_Button"], a.bg-btn-primary[href^="/compose/post"]');
    const xs = [home.querySelector('svg'), pic, post].filter(visible).map((e) => Math.round(mid(e)));
    add('left menu aligned', xs.length > 1 ? Math.max(...xs) - Math.min(...xs) <= 4 : null, xs.join(', '));
    // …in the middle of its column (old app: the scroller's padding once pushed it right)
    const colEl = document.querySelector('header[role="banner"] > div > div > div');
    if (OLD && colEl && xs.length) {
      const c = Math.round(box(colEl).left + colEl.clientWidth / 2);
      add('left menu centered', Math.abs(xs[0] - c) <= 4, `${xs[0]} vs ${c}`);
    }
    // its hover highlight is a circle like the items' (a wide screen stretched it into a flat pill)
    const ab = acct && box(acct);
    if (ab) add('profile button round', Math.abs(ab.width - ab.height) <= 2 && ab.width < 70, `${Math.round(ab.width)}x${Math.round(ab.height)}`);
  }
  const menu = "nav:has(a[href='/home']):not(:has([role='tab']))"; // the left menu, not a tab strip
  const menuWrong = NAV.filter(([k, , sel]) => all(`${menu} ${sel}`).length && anyVisible(`${menu} ${sel}`) !== !!S.nav[k]).map(([, label]) => label);
  add('menu items as set', !menuWrong.length, menuWrong.join(', '));
  // nothing in the left menu cut by a box inside it (an unread badge sticks out of its icon); a stand-in
  // badge where X puts its count, removed again
  const bell = document.querySelector(`${menu} a[href="/notifications"] svg`);
  if (bell && visible(bell)) {
    const fake = document.createElement('div');
    fake.style.cssText = 'position:absolute;top:-6px;left:14px;width:20px;height:20px';
    bell.parentElement!.appendChild(fake);
    const fb = box(fake);
    const cut: string[] = [];
    for (let e = fake.parentElement; e && e !== bell.closest('nav')!.parentElement; e = e.parentElement) {
      const eb = box(e);
      if (cs(e).overflowX !== 'visible' && (eb.right < fb.right - 1 || eb.left > fb.left + 1)) cut.push(`${e.tagName} ${Math.round(eb.width)}px`);
    }
    fake.remove();
    add('menu badges not cut', !cut.length, cut.join(', '));
  }
  const scroll = all('header *, nav *').filter((e) => cs(e).scrollbarWidth !== 'none' && ((e.scrollWidth > e.clientWidth + 2 && /auto|scroll/.test(cs(e).overflowX)) || (e.scrollHeight > e.clientHeight + 2 && /auto|scroll/.test(cs(e).overflowY) && e.clientHeight < innerHeight - 50)));
  add('no stray scrollbars', !scroll.length && html.scrollWidth <= innerWidth + 1, scroll.map((e) => `${e.tagName} ${e.scrollWidth}x${e.scrollHeight}>${e.clientWidth}x${e.clientHeight}`).join(', '));

  // top bars, tabs, sidebar
  // old app: whatever is at the top of the column, by its looks (its classes differ per display mode)
  const pcol = OLD && document.querySelector('[data-testid="primaryColumn"]');
  const cb = pcol && box(pcol);
  const atTop = OLD
    ? cb ? [...new Set([4, 30].flatMap((y) => document.elementsFromPoint(cb.left + cb.width / 2, y)))].filter((e) => pcol!.contains(e) && box(e).width > 300) : []
    : all('.sticky, .sticky > .absolute').filter((e) => box(e).top < 5 && box(e).width > 300);
  const bars = atTop.filter((e) => cs(e).backdropFilter !== 'none');
  if (D.solidBars) add('solid top bars', atTop.length ? !bars.length : null, bars.map((b) => `${cs(b).backdropFilter} ${cs(b).backgroundColor}`).join(','));
  const line = all(OLD ? '[role="tablist"] [role="tab"][aria-selected="true"] div[style*="background-color"]' : "span[class*='w-(--active-tab-width)']").find(visible);
  const tab = document.querySelector('[role="tab"][aria-selected="true"]');
  // short: well inside its tab, not a fixed width. The old app's line is already its label's width (at
  // least 56px, chevron included), which on a narrow strip like Explore's may fill most of the tab.
  const label = OLD && line && line.parentElement;
  const short = line && tab && ((!!label && box(line).width <= Math.max(56, box(label).width) + 4) || box(line).width < box(tab).width * 0.6);
  if (line && tab && (D.narrowTabs || !OLD)) add(D.narrowTabs ? 'short tab line' : 'full tab line', short === !!D.narrowTabs, `${Math.round(box(line).width)}px of ${Math.round(box(tab).width)}px`);
  const trends = OLD
    ? "[data-testid='sidebarColumn'] :is([data-testid='trend'], [data-testid='UserCell'], [data-testid='news_sidebar'])"
    : "section:has(a[href^='/i/trending/']), section:has([data-who-to-follow]:not(:empty))"; // (X hides an empty one itself)
  add(D.sidebar ? 'trends hidden' : 'trends shown', D.sidebar ? !anyVisible(trends) : shown(trends));
  // the right column's search box and footer links: each by its own switch (not by Hide trends)
  const sideSearch = OLD ? "[data-testid='sidebarColumn'] form[role='search']" : "aside form[role='search']";
  const footer = OLD ? "[data-testid='sidebarColumn'] nav a[href*='/tos']" : "aside nav a[href*='/tos']";
  add(D.searchBox ? 'right search box hidden' : 'right search box shown', D.searchBox ? !anyVisible(sideSearch) : shown(sideSearch));
  add(D.footer ? 'footer links hidden' : 'footer links shown', D.footer ? !anyVisible(footer) : shown(footer));
  if (D.upsells) add('upsells hidden', !anyVisible("[data-testid='sidebarColumn'] a[href^='/i/premium'], main a[href^='/i/premium_sign_up'], [data-testid='verified_profile_upsell']"));
  // (also a profile's summary button in its top bar; the composer's own Grok tools stay)
  const grok = "article[data-testid='tweet'] button:has(svg path[d^='M12.745 20.54l10.97-8.19']), [data-testid='primaryColumn'] button:not([data-testid='toolBar'] *):has(> div > svg path[d^='M12.745 20.54l10.97-8.19']), main :is(article, [data-href*='/status/'], div.sticky) button:has(> span > svg[data-icon='icon-logo-grok']), [data-testid='GrokDrawer'], [data-slot='xds-dock-window']:has([data-icon='icon-logo-grok'])";
  add(D.grokButtons ? 'Grok buttons hidden' : 'Grok buttons shown', D.grokButtons ? !anyVisible(grok) : shown(grok));
  const chat = "[data-testid='chat-drawer-root'], [data-slot='xds-dock-window'][data-closed]:has([data-icon='icon-chat'])";
  add(D.chatButton ? 'chat button hidden' : 'chat button shown', D.chatButton ? !anyVisible(chat) : shown(chat));

  // borders
  const col = document.querySelector(OLD ? '[data-testid="primaryColumn"]' : 'main');
  if (D.borders && col) {
    add('center column borders off', transparent(cs(col).borderLeftColor) || cs(col).borderLeftWidth === '0px', cs(col).borderLeftColor);
    const outer = (d: Element) => !d.closest(OLD ? 'article' : POST);
    const lines = all('div', col).filter((d) => outer(d) && visible(d) && cs(d).borderLeftWidth === '0px' && [cs(d).borderTopWidth, cs(d).borderBottomWidth].some((w) => w !== '0px') && (cs(d).borderTopWidth !== '0px' ? !transparent(cs(d).borderTopColor) : !transparent(cs(d).borderBottomColor)));
    for (const d of all('div', col)) {
      const q = box(d);
      if (outer(d) && q.height > 0 && q.height <= 2 && q.width > 200 && !transparent(cs(d).backgroundColor) && cs(d).backgroundColor !== cs(document.body).backgroundColor) lines.push(d);
    }
    add('no separator lines', !lines.length, lines.slice(0, 3).map((d) => String(d.className).slice(0, 40)).join(' | '));
    // one-sided lines inside posts (quoted-post and card frames have all four sides)
    const inner = all(`${OLD ? 'article' : POST} div`, col).filter((d) => {
      const c = cs(d);
      if (!visible(d) || c.borderLeftWidth !== '0px' || c.borderRightWidth !== '0px') return false;
      // up to the top-level post (a card inside can be a post-like link itself)
      for (let p = d.parentElement; p && !(p.matches(POST) && !p.parentElement!.closest(POST)); p = p.parentElement) if (cs(p).borderLeftWidth !== '0px') return false;
      return (c.borderTopWidth !== '0px' && !transparent(c.borderTopColor)) || (c.borderBottomWidth !== '0px' && !transparent(c.borderBottomColor));
    });
    add('no separator lines inside posts', !inner.length, inner.slice(0, 3).map((d) => String(d.className).slice(0, 40)).join(' | '));
  }

  // corners
  const near = (px: string, want: number) => Math.abs(parseFloat(px) - want) < 1 || (want >= 999 && parseFloat(px) >= 100);
  const card = document.querySelector(OLD ? '[data-testid="sidebarColumn"] .r-1867qdf' : 'section.rounded-2xl');
  if (card) add('sidebar card corners', near(cs(card).borderTopLeftRadius, D.cardRadius), cs(card).borderTopLeftRadius);
  // a search pill keeps its whole outline (No borders strips lines in the center column)
  const pill = all(OLD ? "form[role='search'] .r-sdzlij" : "form[role='search'] [data-slot='xds-combobox-input-group']").find(visible);
  if (pill && !transparent(cs(pill).borderLeftColor)) add('search box outlined', !transparent(cs(pill).borderTopColor) && !transparent(cs(pill).borderBottomColor), `${cs(pill).borderTopColor} / ${cs(pill).borderBottomColor}`);
  const search = document.querySelector(OLD ? "[data-testid='sidebarColumn'] form[role='search'] .r-sdzlij" : "form[role='search'] [data-slot='xds-combobox-input-group']");
  if (search) add('search box corners', near(cs(search).borderTopLeftRadius, D.searchRadius), cs(search).borderTopLeftRadius);
  const banner = document.querySelector(OLD ? "a[href$='/header_photo']" : "main div[class*='aspect-[3/1]']");
  if (banner) add('banner corners', near(cs(banner).borderTopLeftRadius, D.bannerRadius), cs(banner).borderTopLeftRadius);

  // accent
  const acc = accent('--qt-accent');
  if (T.accentMode !== 'x' && themed && !OLD) {
    const want = T.accentMode === 'custom' ? T.accentColor : cs(html).getPropertyValue('--xs-accent').trim();
    const got = cs(document.querySelector('[data-theme]') || html).getPropertyValue('--x-fg-brand').trim();
    add('accent override', got.toLowerCase() === want.toLowerCase(), `${got} (want ${want})`);
  }
  for (const [key, label, sel] of [
    ['accentPost', 'Post button in accent', "a.bg-btn-primary[href^='/compose/post'], [data-testid='SideNav_NewTweet_Button']"],
    ['accentFollow', 'Follow buttons in accent', "button.bg-btn-primary[aria-label*='@'], [data-testid$='-follow']"],
    ['accentTabs', 'tab underline in accent', "span[class*='w-(--active-tab-width)'], [role='tablist'] [role='tab'][aria-selected='true'] div[style*='background-color']"],
  ]) {
    const el = all(sel).find(visible);
    if (T[key] && el && themed) add(label, cs(el).backgroundColor === acc, `${cs(el).backgroundColor} vs ${acc}`);
  }

  // calm: quiet buttons, muted menu icons except the active page, disabled Post not faded
  const dark = parseInt(cs(document.body).backgroundColor.match(/\d+/)?.[0] || '0') < 128;
  if (T.calm && themed) {
    if (home) {
      const svgs = all('a[href] svg', home.closest('nav')!).filter(visible);
      const active = svgs.filter((v) => v.closest('a')!.getAttribute('href') === page);
      const others = svgs.filter((v) => !active.includes(v));
      if (active.length && others.length) add('menu icons muted, active bright', cs(others[0]).color !== cs(active[0]).color, `${cs(others[0]).color} vs ${cs(active[0]).color}`);
    }
    // composer icons: the muted color as painted (a filter on the way up changes what you see)
    const bar = document.querySelector(OLD ? '[data-testid="toolBar"]' : 'main div.text-tertiary.grid');
    if (bar) {
      const muted = rgb(cs(html).getPropertyValue('--xs-muted').trim());
      const onScreen = (e: Element) => { for (let p: Element | null = e; p && p !== bar; p = p.parentElement) if (cs(p).opacity === '0') return false; return visible(e); };
      const wrong = all('svg', bar).filter(onScreen).filter((v) => {
        for (let p: Element | null = v; p && p !== bar; p = p.parentElement) if (cs(p).filter !== 'none') return true;
        return cs(v).color !== muted;
      });
      add('composer icons muted', !wrong.length, wrong.map((v) => `${v.closest('button')?.getAttribute('aria-label') || '?'} ${cs(v).color}`).join(', '));
    }
    const dis = document.querySelector("[data-testid='tweetButtonInline'][aria-disabled='true'], main button.bg-btn-primary:disabled");
    // (the old app fades the button's box, not the button)
    let fade = 1;
    for (let e: Element | null = dis; e && e.tagName !== 'MAIN'; e = e.parentElement) fade *= +cs(e).opacity;
    if (dis) add('disabled Post button not faded', fade === 1, String(fade));
    const post = "a.bg-btn-primary[href^='/compose/post'], [data-testid='SideNav_NewTweet_Button'], main button.bg-btn-primary:not([aria-label]), [data-testid^='tweetButton']";
    const follow = "button.bg-btn-primary[aria-label*='@'], [data-testid$='-follow']";
    const mine = (b: Element) => (T.accentPost && b.matches(post)) || (T.accentFollow && b.matches(follow));
    const btns = all("[data-testid='SideNav_NewTweet_Button'], [data-testid$='-follow'], .bg-btn-primary").filter((b) => visible(b) && !mine(b));
    const bright = btns.filter((b) => { const m = cs(b).backgroundColor.match(/\d+/g); return m && +m[0] > 200 && +m[1] > 200 && +m[2] > 200; });
    // old app: accent-filled buttons (inline background) become quiet too
    const xAcc = accent('--xs-accent');
    if (OLD && xAcc) for (const b of all("a[style*='background-color'], button[style*='background-color'], [role='button'][style*='background-color']")) if (visible(b) && cs(b).backgroundColor === xAcc && !mine(b)) bright.push(b);
    add('calm buttons', btns.length && dark ? !bright.length : null, bright.map((b) => b.getAttribute('data-testid') || b.textContent!.trim().slice(0, 12)).join(', '));
  }

  // tooltip: X look, below action buttons
  const tipTarget = deep && all('.xs-ni, [role="group"] [data-xs-tip]').find(visible);
  if (tipTarget) {
    tipTarget.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 1300));
    const tip = document.getElementById('quiettl-tip');
    const q = box(tipTarget);
    const ok = tip && tip.classList.contains('xs-show') && !transparent(cs(tip).backgroundColor) && box(tip).top >= Math.max(q.bottom, q.top + q.height / 2 + 18) - 1;
    add('tooltip styled, below the button', !!ok, tip ? `${cs(tip).backgroundColor} "${tip.textContent}"` : 'no tooltip');
    tipTarget.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
  }
}
