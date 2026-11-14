#!/usr/bin/env node
// End-to-end checks against live X in the dev browser: every setting that has a
// visible effect is asserted on the page, for whichever X web app the tab runs.
//
//   node tools/check.mjs                 current X tab (dev profile, port 9333)
//   node tools/check.mjs --old           switch the tab to X's old app first
//   node tools/check.mjs --url /elonmusk/status/123   open a page first
//   CDP_PORT=9334 node tools/check.mjs   logged-out profile (new app)
//
// A check passes, fails, or is skipped (setting off, or nothing on the page to
// check it against). Exit code 1 if anything failed.
const PORT = process.env.CDP_PORT || 9333;
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const tab = list.find((t) => t.type === 'page' && /^https:\/\/(x|twitter)\.com\//.test(t.url));
if (!tab) throw new Error('no x.com tab');
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let n = 0;
const pending = new Map();
const events = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  } else if (m.method) events.push(m);
};
const send = (method, params = {}) => new Promise((ok) => { const id = ++n; pending.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression, contextId) => {
  const r = await send('Runtime.evaluate', { expression: `(async () => (${expression}))()`, awaitPromise: true, returnByValue: true, ...(contextId ? { contextId } : {}) });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval failed');
  return r.result?.result?.value;
};
setTimeout(() => { console.error('timed out'); process.exit(2); }, 120000).unref();

async function extContext() {
  events.length = 0;
  await send('Runtime.enable');
  await sleep(300);
  const tree = await send('Page.getFrameTree');
  const frameId = tree.result.frameTree.frame.id;
  for (const e of events.filter((e) => e.method === 'Runtime.executionContextCreated' && e.params.context.name.startsWith('Quiet Timeline') && e.params.context.auxData?.frameId === frameId).reverse()) {
    if (await evaluate('typeof XS === "object" && !!XS._debug && !!chrome.runtime?.id', e.params.context.id).catch(() => false)) return e.params.context.id;
  }
  return null;
}

if (flag('--old')) {
  await send('Page.navigate', { url: 'https://x.com/i/topics' });
  await sleep(7000);
  const path = opt('--url') || '/home';
  const r = await evaluate(`(() => { if (![...document.scripts].some((s) => /responsive-web/.test(s.src))) return false; history.pushState({}, '', ${JSON.stringify(path)}); dispatchEvent(new PopStateEvent('popstate')); return true; })()`);
  if (!r) console.log('note: X served the new app even on /i/topics');
  await sleep(6000);
} else if (opt('--url')) {
  await send('Page.navigate', { url: `https://x.com${opt('--url')}` });
  await sleep(9000);
}
// let lazily rendered posts and the extension settle; scroll a little
await evaluate('(async () => { for (let i = 0; i < 3; i++) { scrollBy(0, 900); await new Promise((r) => setTimeout(r, 700)); } scrollTo(0, 0); await new Promise((r) => setTimeout(r, 1200)); })()');

const ctx = await extContext();
if (!ctx) {
  console.log('FAIL  extension loaded — Quiet Timeline content script not found');
  process.exit(1);
}
const S = await evaluate('XS._debug.settings', ctx);

// Runs in the page. Each check → [name, 'pass'|'fail'|'skip', detail].
const checks = async (S) => {
  const out = [];
  const add = (name, ok, detail = '') => out.push([name, ok === null ? 'skip' : ok ? 'pass' : 'fail', detail]);
  const cs = (e) => getComputedStyle(e);
  const visible = (e) => { if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 && cs(e).visibility !== 'hidden' && cs(e).display !== 'none'; };
  const anyVisible = (sel) => [...document.querySelectorAll(sel)].some(visible);
  const transparent = (c) => c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c);
  const app = [...document.scripts].some((s) => /x-web\/x-web/.test(s.src)) ? 'new' : 'old';
  const OLD = app === 'old';
  const POST = OLD ? 'article[data-testid="tweet"]' : '[role="link"][data-href*="/status/"]';
  const roots = [...document.querySelectorAll(POST)].filter((r) => OLD || !r.parentElement.closest(POST));
  const onHome = location.pathname === '/home';
  const D = S.declutter;
  out.push(['app', 'info', `${app} app at ${location.pathname}`]);

  // posts
  const keyed = roots.filter((r) => r.dataset.xsKey).length;
  add('posts processed', roots.length ? keyed >= roots.length - 1 : null, `${keyed}/${roots.length}`);
  // theme
  const root = document.documentElement;
  add('theme applied', S.theme.preset === 'off' ? null : root.hasAttribute('data-xs-theme'), S.theme.preset);
  // logo
  const logo = OLD ? document.querySelector('header[role="banner"] h1 a[aria-label="X"]') : [...document.querySelectorAll('a[aria-label="X"][href="/home"]')].find((a) => a.closest('div.sticky, nav'));
  add('X logo hidden', D.logo && logo ? !visible(logo) : null);
  // Grok / chat buttons
  add('Grok buttons hidden', D.grokButtons ? !anyVisible("button[aria-label='Explain this post'], button[aria-label='Grok actions'], [data-testid='GrokDrawer'], [data-slot='xds-dock-window']:has([data-icon='icon-logo-grok'])") : null);
  add('chat button hidden', D.chatButton ? !anyVisible("[data-testid='chat-drawer-root'], [data-slot='xds-dock-window'][data-closed]:has([data-icon='icon-chat'])") : null);
  // borders
  const col = OLD ? document.querySelector('[data-testid="primaryColumn"]') : document.querySelector('main');
  if (D.borders && col) {
    add('center column borders off', transparent(cs(col).borderLeftColor) || cs(col).borderLeftWidth === '0px', cs(col).borderLeftColor);
    const lines = [...col.querySelectorAll('div')].filter((d) => !d.closest(OLD ? 'article' : POST) && visible(d) && [cs(d).borderTopWidth, cs(d).borderBottomWidth].some((w) => w !== '0px') && ![cs(d).borderTopColor, cs(d).borderBottomColor].every(transparent) && !/^(0px|)$/.test(cs(d).borderTopWidth + cs(d).borderBottomWidth) && (cs(d).borderTopWidth !== '0px' ? !transparent(cs(d).borderTopColor) : !transparent(cs(d).borderBottomColor)));
    add('no separator lines', lines.length === 0, lines.slice(0, 3).map((d) => (d.className || '').toString().slice(0, 40)).join(' | '));
    // one-sided lines inside posts (quoted-post frames have all four sides)
    const inner = [...col.querySelectorAll(`${OLD ? 'article' : POST} div`)].filter((d) => {
      if (!visible(d)) return false;
      const c = cs(d);
      if (c.borderLeftWidth !== '0px' || c.borderRightWidth !== '0px') return false;
      return (c.borderTopWidth !== '0px' && !transparent(c.borderTopColor)) || (c.borderBottomWidth !== '0px' && !transparent(c.borderBottomColor));
    });
    add('no separator lines inside posts', inner.length === 0, inner.slice(0, 3).map((d) => (d.className || '').toString().slice(0, 40)).join(' | '));
  } else add('center column borders off', null);
  // icon-only menu
  const home = document.querySelector('nav a[href="/home"]');
  add('icon-only menu', D.navIcons && home ? home.getBoundingClientRect().width < 90 : null, home ? `${Math.round(home.getBoundingClientRect().width)}px` : '');
  // profile on top
  const acct = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"], button[aria-label="Account menu"]');
  add('profile button on top', D.profileTop && acct && home ? acct.getBoundingClientRect().top < home.getBoundingClientRect().top : null);
  // solid top bar
  const bars = [...document.querySelectorAll('.sticky, [data-testid="primaryColumn"] .r-5zmot')].filter((e) => cs(e).backdropFilter !== 'none' && e.getBoundingClientRect().top < 5 && e.getBoundingClientRect().width > 300);
  add('solid top bars', D.solidBars ? bars.length === 0 : null, bars.map((b) => cs(b).backdropFilter).join(','));
  // side buttons / not interested (home feed only)
  const side = roots.filter((r) => r.dataset.xsSide);
  if (D.sideActions && onHome && side.length) {
    const r = side[0];
    const bm = r.querySelector('[data-testid="bookmark"], [data-testid="removeBookmark"], [data-engagement-action="bookmark"] button');
    const av = r.querySelector('[data-testid="Tweet-User-Avatar"], [data-post-avatar]');
    const br = bm && bm.getBoundingClientRect();
    const ar = av && av.getBoundingClientRect();
    add('bookmark under the avatar', !!(br && ar && Math.abs(br.left + br.width / 2 - (ar.left + ar.width / 2)) < 12 && br.top > ar.bottom), br && ar ? `bm ${Math.round(br.left)},${Math.round(br.top)} av ${Math.round(ar.left)},${Math.round(ar.bottom)}` : '');
  } else add('bookmark under the avatar', D.sideActions && onHome ? (roots.length ? false : null) : null, 'no post got side buttons');
  add('"Not interested" button', D.notInterested && onHome && roots.length ? anyVisible('.xs-ni') : null);
  // views by the date
  const viewsDone = document.querySelectorAll('[data-xs-views]').length;
  const groupViews = OLD ? anyVisible('article [role="group"] a[href$="/analytics"]') : anyVisible('main [role="group"] a[aria-label="View count"]');
  add('views next to the date', D.viewsInline && roots.length ? viewsDone > 0 && !groupViews : null, `${viewsDone} inline, bar copy ${groupViews ? 'visible' : 'hidden'}`);
  // icons
  const checksAll = OLD ? document.querySelectorAll('svg[data-testid="icon-verified"]') : document.querySelectorAll('svg[aria-label="Verified account"] use');
  const checksDone = OLD ? document.querySelectorAll('svg[data-testid="icon-verified"] use.qt-icon') : document.querySelectorAll('use[href^="#xs-check-"]');
  add('outlined checkmarks', D.outlineChecks && checksAll.length ? checksDone.length === checksAll.length : null, `${checksDone.length}/${checksAll.length}`);
  const shares = OLD ? document.querySelectorAll('article [role="group"] svg path[d^="M12 2.59l5.7"]') : document.querySelectorAll('use[href="#icon-share-ios"], use[data-xs-share]');
  const sharesDone = OLD ? document.querySelectorAll('article [role="group"] use.qt-icon[href^="#xs-share-"]') : document.querySelectorAll('use[href^="#xs-share-"]');
  add('share icon', D.shareIcon !== 'x' && shares.length ? sharesDone.length === shares.length : null, `${sharesDone.length}/${shares.length}`);
  // corners
  const near = (px, want) => Math.abs(parseFloat(px) - Math.min(want, 9999)) < 1 || (want >= 999 && parseFloat(px) >= 100);
  const card = OLD ? document.querySelector('[data-testid="sidebarColumn"] .r-1867qdf') : document.querySelector('section.rounded-2xl');
  add('sidebar card corners', card ? near(cs(card).borderTopLeftRadius, D.cardRadius) : null, card ? cs(card).borderTopLeftRadius : '');
  const media = OLD ? document.querySelector('article .r-1867qdf:has([data-testid="tweetPhoto"])') : document.querySelector('article div.rounded-md.overflow-hidden:has(img[src*="pbs.twimg.com/media/"])');
  add('post media corners', media ? near(cs(media).borderTopLeftRadius, D.mediaRadius) : null, media ? cs(media).borderTopLeftRadius : '');
  // avatar blur
  const pfps = roots.filter((r) => r.dataset.xsPfp);
  if ((S.pfp.others || S.pfp.paid) && pfps.length) {
    const img = OLD ? pfps[0].querySelector('[data-testid="Tweet-User-Avatar"] [data-testid^="UserAvatar-Container"] :is(img, div[style*="background-image"])') : pfps[0].querySelector('[data-post-avatar] .x-avatar img');
    add('avatar blur', !!img && /blur|url\(/.test(cs(img).filter), img ? cs(img).filter.slice(0, 40) : 'no avatar');
  } else add('avatar blur', null);
  // media blur
  const blurred = roots.filter((r) => r.dataset.xsMedia === 'blur');
  if (blurred.length) {
    const m = OLD ? blurred[0].querySelector('[data-testid="tweetPhoto"], [data-testid="videoPlayer"]') : blurred[0].querySelector('img[src*="pbs.twimg.com/media/"], video');
    add('media blur', !!m && /blur|url\(/.test(cs(m).filter), m ? cs(m).filter.slice(0, 40) : 'no media element');
  } else add('media blur', null);
  // collapsed posts: one header line with a show link
  const col2 = roots.filter((r) => r.dataset.xsState === 'collapsed');
  if (col2.length) {
    const r = col2[0];
    const link = r.querySelector('.xs-toggle');
    const more = OLD ? r.querySelector('[data-testid="caret"]') : r.querySelector('button[data-slot="xds-menu-trigger"]:not([data-engagement-action])');
    const gap = link && more ? Math.round(more.getBoundingClientRect().left - link.getBoundingClientRect().right) : null;
    add('collapsed = one line + show link', r.getBoundingClientRect().height < 60 && visible(link), `${Math.round(r.getBoundingClientRect().height)}px`);
    add('show link next to the ⋯ menu', gap === null ? null : gap >= 0 && gap < 30, `gap ${gap}px`);
  } else add('collapsed = one line + show link', null);
  // ads
  const adLike = OLD ? roots.filter((r) => !r.querySelector('time') && r.closest('[data-testid="placementTracking"]') && visible(r)) : [];
  add('ads hidden', D.ads && OLD ? adLike.length === 0 : null, adLike.length ? `${adLike.length} visible` : '');
  // calm buttons (no bright white)
  if (S.theme.calm && S.theme.preset !== 'off') {
    const btns = [...document.querySelectorAll("[data-testid='SideNav_NewTweet_Button'], [data-testid$='-follow'], .bg-btn-primary")].filter(visible);
    const bright = btns.filter((b) => { const m = cs(b).backgroundColor.match(/\d+/g); return m && +m[0] > 200 && +m[1] > 200 && +m[2] > 200; });
    add('calm buttons', btns.length ? bright.length === 0 : null, bright.map((b) => b.getAttribute('data-testid') || b.textContent.trim().slice(0, 12)).join(', '));
  }
  return out;
};

const results = await evaluate(`(${checks.toString()})(${JSON.stringify(S)})`);
let failed = 0;
for (const [name, status, detail] of results) {
  if (status === 'fail') failed++;
  const tag = { pass: 'pass', fail: 'FAIL', skip: 'skip', info: '    ' }[status];
  console.log(`${tag.padEnd(5)} ${name}${detail ? `  — ${detail}` : ''}`);
}
ws.close();
process.exit(failed ? 1 : 0);
