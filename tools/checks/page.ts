import type { Kit } from './kit';

// Runs in the page: what each page-level setting promises, on and off.
export async function pageChecks(K: Kit, deep: boolean) {
  const { S, D, NAV, add, all, anyVisible, shown, box, cs, visible, transparent, mid, OLD, POST, html, accent, page } = K;
  const T = S.theme;
  const themed = T.preset !== 'off';
  add('theme applied', themed ? html.hasAttribute('data-xs-theme') : !html.hasAttribute('data-xs-theme'), T.preset);
  const font = cs(document.body).fontFamily;
  add(`font: ${T.font}`, T.font === 'system' ? /^system-ui/.test(font) : !/^system-ui/.test(font), font.slice(0, 30));

  // left menu
  const logo = OLD ? 'header[role="banner"] h1 a[aria-label="X"]' : 'div.sticky a[aria-label="X"][href="/home"], nav a[aria-label="X"][href="/home"]';
  add(D.logo ? 'X logo hidden' : 'X logo shown', all(logo).length ? anyVisible(logo) === !D.logo : null);
  const home = all('nav a[href]:not([aria-label="X"])').find(visible); // the first menu item (Home, unless hidden)
  const wide = innerWidth >= 1300; // narrower windows: X itself shows icons only
  if (home) add(D.navIcons ? 'icon-only menu' : 'menu with names', D.navIcons ? box(home).width < 90 : wide ? box(home).width >= 90 : null, `${Math.round(box(home).width)}px`);
  const acct = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"], button[aria-label="Account menu"]');
  if (acct && home) {
    add(D.profileTop ? 'profile button on top' : 'profile button at the bottom', (box(acct).top < box(home).top) === !!D.profileTop);
    if (D.profileTop && D.logo) {
      const gap = Math.round(box(home.querySelector('svg')!).top - box(acct.querySelector('img') || acct).bottom);
      add('profile close to the menu', gap >= 0 && gap <= 60, `${gap}px`);
    }
  }
  if (D.navIcons && home) {
    const pic = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"] [data-testid^="UserAvatar-Container"], button[aria-label="Account menu"] img');
    const post = document.querySelector('[data-testid="SideNav_NewTweet_Button"], a[href="/compose/post"]');
    const xs = [home.querySelector('svg'), pic, post].filter(visible).map((e) => Math.round(mid(e)));
    add('left menu aligned', xs.length > 1 ? Math.max(...xs) - Math.min(...xs) <= 4 : null, xs.join(', '));
  }
  const menu = "nav:has(a[href='/home']):not(:has([role='tab']))"; // the left menu, not a tab strip
  const menuWrong = NAV.filter(([k, , sel]) => all(`${menu} ${sel}`).length && anyVisible(`${menu} ${sel}`) !== !!S.nav[k]).map(([, label]) => label);
  add('menu items as set', !menuWrong.length, menuWrong.join(', '));
  const scroll = all('header *, nav *').filter((e) => cs(e).scrollbarWidth !== 'none' && ((e.scrollWidth > e.clientWidth + 2 && /auto|scroll/.test(cs(e).overflowX)) || (e.scrollHeight > e.clientHeight + 2 && /auto|scroll/.test(cs(e).overflowY) && e.clientHeight < innerHeight - 50)));
  add('no stray scrollbars', !scroll.length && html.scrollWidth <= innerWidth + 1, scroll.map((e) => `${e.tagName} ${e.scrollWidth}x${e.scrollHeight}>${e.clientWidth}x${e.clientHeight}`).join(', '));

  // top bars, tabs, sidebar
  const bars = all('.sticky, [data-testid="primaryColumn"] .r-5zmot').filter((e) => cs(e).backdropFilter !== 'none' && box(e).top < 5 && box(e).width > 300);
  if (D.solidBars) add('solid top bars', !bars.length, bars.map((b) => cs(b).backdropFilter).join(','));
  const line = all(OLD ? '[role="tablist"] [role="tab"][aria-selected="true"] div[style*="background-color"]' : "span[class*='w-(--active-tab-width)']").find(visible);
  // (the old app's line is short already)
  if (line && (D.narrowTabs || !OLD)) add(D.narrowTabs ? 'short tab line' : 'full tab line', (box(line).width <= 60) === !!D.narrowTabs, `${Math.round(box(line).width)}px`);
  const trends = OLD
    ? "[data-testid='sidebarColumn'] :is(section, div[aria-label]):has([data-testid='trend'], [data-testid='UserCell'])"
    : "section:has(a[href^='/i/trending/']), section:has([data-who-to-follow])";
  add(D.sidebar ? 'trends hidden' : 'trends shown', D.sidebar ? !anyVisible(trends) : shown(trends));
  if (D.upsells) add('upsells hidden', !anyVisible("[data-testid='sidebarColumn'] a[href^='/i/premium'], main a[href^='/i/premium_sign_up'], [data-testid='verified_profile_upsell']"));
  const grok = "button[aria-label='Explain this post'], button[aria-label='Grok actions'], [data-testid='GrokDrawer'], [data-slot='xds-dock-window']:has([data-icon='icon-logo-grok'])";
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
      for (let p = d.parentElement; p && !p.matches(POST); p = p.parentElement) if (cs(p).borderLeftWidth !== '0px') return false;
      return (c.borderTopWidth !== '0px' && !transparent(c.borderTopColor)) || (c.borderBottomWidth !== '0px' && !transparent(c.borderBottomColor));
    });
    add('no separator lines inside posts', !inner.length, inner.slice(0, 3).map((d) => String(d.className).slice(0, 40)).join(' | '));
  }

  // corners
  const near = (px: string, want: number) => Math.abs(parseFloat(px) - want) < 1 || (want >= 999 && parseFloat(px) >= 100);
  const card = document.querySelector(OLD ? '[data-testid="sidebarColumn"] .r-1867qdf' : 'section.rounded-2xl');
  if (card) add('sidebar card corners', near(cs(card).borderTopLeftRadius, D.cardRadius), cs(card).borderTopLeftRadius);
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
    ['accentPost', 'Post button in accent', "a[aria-label='Post'][href='/compose/post'], [data-testid='SideNav_NewTweet_Button']"],
    ['accentFollow', 'Follow buttons in accent', "button[aria-label^='Follow @'], [data-testid$='-follow']"],
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
    const dis = document.querySelector("[data-testid='tweetButtonInline'][aria-disabled='true'], main button.bg-btn-primary:disabled");
    if (dis) add('disabled Post button not faded', cs(dis).opacity === '1', cs(dis).opacity);
    const post = "a[aria-label='Post'], [data-testid='SideNav_NewTweet_Button'], main button.bg-btn-primary:not([aria-label]), [data-testid^='tweetButton']";
    const follow = "button[aria-label^='Follow @'], [data-testid$='-follow']";
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
