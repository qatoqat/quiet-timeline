// X serves two web apps with different markup:
//   new ("x-web"): a post is a role=link box whose data-href is its permalink, wrapping an <article>;
//                  quoted posts are the same kind of box nested inside it.
//   old ("responsive-web"): a post is article[data-testid=tweet]; quoted posts are plain role=link divs inside it.
// Selectors are kept whole; never build one by joining selector lists (a list joined with a
// descendant combinator matches far more than intended).
import type { PostInfo } from './shared/types';
import { cloneThemed } from './theme';

export interface App {
  canUnload: boolean;
  buttonsRelative: boolean;
  read(root: HTMLElement): PostInfo | null;
  isAd(root: HTMLElement, info: PostInfo): boolean;
  dateLink(root: HTMLElement, id: string): HTMLElement | undefined;
  views(root: HTMLElement, id: string): string; // the view count as the action bar shows it, '' if none
  article(root: HTMLElement): HTMLElement | null;
  avatar(article: HTMLElement): HTMLElement | null;
  // the action bar's child holding bookmark (new app: the bookmark/share box)
  bookmarkCell(root: HTMLElement): HTMLElement | null | undefined;
  blocks(article: HTMLElement, root: HTMLElement): HTMLElement[];
  mediaBox(root: HTMLElement): HTMLElement | null | undefined;
  toggleSlot(root: HTMLElement): { slot: HTMLElement | null; before: Node | null };
  niButton(bookmarkCell: HTMLElement): HTMLElement;
  moreButton(article: HTMLElement): HTMLElement | undefined;
  isNIItem(item: Element): boolean;
  closeMenu(menu: Element): void;
  collapseCss(sel?: string): string;
}

const PERMALINK = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/;
export const MEDIA_IMG = 'img[src*="pbs.twimg.com/media/"], img[src*="video_thumb"], img[src*="/card_img/"]';
export const ANY_MEDIA = `video, ${MEDIA_IMG}`; // a post's photos / videos / card images
const SAD_FACE =
  '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 16.2c1.9-1.8 5.1-1.8 7 0"/></g><circle cx="9" cy="10" r=".8" fill="currentColor"/><circle cx="15" cy="10" r=".8" fill="currentColor"/>';

const all = (root: ParentNode, sel: string): HTMLElement[] => [...root.querySelectorAll<HTMLElement>(sel)];
const outsideOf = (quotes: Element[]) => (el: Element) => !quotes.some((q) => q.contains(el));

const NEW_POST = '[role="link"][data-href*="/status/"]';
const NEW_HEADER = "[class*='@container/post-actions']";

export const NEW: App = {
  canUnload: true, // photos are <img>, so they can be kept from loading
  buttonsRelative: false,

  read(root) {
    const m = PERMALINK.exec(root.getAttribute('data-href') || '');
    if (!m) return null;
    const [, handle, id] = m;
    const outside = outsideOf(all(root, NEW_POST));
    // display name: the profile link with text (the avatar link has none) that isn't the @handle
    // (a name may itself start with "@")
    const named = all(root, `a[href="/${handle}" i]`).filter((a) => outside(a) && (a.textContent || '').trim());
    const nameLink = named.find((a) => a.textContent!.trim().toLowerCase() !== `@${handle}`.toLowerCase()) || named[0];
    const nameEl = nameLink ? nameLink.parentElement : null;
    const texts = all(root, 'article div[dir="auto"]');
    const main = texts.find(outside);
    // the checkmark's icon (outlined: the original is kept in data-xs-orig)
    const paidIcon = all(root, 'use[href^="#icon-verified-"], use[data-xs-orig^="#icon-verified-"]').some(
      (u) => outside(u) && /premium/.test(u.dataset.xsOrig || u.getAttribute('href') || ''),
    );
    return { id, handle, nameEl, texts, text: main ? main.textContent || '' : '', paidIcon };
  },
  // promoted posts have no timestamp (their label is in X's language)
  isAd: (root, info) => !!root.querySelector(`:scope > article ${NEW_HEADER}`) && !NEW.dateLink(root, info.id),
  dateLink: (root, id) => all(root, `a[href$="/status/${id}"][data-base-ui-tooltip-trigger]`).find((a) => !a.closest('[role="group"]')),
  // while a changed count rolls, its digits show both numbers and a screen-reader copy holds the new one
  views(root, id) {
    const a = root.querySelector(`[role="group"] a[href$="/status/${id}/analytics"]`);
    return (a ? (a.querySelector('.sr-only') || a).textContent || '' : '').trim();
  },

  article: (root) => root.querySelector<HTMLElement>(':scope > article'),
  avatar: (article) => article.querySelector<HTMLElement>('[data-post-avatar]'),
  bookmarkCell: (root) => root.querySelector<HTMLElement>(':scope > article [role="group"] > div:has([data-engagement-action="bookmark"])'),
  blocks: (article, root) =>
    all(article, `div.rounded-md.overflow-hidden, ${NEW_POST}`).filter(
      (el) => el !== root && !el.closest('[role="group"]') && el.parentElement!.closest(NEW_POST) === root,
    ),
  mediaBox: (root) =>
    all(root, ':scope > article div.rounded-md.overflow-hidden').find((b) => b.querySelector(`${ANY_MEDIA}, img[data-xs-src]`) && b.closest(NEW_POST) === root),
  toggleSlot(root) {
    const header = root.querySelector(`:scope > article ${NEW_HEADER}`);
    const slot = header && (header.lastElementChild as HTMLElement | null);
    return { slot, before: slot && slot.firstChild };
  },

  niButton(cell) {
    const bm = cell.querySelector('[data-engagement-action="bookmark"] button');
    const pill = bm && bm.querySelector(':scope > span');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = bm ? bm.className : '';
    const svg = `<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">${SAD_FACE}</svg>`;
    b.innerHTML = pill ? `<span class="${pill.className}">${svg}</span>` : svg;
    return b;
  },
  moreButton: (article) =>
    all(article, 'button[aria-haspopup="menu"]:not([data-engagement-action])').find(
      (b) => !b.closest('[role="group"]') && b.closest(NEW_POST) === article.parentElement,
    ),
  isNIItem: (item) => !!item.querySelector('svg[data-icon="icon-emoji-sad"]'),
  closeMenu(menu) {
    const at = menu.contains(document.activeElement) ? document.activeElement! : menu;
    at.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
  },

  // Collapsed post: header row only, no avatar/text/media/actions; posts without that header fall back
  // to a one-line note. `sel` selects the post box (for one id, or by state).
  collapseCss(sel) {
    const H = NEW_HEADER;
    const has = `${sel}:has(> article ${H})`;
    const not = `${sel}:not(:has(> article ${H}))`;
    return [
      `${has} > article > :not(:has(${H})), ${has} > article > div > :not(:has(${H})) > *, ${has} > article :has(> ${H}) ~ *, ${has} > article :has(> ${H}) > :not(${H}), ${has} ${H} > :last-child > :not(.xs-toggle, [data-slot='xds-menu-trigger']) { display: none !important; }`,
      `${has} > article { opacity: 0.6; transition: opacity 0.15s; } ${has}:hover > article { opacity: 1; }`,
      `${not} > * { display: none !important; }`,
      `${not}::before { content: '⊘  ' attr(data-xs-why) '  ·  click to show'; display: block; padding: 10px 16px; font: 13px/1.4 system-ui, sans-serif; color: var(--x-fg-secondary, #8b8f97); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }`,
    ].join('\n');
  },
};

const OLD_POST = 'article[data-testid="tweet"]';
const OLD_QUOTE = 'div[role="link"]:has([data-testid="User-Name"])';
const BOOKMARK = ':is([data-testid="bookmark"], [data-testid="removeBookmark"])';

export const OLD: App = {
  canUnload: false, // photos are background images: blur instead of "don't load"
  buttonsRelative: true, // nearly every element is position:relative

  read(root) {
    const outside = outsideOf(all(root, OLD_QUOTE));
    // permalink: the timestamp link; else the views link in the action bar
    let m: RegExpExecArray | null = null;
    for (const a of all(root, 'a[href*="/status/"]')) {
      if (!outside(a)) continue;
      const r = PERMALINK.exec(a.getAttribute('href') || '');
      if (!r) continue;
      if (a.querySelector('time')) {
        m = r;
        break;
      }
      if (!m && a.closest('[role="group"]')) m = r;
    }
    const un = all(root, '[data-testid="User-Name"]').find(outside);
    if (!m || !un) return null;
    const texts = all(root, '[data-testid="tweetText"]');
    const main = texts.find(outside);
    return {
      id: m[2],
      handle: m[1],
      nameEl: un.firstElementChild as HTMLElement | null,
      texts,
      text: main ? main.textContent || '' : '',
      paidIcon: !!un.querySelector('svg[data-testid="icon-verified"]'),
      noTime: ![...root.querySelectorAll('time')].some(outside),
    };
  },
  // promoted posts have no timestamp
  isAd: (root, info) => !!info.noTime && !!root.closest('[data-testid="placementTracking"]'),
  dateLink: (root, id) => all(root, `a[href$="/status/${id}"]`).find((a) => a.querySelector('time') && !a.closest(OLD_QUOTE)),
  // A changed count slides in while the old number slides out beside it, and X drops the old one when
  // the slide ends: never, in a hidden bar (views by the date)
  views(root, id) {
    const a = root.querySelector(`[role="group"] a[href$="/status/${id}/analytics"]`);
    return (a ? (a.querySelector('[data-testid="app-text-transition-container"]') || a).textContent || '' : '').trim();
  },

  article: (root) => root,
  avatar: (article) => article.querySelector<HTMLElement>('[data-testid="Tweet-User-Avatar"]'),
  // the action bar is flat: bookmark and share have a cell each
  bookmarkCell: (root) => all(root, `[role="group"] > div:has(${BOOKMARK})`).find((c) => !c.closest(OLD_QUOTE)),
  blocks: (article) =>
    all(article, `.r-1867qdf, ${OLD_QUOTE}`).filter((el) => !el.closest('[role="group"]') && !el.parentElement!.closest(OLD_QUOTE)),
  // the blur is on the photo box itself, so the button goes on its parent
  mediaBox: (root) =>
    all(root, '[data-testid="tweetPhoto"], [data-testid="videoPlayer"]').find((b) => !b.closest(OLD_QUOTE))?.parentElement,
  // the row holding [Grok button, ⋯ menu]: the link goes before ⋯
  toggleSlot(root) {
    const caret = all(root, '[data-testid="caret"]').find((c) => !c.closest(OLD_QUOTE));
    for (let e: HTMLElement | null | undefined = caret; e && e !== root; e = e.parentElement) {
      if (e.parentElement && e.parentElement.children.length > 1) return { slot: e.parentElement, before: e };
    }
    return { slot: null, before: null };
  },

  niButton(cell) {
    const b = cloneThemed(cell.querySelector<HTMLElement>(BOOKMARK)!);
    b.removeAttribute('data-testid');
    const svg = b.querySelector('svg');
    if (svg) svg.innerHTML = SAD_FACE;
    return b;
  },
  moreButton: (article) => all(article, '[data-testid="caret"]').find((b) => !b.closest(OLD_QUOTE)),
  isNIItem: (item) => !!item.querySelector('svg path[d^="M12 13.6c1.64-.013 3.278.76 4.284 2.02"]'), // its sad face
  // Escape doesn't close this menu; a click on the backdrop it puts over the page (its first sibling) does
  closeMenu: (menu) => (menu.parentElement?.firstElementChild as HTMLElement | null)?.click(),

  // Collapsed post keeps its header row; the avatar column keeps its width. The content column is the
  // element whose first child holds the name and a later child the action bar. `sel` selects the post
  // (by state, or by id).
  collapseCss: (sel = `${OLD_POST}[data-xs-state="collapsed"]`) =>
    [
      `${sel} [data-testid="Tweet-User-Avatar"] { display: none !important; }`,
      `${sel} div:has(> :first-child [data-testid="User-Name"]):has(> :not(:first-child) [role="group"]) > :not(:first-child) { display: none !important; }`,
      `${sel} { opacity: 0.6; transition: opacity 0.15s; } ${sel}:hover { opacity: 1; }`,
    ].join('\n'),
};

// a selector *list*: don't concatenate it
export const POST = `${NEW_POST}, ${OLD_POST}`;
// where a press on a post's photo / video lands (both apps)
export const MEDIA_PRESS = 'article [data-press-control], article video, [data-testid="videoPlayer"], [data-testid="tweetPhoto"]';
// a post's row in the (virtual) list
export const CELL = 'li[data-index], [data-testid="cellInnerDiv"]';
export const appOf = (root: Element): App => (root.tagName === 'ARTICLE' ? OLD : NEW);

// "Not interested" is a cell of its own just before bookmark, so it can move under the avatar
// with or without bookmark & share.
export function addNI(A: App, bookmarkCell: HTMLElement): void {
  const b = A.niButton(bookmarkCell);
  b.classList.add('xs-ni');
  b.dataset.xsTip = 'Not interested';
  b.setAttribute('aria-label', 'Not interested in this post');
  const cell = document.createElement('div');
  cell.className = 'qt-ni-cell';
  cell.appendChild(b);
  bookmarkCell.before(cell);
}
// top-level post, not a quoted one (new app: the post you opened isn't a post box, so a box inside an
// <article> is a quoted post too)
export const isRoot = (el: Element): boolean =>
  el.tagName === 'ARTICLE' ? el.matches(OLD_POST) : el.matches(NEW_POST) && !el.parentElement?.closest(`${NEW_POST}, article`);
// the top-level post holding el (new app: a quoted post is a post box inside another)
export function topPost(el: Element): HTMLElement | null {
  let root = el.closest<HTMLElement>(POST);
  for (let up = root?.parentElement?.closest<HTMLElement>(POST); up; up = up.parentElement?.closest<HTMLElement>(POST)) root = up;
  return root && isRoot(root) ? root : null;
}
