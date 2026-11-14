// X serves two web apps, with different markup:
//   new ("x-web"):          a post is a role=link box whose data-href is its
//                           permalink, wrapping an <article>; quoted posts are
//                           the same kind of box nested inside it.
//   old ("responsive-web"): a post is article[data-testid=tweet]; quoted posts
//                           are plain role=link divs inside it.
// Everything that depends on the markup lives here, one adapter per app, so
// content.js asks `XS.apps.of(root)` instead of branching. Selectors are kept
// whole; never build one by joining selector lists (a list joined with a
// descendant combinator matches far more than intended).
(function (XS) {
  'use strict';

  const PERMALINK = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/;
  const MEDIA = 'video, img[src*="pbs.twimg.com/media/"], img[src*="video_thumb"], img[src*="/card_img/"]';
  const SAD_FACE =
    '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 16.2c1.9-1.8 5.1-1.8 7 0"/></g><circle cx="9" cy="10" r=".8" fill="currentColor"/><circle cx="15" cy="10" r=".8" fill="currentColor"/>';

  // ---------- new app ----------

  const NEW_POST = '[role="link"][data-href*="/status/"]';
  const NEW_HEADER = "[class*='@container/post-actions']";
  const NEW = {
    canUnload: true, // photos are <img>, so they can be kept from loading
    buttonsRelative: false,

    read(root) {
      const m = PERMALINK.exec(root.getAttribute('data-href') || '');
      if (!m) return null;
      const [, handle, id] = m;
      const quotes = [...root.querySelectorAll(NEW_POST)];
      const outside = (el) => !quotes.some((q) => q.contains(el));
      // display-name link: links to the profile, has text, isn't the avatar
      let nameEl = null;
      for (const a of root.querySelectorAll(`a[href="/${handle}" i]`)) {
        const t = a.textContent.trim();
        if (outside(a) && !a.querySelector('img') && t && !t.startsWith('@')) {
          nameEl = a.parentElement;
          break;
        }
      }
      const texts = [...root.querySelectorAll('article div[dir="auto"]')];
      const main = texts.find(outside);
      const paidIcon = [...root.querySelectorAll('svg[aria-label="Verified account"] use')].some(
        (u) => outside(u) && /premium/.test(u.getAttribute('href') || ''),
      );
      return { id, handle, nameEl, texts, text: main ? main.textContent : '', media: [...root.querySelectorAll(MEDIA)].filter(outside), paidIcon };
    },
    isAd: (root) => [...root.querySelectorAll('a[target="_blank"] div')].some((d) => /^(Ad from |Promoted\b)/.test(d.textContent)),
    dateLink: (root, id) => [...root.querySelectorAll(`a[href$="/status/${id}"][data-base-ui-tooltip-trigger]`)].find((a) => !a.closest('[role="group"]')),
    viewsLink: (root) => root.querySelector('a[aria-label="View count"]'),

    article: (root) => root.querySelector(':scope > article'),
    avatar: (article) => article.querySelector('[data-post-avatar]'),
    // the bookmark/share box: "Not interested" joins it, and it moves under the avatar
    actionBox: (root) => root.querySelector(':scope > article [role="group"] > div:has([data-engagement-action="bookmark"])'),
    sideAnchor: (article) => article.querySelector('[role="group"] > div:has([data-engagement-action="bookmark"])'),
    // media / quoted post the side stack may line up with
    blocks: (article, root) =>
      [...article.querySelectorAll(`div.rounded-md.overflow-hidden, ${NEW_POST}`)].filter(
        (el) => el !== root && !el.closest('[role="group"]') && el.parentElement.closest(NEW_POST) === root,
      ),
    mediaBox: (root) => [...root.querySelectorAll(':scope > article div.rounded-md.overflow-hidden')].find((b) => b.querySelector(MEDIA) && b.closest(NEW_POST) === root),
    // where the show/hide link goes: first in the header's right-hand slot
    toggleSlot(root) {
      const header = root.querySelector(`:scope > article ${NEW_HEADER}`);
      const slot = header && header.lastElementChild;
      return { slot, before: slot && slot.firstChild };
    },

    // "Not interested": a button with the bookmark button's classes, in its box
    makeNI(box) {
      const bm = box.querySelector('[data-engagement-action="bookmark"] button');
      const pill = bm && bm.querySelector(':scope > span');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `${bm ? bm.className : ''} xs-ni`;
      const svg = `<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">${SAD_FACE}</svg>`;
      b.innerHTML = pill ? `<span class="${pill.className}">${svg}</span>` : svg;
      box.appendChild(b);
      return b;
    },
    niHost: (btn) => btn, // what to remove / what sits in the box
    moreButton: (article) =>
      [...article.querySelectorAll('button[aria-haspopup="menu"]:not([data-engagement-action])')].find(
        (b) => !b.closest('[role="group"]') && b.closest(NEW_POST) === article.parentElement,
      ),
    isNIItem: (item) => !!item.querySelector('svg[data-icon="icon-emoji-sad"]'),

    // Collapsed post: header row only (name, check, badge, handle, date, views,
    // ⋯), no avatar/text/media/actions; posts without that header fall back to
    // a one-line note. `sel` selects the post box (for one id, or by state).
    collapseCss(sel, why) {
      const H = NEW_HEADER;
      const has = `${sel}:has(> article ${H})`;
      const not = `${sel}:not(:has(> article ${H}))`;
      const note = why ? JSON.stringify(why) : 'attr(data-xs-why)';
      return [
        `${has} > article > :not(:has(${H})), ${has} > article > div > :not(:has(${H})) > *, ${has} > article :has(> ${H}) ~ *, ${has} > article :has(> ${H}) > :not(${H}), ${has} ${H} > :last-child > :not(.xs-toggle, [data-slot='xds-menu-trigger']) { display: none !important; }`,
        `${has} > article { opacity: 0.6; transition: opacity 0.15s; } ${has}:hover > article { opacity: 1; }`,
        `${not} > * { display: none !important; }`,
        `${not}::before { content: '⊘  ' ${note} '  ·  click to show'; display: block; padding: 10px 16px; font: 13px/1.4 system-ui, sans-serif; color: var(--x-fg-secondary, #8b8f97); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }`,
      ].join('\n');
    },
  };

  // ---------- old app ----------

  const OLD_POST = 'article[data-testid="tweet"]';
  const OLD_QUOTE = 'div[role="link"]:has([data-testid="User-Name"])';
  const BOOKMARK = ':is([data-testid="bookmark"], [data-testid="removeBookmark"])';
  const OLD = {
    canUnload: false, // photos are background images: blur instead of "don't load"
    buttonsRelative: true, // nearly every element is position:relative

    read(root) {
      const quotes = [...root.querySelectorAll(OLD_QUOTE)];
      const outside = (el) => !quotes.some((q) => q.contains(el));
      // permalink: the timestamp link; else the views link in the action bar
      let m = null;
      for (const a of root.querySelectorAll('a[href*="/status/"]')) {
        if (!outside(a)) continue;
        const r = PERMALINK.exec(a.getAttribute('href') || '');
        if (!r) continue;
        if (a.querySelector('time')) {
          m = r;
          break;
        }
        if (!m && a.closest('[role="group"]')) m = r;
      }
      const un = [...root.querySelectorAll('[data-testid="User-Name"]')].find(outside);
      if (!m || !un) return null;
      const texts = [...root.querySelectorAll('[data-testid="tweetText"]')];
      const main = texts.find(outside);
      return {
        id: m[2],
        handle: m[1],
        nameEl: un.firstElementChild,
        texts,
        text: main ? main.textContent : '',
        media: [...root.querySelectorAll(MEDIA)].filter(outside),
        paidIcon: !!un.querySelector('svg[data-testid="icon-verified"]'),
        noTime: ![...root.querySelectorAll('time')].some(outside),
      };
    },
    // promoted posts have no timestamp
    isAd: (root, info) => info.noTime && !!root.closest('[data-testid="placementTracking"]'),
    dateLink: (root, id) => [...root.querySelectorAll(`a[href$="/status/${id}"]`)].find((a) => a.querySelector('time') && !a.closest(OLD_QUOTE)),
    viewsLink: (root, id) => root.querySelector(`[role="group"] a[href$="/status/${id}/analytics"]`),

    article: (root) => root,
    avatar: (article) => article.querySelector('[data-testid="Tweet-User-Avatar"]'),
    // the action bar is flat: "Not interested" gets its own cell in it
    actionBox: (root) => [...root.querySelectorAll('[role="group"]')].find((g) => !g.closest(OLD_QUOTE) && g.querySelector(BOOKMARK)),
    sideAnchor: (article) => article.querySelector(`[role="group"] ${BOOKMARK}`),
    blocks: (article) => [...article.querySelectorAll(`.r-1867qdf, ${OLD_QUOTE}`)].filter((el) => !el.closest('[role="group"]') && !el.parentElement.closest(OLD_QUOTE)),
    // (the blur is on the photo box itself, so the button goes on its parent)
    mediaBox: (root) => [...root.querySelectorAll('[data-testid="tweetPhoto"], [data-testid="videoPlayer"]')].find((b) => !b.closest(OLD_QUOTE))?.parentElement,
    // the row holding [Grok button, ⋯ menu]: the link goes before ⋯
    toggleSlot(root) {
      const caret = [...root.querySelectorAll('[data-testid="caret"]')].find((c) => !c.closest(OLD_QUOTE));
      for (let e = caret; e && e !== root; e = e.parentElement) {
        if (e.parentElement && e.parentElement.children.length > 1) return { slot: e.parentElement, before: e };
      }
      return { slot: null, before: null };
    },

    // "Not interested": a copy of X's bookmark button (same look and hover)
    makeNI(box) {
      const b = box.querySelector(BOOKMARK).cloneNode(true);
      b.removeAttribute('data-testid');
      b.classList.add('xs-ni');
      const svg = b.querySelector('svg');
      if (svg) svg.innerHTML = SAD_FACE;
      const cell = document.createElement('div');
      cell.className = 'qt-ni-cell';
      cell.appendChild(b);
      box.appendChild(cell);
      return b;
    },
    niHost: (btn) => btn.parentElement,
    moreButton: (article) => [...article.querySelectorAll('[data-testid="caret"]')].find((b) => !b.closest(OLD_QUOTE)),
    isNIItem: (item) => /not interested/i.test(item.textContent),

    // collapsed post keeps its header row; the avatar column keeps its width.
    // The content column is the element whose first child holds the name and a
    // later child the action bar.
    collapseCss: () =>
      [
        `${OLD_POST}[data-xs-state="collapsed"] [data-testid="Tweet-User-Avatar"] { display: none !important; }`,
        `${OLD_POST}[data-xs-state="collapsed"] div:has(> :first-child [data-testid="User-Name"]):has(> :not(:first-child) [role="group"]) > :not(:first-child) { display: none !important; }`,
        `${OLD_POST}[data-xs-state="collapsed"] { opacity: 0.6; transition: opacity 0.15s; } ${OLD_POST}[data-xs-state="collapsed"]:hover { opacity: 1; }`,
      ].join('\n'),
  };

  // Shared bits for both: decorate a freshly made "Not interested" button.
  for (const A of [NEW, OLD]) {
    const make = A.makeNI;
    A.makeNI = (box) => {
      const b = make(box);
      b.dataset.xsTip = 'Not interested';
      b.setAttribute('aria-label', 'Not interested in this post');
      return b;
    };
  }

  XS.apps = {
    NEW,
    OLD,
    POST: `${NEW_POST}, ${OLD_POST}`, // any post root (a selector *list*: don't concatenate it)
    CELL: 'li[data-index], [data-testid="cellInnerDiv"]', // a post's row in the (virtual) list
    of: (root) => (root.tagName === 'ARTICLE' ? OLD : NEW),
    // top-level post (not a quoted one)
    isRoot: (el) => (el.tagName === 'ARTICLE' ? el.matches(OLD_POST) : el.matches(NEW_POST) && !el.parentElement.closest(NEW_POST)),
  };
})((globalThis.XS = globalThis.XS || {}));
