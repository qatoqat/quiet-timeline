import { NAV_ITEMS } from '../shared/defaults';
import { putStyle, styleEl } from '../theme/vars';
import { st, stats } from './state';
import { SVG_NS, svgDefs } from './media';

// Only dialogs whose text matches one of these get closed — never compose, menus, image viewers etc.
// Nags have no stable markup: X's own wording, in English and Japanese (its display language).
const NAG = new RegExp(
  [
    'one subscription', 'get plus', 'get premium', 'claim offer', 'subscribe to premium', 'upgrade to premium',
    'try premium', 'get verified', 'premium\\+? (?:is|gives|members)',
    'boost your account security', 'two-factor authentication',
    'turn on notifications', 'allow notifications', 'download the (?:x )?app', 'get the app',
    'add a phone number', 'verify your (?:email|phone)', 'try grok', 'meet grok', 'ask grok',
    "what's new on x", "don't miss what's happening",
    'プラスに加入', 'プレミアム(?:プラス)?を入手', 'プレミアム(?:ビジネス|プラス)?に(?:サブスクライブ(?!している)|アップグレード)',
    'プレミアムを(?:今すぐ)?(?:無料で)?試す', '認証を受ける', '二段階認証', '2要素認証', '通知をオンに', '通知を許可',
    'アプリをダウンロード', 'アプリを入手', '電話番号を追加', '電話番号を認証',
    'Grok.{0,16}?(?:お試し|を試す|のご紹介|に質問|に聞いて)', 'いま起きていることを見逃さないで',
  ].join('|'),
  'i',
);
const DISMISS = /^(?:close|not now|maybe later|skip(?: for now)?|dismiss|no,? thanks|閉じる|今はしない|後で試す|スキップ|非表示にする|いいえ)$/i;
const SUBSCRIBE_LINK = 'a[href*="/i/premium"], a[href*="/i/verified"]'; // any language
// X's ✕ (by test id or icon), any language
const CLOSE = '[data-testid="app-bar-close"], :is(button, [role="button"]):has(svg[data-icon^="icon-close"], svg path[d^="M10.59 12L4.54 5.96l1.42-1.42L12 10.59"])';
const closed = new WeakSet<Element>();

export function closeNags(): void {
  for (const d of document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]')) {
    if (closed.has(d) || !d.isConnected) continue;
    // never a reply / compose window or the photo viewer, whatever its text says
    if (d.querySelector('[contenteditable], textarea, article, video, img[src*="pbs.twimg.com/media/"]')) continue;
    const text = d.innerText || '';
    if (!NAG.test(text.slice(0, 600)) && !d.querySelector(SUBSCRIBE_LINK)) continue;
    const btns = [...d.querySelectorAll<HTMLElement>('button, [role="button"]')];
    const btn = btns.find((b) => DISMISS.test((b.getAttribute('aria-label') || b.innerText || '').trim())) || d.querySelector<HTMLElement>(CLOSE);
    if (!btn) continue;
    closed.add(d);
    stats.popups.add(text.slice(0, 40));
    btn.click();
  }
}

// Icon-only menu: tooltip with the item's name, styled like X's own tooltips.
export function navTooltips(): void {
  const nav = document.querySelector('nav a[href="/home"]')?.closest('nav');
  if (!nav) return;
  for (const a of nav.querySelectorAll('a[href]')) {
    const on = a.getAttribute('href') === location.pathname;
    if (on !== a.hasAttribute('data-xs-active')) a.toggleAttribute('data-xs-active', on);
  }
  for (const el of nav.querySelectorAll<HTMLElement>('a, button')) {
    const label = (el.textContent ?? '').trim().replace(/^\d+\+?\s*/, ''); // without the unread count
    if (st.S.enabled && st.S.declutter.navIcons && label) {
      if (el.dataset.xsTip !== label) el.dataset.xsTip = label;
    } else if (el.dataset.xsTip) {
      delete el.dataset.xsTip;
    }
  }
}

const tip = document.createElement('div');
tip.id = 'quiettl-tip';
tip.className = 'rounded-xs bg-(--x-tooltip-bg) text-(--x-tooltip-fg) px-2 py-1 text-subtext3'; // X's tooltip classes
const TIP_DELAY = 1000; // same as X's tooltips
let tipTimer: ReturnType<typeof setTimeout> | undefined;
let tipFor: HTMLElement | null = null;

export function hideTip(): void {
  clearTimeout(tipTimer);
  tipFor = null;
  tip.classList.remove('xs-show');
}

function onMouseOver(e: MouseEvent): void {
  const t = e.target as Element;
  const el = t.closest && t.closest<HTMLElement>('[data-xs-tip]');
  if (el === tipFor) return;
  hideTip();
  if (!el) return;
  tipFor = el;
  tipTimer = setTimeout(() => {
    if (!el.isConnected) return;
    const r = el.getBoundingClientRect();
    tip.textContent = el.dataset.xsTip!;
    if (!tip.isConnected) document.body.appendChild(tip);
    const below = !!el.closest('[role="group"]'); // post action buttons: below, like X's
    tip.classList.toggle('xs-below', below);
    tip.style.left = `${Math.round(below ? r.left + r.width / 2 : r.right + 8)}px`;
    // below the 36px hover circle, not the button box — the old app's buttons are smaller than their circle
    tip.style.top = `${Math.round(below ? Math.max(r.bottom, r.top + r.height / 2 + 18) + 4 : r.top + r.height / 2)}px`;
    tip.classList.add('xs-show');
  }, TIP_DELAY);
}

const CHECKS = { premium: '#1d9bf0', business: '#d18800', government: '#829aab' };

const ensureCheckSprite = () =>
  svgDefs(
    'quiettl-sprite',
    () =>
      Object.entries(CHECKS)
        .map(
          ([k, c]) =>
            `<symbol id="xs-check-${k}" viewBox="0 0 24 24"><path d="M12 1.75c1.4 0 2.62.87 3.34 2.19 1.44-.43 2.92-.17 3.91.81s1.24 2.47.81 3.91c1.32.72 2.2 1.94 2.2 3.34s-.88 2.62-2.2 3.34c.43 1.44.18 2.92-.81 3.9-.99 1-2.47 1.25-3.91.82-.72 1.32-1.94 2.19-3.34 2.19s-2.62-.87-3.34-2.2c-1.44.44-2.92.18-3.9-.8-1-.99-1.24-2.47-.82-3.91-1.32-.72-2.19-1.95-2.19-3.34 0-1.4.87-2.62 2.2-3.34-.43-1.44-.18-2.92.8-3.9.99-1 2.47-1.25 3.91-.82.72-1.32 1.95-2.19 3.34-2.19z" fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/>` +
            `<path d="M8.2 12.3l2.6 2.6 5-5.4" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>`,
        )
        .join('') +
      '<symbol id="xs-share-forward" viewBox="0 0 24 24"><path d="M14 5.5 20.5 12 14 18.5M20 12h-8.5C7.4 12 4 15.4 4 19.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>' +
      '<symbol id="xs-share-nodes" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="17.5" cy="5.5" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="18.5" r="2.5"/><path d="m8.7 10.7 6.6-3.9m-6.6 6.5 6.6 3.9"/></g></symbol>',
  );

function swapShareIcons(want: string): void {
  for (const u of document.querySelectorAll<SVGUseElement>('use[href="#icon-share-ios"], use[data-xs-share]')) {
    if (want !== 'x') {
      u.dataset.xsShare = '1';
      u.setAttribute('href', `#xs-share-${want}`);
    } else {
      u.setAttribute('href', '#icon-share-ios');
      delete u.dataset.xsShare;
    }
  }
}

// Old app: icons are inline <svg> paths, so hide its <g> and add a <use>.
function swapOldIcon(svg: SVGSVGElement, symbol: string | null): void {
  const g = svg.querySelector<SVGGElement>(':scope > g:not(.qt-icon)');
  let use = svg.querySelector<SVGUseElement>(':scope > use.qt-icon');
  if (!symbol) {
    if (use) use.remove();
    if (g) g.style.display = '';
    return;
  }
  if (!use) {
    use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('class', 'qt-icon');
    svg.appendChild(use);
  }
  const vb = (svg.getAttribute('viewBox') || '0 0 24 24').split(' ');
  use.setAttribute('width', vb[2]);
  use.setAttribute('height', vb[3]);
  if (use.getAttribute('href') !== `#${symbol}`) use.setAttribute('href', `#${symbol}`);
  if (g) g.style.display = 'none';
}

const OLD_SHARE_PATH = 'M12 2.59l5.7 5.7';

function oldIcons(want: string, checks: boolean): void {
  for (const p of document.querySelectorAll(`[role="group"] svg path[d^="${OLD_SHARE_PATH}"]`)) {
    const svg = p.closest('svg')!;
    if (svg.dataset.qtv === want) continue; // already done for these settings
    svg.dataset.qtv = want;
    swapOldIcon(svg, want !== 'x' ? `xs-share-${want}` : null);
  }
  const on = String(checks);
  for (const svg of document.querySelectorAll<SVGSVGElement>('svg[data-testid="icon-verified"]')) {
    if (svg.dataset.qtv === on) continue;
    svg.dataset.qtv = on;
    // gold checks carry a gradient; grey ones are plain grey
    const kind = svg.querySelector('linearGradient')
      ? 'business'
      : /829aab|130, 154, 171/i.test(svg.innerHTML + getComputedStyle(svg).color)
        ? 'government'
        : 'premium';
    swapOldIcon(svg, checks ? `xs-check-${kind}` : null);
  }
}

// Also undoes the swaps when the extension is off.
export function outlineChecks(): void {
  const on = st.S.enabled && st.S.declutter.outlineChecks;
  const share = st.S.enabled ? st.S.declutter.shareIcon : 'x';
  if (on || share !== 'x') ensureCheckSprite();
  swapShareIcons(share);
  oldIcons(share, on);
  for (const u of document.querySelectorAll<SVGUseElement>('use[href^="#icon-verified-"], use[data-xs-orig]')) {
    const href = u.getAttribute('href')!;
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

const navStyle = styleEl('quiettl-nav');
// the left menu, not a tab strip (the old app's For you / Following tabs are a <nav> linking /home too)
const MENU = "nav:has(a[href='/home']):not(:has([role='tab']))";

export function applyNavVisibility(): void {
  const hidden = NAV_ITEMS.filter(([k]) => st.S.enabled && st.S.nav[k] === false).map(([, , sel]) => `${MENU} ${sel}`);
  putStyle(navStyle, hidden.length ? `${hidden.join(',\n')} { display: none !important; }` : '');
}

// In-page upsell boxes ("you aren't verified yet", …): one linking to X's subscription pages, else by
// X's wording (English, Japanese).
const UPSELL = /aren.t verified yet|get verified|subscribe to premium|upgrade to premium|premium\+? (?:is|gives)|まだ認証されていません|認証を受ける|プレミアム(?:ビジネス|プラス)?に(?:サブスクライブ(?!している)|アップグレード)/i;

export function hideUpsellCallouts(): void {
  for (const c of document.querySelectorAll('[data-slot="xds-callout"]:not([data-xs-checked])')) {
    c.setAttribute('data-xs-checked', '');
    const upsell = c.querySelector(SUBSCRIBE_LINK) || UPSELL.test((c.textContent ?? '').slice(0, 300));
    if (upsell) (c.parentElement || c).setAttribute('data-xs-gone', '');
  }
}

export function initPage(): void {
  window.addEventListener('mouseover', onMouseOver);
  window.addEventListener('pointerdown', hideTip, true);
  window.addEventListener('scroll', hideTip, true);
}
