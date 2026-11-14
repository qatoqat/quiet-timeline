import { appOf, isRoot, POST } from '../apps';

// "show" / "hide" link in a collapsed (or revealed) post's header, just before the ⋯ menu.
export function setToggle(root: HTMLElement, mode: 'show' | 'hide' | null, verdict?: { why: string; label?: string } | null): void {
  const { slot, before } = appOf(root).toggleSlot(root);
  let link = root.querySelector<HTMLButtonElement>('.xs-toggle');
  if (!mode || !slot) {
    if (link) link.remove();
    return;
  }
  if (!link || link.parentElement !== slot) {
    if (link) link.remove();
    link = document.createElement('button');
    link.type = 'button';
    link.className = 'xs-toggle';
    slot.insertBefore(link, before);
  }
  const text = mode === 'show' && verdict!.label ? `${verdict!.label} · show` : mode;
  if (link.textContent !== text) link.textContent = text;
  link.dataset.xsTip = mode === 'show' ? verdict!.why : 'Collapse again';
}

// Move the bookmark/share box (with "Not interested") under the avatar, only when the post is tall enough.
export const SLOT = 36; // px per button
const sizeWatch = new ResizeObserver((entries) => {
  for (const e of entries) {
    if (!e.target.isConnected) {
      sizeWatch.unobserve(e.target);
      watched.delete(e.target);
      continue;
    }
    const root = isRoot(e.target) ? e.target : e.target.parentElement;
    if (root) layoutSide(root as HTMLElement);
  }
});
// An observed element stays alive until unobserved, and X's list throws posts away as you scroll.
const watched = new Set<Element>();

export function layoutSide(root: HTMLElement): void {
  if (root.dataset.xsWantSide !== '1') return;
  const A = appOf(root);
  const article = A.article(root);
  const av = article && A.avatar(article);
  const box = article && A.sideAnchor(article);
  // watch first: if the avatar / action bar aren't rendered yet, their arrival brings us back here
  if (article && !watched.has(article)) {
    watched.add(article);
    sizeWatch.observe(article);
  }
  if (!article || !av || !box) return;
  let top = av.offsetHeight;
  let left = av.offsetWidth / 2;
  for (let e: HTMLElement | null = av; e && e !== article; e = e.offsetParent as HTMLElement | null) {
    top += e.offsetTop;
    left += e.offsetLeft;
    if (e.offsetParent && !article.contains(e.offsetParent)) break;
  }
  const base = Math.round(top + 8);
  let top0 = base + 4;
  const ar = article.getBoundingClientRect();
  const blocks = A.blocks(article, root);
  const firstBlock = blocks.map((el) => Math.round(el.getBoundingClientRect().top - ar.top)).sort((x, y) => x - y)[0];
  // Line the stack up with media / a quoted post only when it starts right below the avatar.
  if (firstBlock !== undefined && firstBlock >= base - 8 && firstBlock <= base + 34) top0 = firstBlock;
  const count = root.dataset.xsNi ? 3 : 2;
  if (article.offsetHeight - top0 >= count * SLOT) {
    // old app: nearly everything is position:relative, so shift by the buttons' container offset
    let dx = 0;
    let dy = 0;
    if (A.buttonsRelative) {
      const cont = ((box.closest('[role="group"] > div') || box) as HTMLElement).offsetParent;
      if (cont && cont !== article) {
        const cr = cont.getBoundingClientRect();
        dx = Math.round(cr.left - ar.left);
        dy = Math.round(cr.top - ar.top);
      }
    }
    article.style.setProperty('--xs-side-left', `${Math.round(left - SLOT / 2) - dx}px`);
    article.style.setProperty('--xs-stack-top', `${top0 - dy}px`);
    root.dataset.xsSide = '1';
  } else {
    delete root.dataset.xsSide;
  }
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
  more.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  more.click();
  // the first menu after a page load can take a while (X loads its code then)
  let item: Element | undefined;
  for (let i = 0; i < 80 && !item; i++) {
    await new Promise((r) => setTimeout(r, 50));
    item = [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].find(A.isNIItem);
  }
  if (item) {
    // X's menu needs a real press/release sequence, not just a click event.
    const o = { bubbles: true, cancelable: true, pointerType: 'mouse', button: 0, buttons: 1, isPrimary: true };
    item.dispatchEvent(new PointerEvent('pointerdown', o));
    item.dispatchEvent(new MouseEvent('mousedown', o));
    item.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }));
    item.dispatchEvent(new MouseEvent('mouseup', { ...o, buttons: 0 }));
    item.dispatchEvent(new MouseEvent('click', { ...o, buttons: 0 }));
  } else {
    const menu = document.querySelector('[role="menu"]');
    if (menu) menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }
  setTimeout(() => html.removeAttribute('data-xs-menu-busy'), 400);
  setTimeout(() => document.activeElement && (document.activeElement as HTMLElement).blur(), 50); // no lingering focus ring
}

export function initSide(): void {
  setInterval(() => {
    for (const a of watched) {
      if (!a.isConnected) {
        sizeWatch.unobserve(a);
        watched.delete(a);
      }
    }
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
        e.preventDefault();
        e.stopImmediatePropagation();
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
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.detail === 0) notInterested(b);
    },
    true,
  );
}
