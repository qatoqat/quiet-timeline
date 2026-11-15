import { appOf, isRoot, POST } from '../apps';
import { setData } from './state';

export const stop = (e: Event): void => {
  e.preventDefault();
  e.stopImmediatePropagation();
};

// Finds root's `.cls` button and keeps it in parent (created if needed); removes it when there's no parent.
export function placeButton(root: HTMLElement, cls: string, parent: HTMLElement | null | undefined, before: Node | null = null): HTMLButtonElement | null {
  let btn = root.querySelector<HTMLButtonElement>(`.${cls}`);
  if (btn && btn.parentElement !== parent) {
    btn.remove();
    btn = null;
  }
  if (!parent || btn) return btn;
  btn = document.createElement('button');
  btn.type = 'button';
  btn.className = cls;
  parent.insertBefore(btn, before);
  return btn;
}

// "show" / "hide" link in a collapsed (or revealed) post's header, just before the ⋯ menu.
export function setToggle(root: HTMLElement, mode: 'show' | 'hide' | null, verdict?: { why: string; label?: string } | null): void {
  const { slot, before } = appOf(root).toggleSlot(root);
  const link = placeButton(root, 'xs-toggle', mode ? slot : null, before);
  if (!link) return;
  const text = mode === 'show' && verdict!.label ? `${verdict!.label} · show` : mode;
  if (link.textContent !== text) link.textContent = text;
  link.dataset.xsTip = mode === 'show' ? verdict!.why : 'Collapse again';
}

// Under the avatar: bookmark & share on posts tall enough for them, with "Not interested" on top
// when there's room for it too (it's never shown anywhere else).
const SLOT = 36; // px per button
const sizeWatch = new ResizeObserver((entries) => {
  for (const e of entries) {
    if (!e.target.isConnected) {
      unwatch(e.target);
      continue;
    }
    const root = isRoot(e.target) ? e.target : e.target.parentElement;
    if (root) layoutSide(root as HTMLElement);
  }
});
// An observed element stays alive until unobserved, and X's list throws posts away as you scroll.
const watched = new Set<Element>();
const unwatch = (el: Element) => {
  sizeWatch.unobserve(el);
  watched.delete(el);
};

export function layoutSide(root: HTMLElement): void {
  const A = appOf(root);
  const article = root.dataset.xsWantBm ? A.article(root) : null;
  const bm = article && A.bookmarkCell(root);
  const ni = bm && root.querySelector<HTMLElement>('.qt-ni-cell');
  const av = article && A.avatar(article);
  // watch first: if the avatar / action bar aren't rendered yet, their arrival brings us back here
  if (article && !watched.has(article)) {
    watched.add(article);
    sizeWatch.observe(article);
  }
  let room = 0;
  const avr = av && av.getBoundingClientRect();
  if (bm && avr && avr.height) {
    // (a collapsed post hides its avatar.) Relative to the article's box: offsetTop would count from
    // whichever ancestor is positioned
    const ar = article.getBoundingClientRect();
    const avBottom = Math.round(avr.bottom - ar.top);
    const firstBlock = A.blocks(article, root).map((el) => Math.round(el.getBoundingClientRect().top - ar.top)).sort((x, y) => x - y)[0];
    // Line the stack up with media / a quoted post when it starts right below the avatar.
    const top = firstBlock !== undefined && firstBlock >= avBottom && firstBlock <= avBottom + 42 ? firstBlock : avBottom + 12;
    room = Math.floor((ar.height - top) / SLOT);
    if (room >= 2) {
      // old app: nearly everything is position:relative, so shift by the buttons' container offset
      let dx = 0;
      let dy = 0;
      const cont = A.buttonsRelative && bm.offsetParent;
      if (cont && cont !== article) {
        const cr = cont.getBoundingClientRect();
        dx = Math.round(cr.left - ar.left);
        dy = Math.round(cr.top - ar.top);
      }
      article.style.setProperty('--xs-side-left', `${Math.round(avr.left + avr.width / 2 - ar.left - SLOT / 2) - dx}px`);
      article.style.setProperty('--xs-stack-top', `${top - dy}px`);
    }
  }
  setData(root, 'xsSideBm', room >= 2 && '1');
  setData(root, 'xsSideNi', !!ni && room >= 3 && '1');
}

// "Not interested": open the post's ⋯ menu and pick X's own item (found by its icon, so any language works).
let niBusy = false;
const niTarget = (e: Event) => {
  const t = e.target as Element;
  return t.closest ? t.closest<HTMLElement>('.xs-ni') : null;
};

async function notInterested(btn: HTMLElement): Promise<void> {
  if (niBusy) return;
  niBusy = true;
  setTimeout(() => (niBusy = false), 1500);
  const article = btn.closest<HTMLElement>('article')!;
  const A = appOf(btn.closest(POST)!);
  const more = A.moreButton(article);
  if (!more) return;
  // Keep the menu invisible while we use it (it still opens and loads normally).
  const html = document.documentElement;
  html.setAttribute('data-xs-menu-busy', '');
  const before = new Set(document.querySelectorAll('[role="menu"]')); // one left open elsewhere isn't ours
  more.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  more.click();
  // The first menu after a page load can take a while (X loads its code then); once ours is there
  // without the item (X didn't offer it), give up soon.
  let menu: Element | undefined;
  let item: Element | undefined;
  for (let i = 0, filled = -1; i < 80 && !item && (filled < 0 || i - filled < 6); i++) {
    await new Promise((r) => setTimeout(r, 50));
    menu = [...document.querySelectorAll('[role="menu"]')].find((m) => !before.has(m));
    const items = menu ? [...menu.querySelectorAll('[role="menuitem"]')] : [];
    if (items.length && filled < 0) filled = i;
    item = items.find(A.isNIItem);
  }
  if (item) {
    // X's menu needs a real press/release sequence, not just a click event.
    const o = { bubbles: true, cancelable: true, pointerType: 'mouse', button: 0, buttons: 1, isPrimary: true };
    item.dispatchEvent(new PointerEvent('pointerdown', o));
    item.dispatchEvent(new MouseEvent('mousedown', o));
    item.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }));
    item.dispatchEvent(new MouseEvent('mouseup', { ...o, buttons: 0 }));
    item.dispatchEvent(new MouseEvent('click', { ...o, buttons: 0 }));
  } else if (menu) A.closeMenu(menu);
  setTimeout(() => html.removeAttribute('data-xs-menu-busy'), 400);
  setTimeout(() => document.activeElement && (document.activeElement as HTMLElement).blur(), 50); // no lingering focus ring
}

export function initSide(): void {
  setInterval(() => {
    for (const a of watched) if (!a.isConnected) unwatch(a);
  }, 10000);
  // Act on release: X re-renders the action bar on press, which can swallow the click.
  // Keyboard activation still arrives as a click with no pointer (detail 0).
  for (const type of ['pointerdown', 'mousedown']) {
    window.addEventListener(type, (e) => niTarget(e) && e.stopImmediatePropagation(), true);
  }
  window.addEventListener(
    'pointerup',
    (e) => {
      const b = niTarget(e);
      if (b && e.button === 0) {
        stop(e);
        notInterested(b);
      }
    },
    true,
  );
  window.addEventListener(
    'click',
    (e) => {
      const b = niTarget(e);
      if (!b) return;
      stop(e);
      if (e.detail === 0) notInterested(b);
    },
    true,
  );
}
