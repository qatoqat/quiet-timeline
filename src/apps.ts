// X serves two web apps with different markup:
//   new ("x-web"): a post is a role=link box whose data-href is its permalink, wrapping an <article>;
//                  quoted posts are the same kind of box nested inside it.
//   old ("responsive-web"): a post is article[data-testid=tweet]; quoted posts are plain role=link divs inside it.
// Selectors are kept whole; never build one by joining selector lists (a list joined with a
// descendant combinator matches far more than intended).
import type { PostInfo } from './shared/types';

export interface App {
  canUnload: boolean;
  buttonsRelative: boolean;
  read(root: HTMLElement): PostInfo | null;
  isAd(root: HTMLElement, info: PostInfo): boolean;
  dateLink(root: HTMLElement, id: string): HTMLElement | undefined;
  viewsLink(root: HTMLElement, id: string): HTMLElement | null;
  article(root: HTMLElement): HTMLElement | null;
  avatar(article: HTMLElement): HTMLElement | null;
  actionBox(root: HTMLElement): HTMLElement | null | undefined;
  sideAnchor(article: HTMLElement): HTMLElement | null;
  blocks(article: HTMLElement, root: HTMLElement): HTMLElement[];
  mediaBox(root: HTMLElement): HTMLElement | null | undefined;
  toggleSlot(root: HTMLElement): { slot: HTMLElement | null; before: Node | null };
  makeNI(box: HTMLElement): HTMLElement;
  moreButton(article: HTMLElement): HTMLElement | undefined;
  isNIItem(item: Element): boolean;
  collapseCss(sel?: string): string;
}

const PERMALINK = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/;
export const MEDIA_IMG = 'img[src*="pbs.twimg.com/media/"], img[src*="video_thumb"], img[src*="/card_img/"]';
const MEDIA = `video, ${MEDIA_IMG}`;
const SAD_FACE =
  '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 16.2c1.9-1.8 5.1-1.8 7 0"/></g><circle cx="9" cy="10" r=".8" fill="currentColor"/><circle cx="15" cy="10" r=".8" fill="currentColor"/>';

const all = (root: ParentNode, sel: string): HTMLElement[] => [...root.querySelectorAll<HTMLElement>(sel)];
const outsideOf = (quotes: Element[]) => (el: Element) => !quotes.some((q) => q.contains(el));
const ni = (b: HTMLElement) => {
  b.classList.add('xs-ni');
  b.dataset.xsTip = 'Not interested';
  b.setAttribute('aria-label', 'Not interested in this post');
  return b;
};

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
    // display-name link: links to the profile, has text, isn't the avatar
    let nameEl: HTMLElement | null = null;
    for (const a of all(root, `a[href="/${handle}" i]`)) {
      const t = (a.textContent || '').trim();
      if (outside(a) && !a.querySelector('img') && t && !t.startsWith('@')) {
        nameEl = a.parentElement;
        break;
      }
    }
    const texts = all(root, 'article div[dir="auto"]');
    const main = texts.find(outside);
    const paidIcon = [...root.querySelectorAll('svg[aria-label="Verified account"] use')].some(
      (u) => outside(u) && /premium/.test(u.getAttribute('href') || ''),
    );
    return { id, handle, nameEl, texts, text: main ? main.textContent || '' : '', media: all(root, MEDIA).filter(outside), paidIcon };
  },
  isAd: (root) => all(root, 'a[target="_blank"] div').some((d) => /^(Ad from |Promoted\b)/.test(d.textContent || '')),
  dateLink: (root, id) => all(root, `a[href$="/status/${id}"][data-base-ui-tooltip-trigger]`).find((a) => !a.closest('[role="group"]')),
  viewsLink: (root) => root.querySelector<HTMLElement>('a[aria-label="View count"]'),

  article: (root) => root.querySelector<HTMLElement>(':scope > article'),
  avatar: (article) => article.querySelector<HTMLElement>('[data-post-avatar]'),
  // the bookmark/share box: "Not interested" joins it, and it moves under the avatar
  actionBox: (root) => root.querySelector<HTMLElement>(':scope > article [role="group"] > div:has([data-engagement-action="bookmark"])'),
  sideAnchor: (article) => article.querySelector<HTMLElement>('[role="group"] > div:has([data-engagement-action="bookmark"])'),
  blocks: (article, root) =>
    all(article, `div.rounded-md.overflow-hidden, ${NEW_POST}`).filter(
      (el) => el !== root && !el.closest('[role="group"]') && el.parentElement!.closest(NEW_POST) === root,
    ),
  mediaBox: (root) =>
    all(root, ':scope > article div.rounded-md.overflow-hidden').find((b) => b.querySelector(MEDIA) && b.closest(NEW_POST) === root),
  toggleSlot(root) {
    const header = root.querySelector(`:scope > article ${NEW_HEADER}`);
    const slot = header && (header.lastElementChild as HTMLElement | null);
    return { slot, before: slot && slot.firstChild };
  },

  makeNI(box) {
    const bm = box.querySelector('[data-engagement-action="bookmark"] button');
    const pill = bm && bm.querySelector(':scope > span');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = bm ? bm.className : '';
    const svg = `<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">${SAD_FACE}</svg>`;
    b.innerHTML = pill ? `<span class="${pill.className}">${svg}</span>` : svg;
    box.appendChild(b);
    return ni(b);
  },
  moreButton: (article) =>
    all(article, 'button[aria-haspopup="menu"]:not([data-engagement-action])').find(
      (b) => !b.closest('[role="group"]') && b.closest(NEW_POST) === article.parentElement,
    ),
  isNIItem: (item) => !!item.querySelector('svg[data-icon="icon-emoji-sad"]'),

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
      media: all(root, MEDIA).filter(outside),
      paidIcon: !!un.querySelector('svg[data-testid="icon-verified"]'),
      noTime: ![...root.querySelectorAll('time')].some(outside),
    };
  },
  // promoted posts have no timestamp
  isAd: (root, info) => !!info.noTime && !!root.closest('[data-testid="placementTracking"]'),
  dateLink: (root, id) => all(root, `a[href$="/status/${id}"]`).find((a) => a.querySelector('time') && !a.closest(OLD_QUOTE)),
  viewsLink: (root, id) => root.querySelector<HTMLElement>(`[role="group"] a[href$="/status/${id}/analytics"]`),

  article: (root) => root,
  avatar: (article) => article.querySelector<HTMLElement>('[data-testid="Tweet-User-Avatar"]'),
  // the action bar is flat: "Not interested" gets its own cell in it
  actionBox: (root) => all(root, '[role="group"]').find((g) => !g.closest(OLD_QUOTE) && g.querySelector(BOOKMARK)),
  sideAnchor: (article) => article.querySelector<HTMLElement>(`[role="group"] ${BOOKMARK}`),
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

  makeNI(box) {
    const b = box.querySelector(BOOKMARK)!.cloneNode(true) as HTMLElement;
    b.removeAttribute('data-testid');
    const svg = b.querySelector('svg');
    if (svg) svg.innerHTML = SAD_FACE;
    const cell = document.createElement('div');
    cell.className = 'qt-ni-cell';
    cell.appendChild(b);
    box.appendChild(cell);
    return ni(b);
  },
  moreButton: (article) => all(article, '[data-testid="caret"]').find((b) => !b.closest(OLD_QUOTE)),
  isNIItem: (item) => /not interested/i.test(item.textContent || ''),

  // Collapsed post keeps its header row; the avatar column keeps its width. The content column is the
  // element whose first child holds the name and a later child the action bar.
  collapseCss: () =>
    [
      `${OLD_POST}[data-xs-state="collapsed"] [data-testid="Tweet-User-Avatar"] { display: none !important; }`,
      `${OLD_POST}[data-xs-state="collapsed"] div:has(> :first-child [data-testid="User-Name"]):has(> :not(:first-child) [role="group"]) > :not(:first-child) { display: none !important; }`,
      `${OLD_POST}[data-xs-state="collapsed"] { opacity: 0.6; transition: opacity 0.15s; } ${OLD_POST}[data-xs-state="collapsed"]:hover { opacity: 1; }`,
    ].join('\n'),
};

// a selector *list*: don't concatenate it
export const POST = `${NEW_POST}, ${OLD_POST}`;
// a post's row in the (virtual) list
export const CELL = 'li[data-index], [data-testid="cellInnerDiv"]';
export const appOf = (root: Element): App => (root.tagName === 'ARTICLE' ? OLD : NEW);
// top-level post (not a quoted one)
export const isRoot = (el: Element): boolean =>
  el.tagName === 'ARTICLE' ? el.matches(OLD_POST) : el.matches(NEW_POST) && !el.parentElement!.closest(NEW_POST);
