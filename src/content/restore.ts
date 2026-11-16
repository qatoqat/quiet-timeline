import { appOf, isRoot, POST, topPost } from '../apps';
import { st } from './state';

// Going back to a page puts the post you tapped where it was. X's old app restores a page we've
// changed (posts hidden or collapsed, views by the date) to the wrong place, often one with nothing
// rendered. Acts only when X got it wrong, and stops when you scroll yourself.
type Spot = { id: string; top: number; y: number };
type Held = { key: string; spot: Spot };
// by history entry: the post tapped to leave it, or the one at the top when anything else left it; each
// is used once, on the first way back
const spots = new Map<string, Spot>();
let tap: Held | null = null; // the latest, until it's clear whether it left the page
let lining: Held | null = null; // a way back still putting its post back
let run = 0;

type Nav = EventTarget & { currentEntry?: { key?: string } };
const nav = (window as { navigation?: Nav }).navigation;
// this history entry (the Navigation API tells entries of one URL apart; else the URL)
const entry = (): string => nav?.currentEntry?.key ?? location.pathname + location.search;

// (a post in a dialog, like the photo viewer's replies, has its own scroller: scrolling the page can't move it)
const DIALOG = '[aria-modal="true"], [role="dialog"]';
const find = (id: string): HTMLElement | undefined =>
  [...document.querySelectorAll<HTMLElement>(POST)].find((r) => isRoot(r) && !r.closest(DIALOG) && appOf(r).read(r)?.id === id);

function save({ key, spot }: Held): void {
  spots.delete(key);
  spots.set(key, spot);
  if (spots.size > 50) spots.delete(spots.keys().next().value!);
}

function remember(e: MouseEvent): void {
  if (e.detail > 1) return; // a double-click's later clicks (its first may have opened a page already)
  const root = e.target instanceof Element ? topPost(e.target) : null;
  const id = root && !root.closest(DIALOG) && appOf(root).read(root)?.id;
  if (!id) return;
  const key = entry();
  if (tap && tap.key !== key) save(tap); // an earlier tap that has left its page
  const mine = (tap = { key, spot: { id, top: root!.getBoundingClientRect().top, y: scrollY } });
  // only a tap that opens another page counts (a like or a bookmark doesn't)
  setTimeout(() => {
    if (tap !== mine) return;
    tap = null;
    if (entry() !== key) save(mine);
  }, 1000);
}

// the post nearest the top of the screen (old: the old app's only)
function topmost(old: boolean): Spot | null {
  let best: Spot | null = null;
  for (const r of document.querySelectorAll<HTMLElement>(POST)) {
    if (old && r.tagName !== 'ARTICLE') continue;
    const b = r.getBoundingClientRect();
    if (!b.height || b.top < 0 || (best && b.top >= best.top) || !isRoot(r) || r.closest(DIALOG)) continue;
    const id = appOf(r).read(r)?.id;
    if (id) best = { id, top: b.top, y: scrollY };
  }
  return best;
}

// Leaving an entry (Back / Forward, or a link that isn't a post): its spot from the page as it still is (this
// comes before popstate, and a pushed URL before X swaps the page); one still being put back keeps the spot
// it had. A tap's own spot replaces it a second later.
function leave(e: Event): void {
  const { navigationType, from } = e as Event & { navigationType?: string; from?: { key?: string } };
  const key = from?.key;
  if ((navigationType !== 'traverse' && navigationType !== 'push') || !key || !st.S.enabled) return;
  if (lining?.key === key) return save(lining);
  // (at the very top X gets it right, and keeps you on posts it adds above; after a link the new app keeps
  // showing the page it left until the next has loaded, and it restores right on its own)
  const spot = scrollY <= 0 ? null : topmost(navigationType === 'push');
  if (spot) save({ key, spot });
}

function putBack(): void {
  const me = ++run; // a later way back ends this one
  const key = entry();
  const spot = tap && tap.key === key ? tap.spot : spots.get(key); // (back within a second of the tap)
  spots.delete(key);
  if (tap && tap.key === key) tap = null;
  if (!spot || !st.S.enabled) return;
  const mine = (lining = { key, spot });
  let stop = false;
  const quit = () => (stop = true);
  const inputs = ['wheel', 'touchstart', 'keydown', 'mousedown'];
  for (const k of inputs) addEventListener(k, quit, { once: true, capture: true, passive: true });
  const t0 = performance.now();
  let settled = 0;
  const step = () => {
    const t = performance.now() - t0;
    if (stop || me !== run || entry() !== key || t > 5000 || settled >= 3) {
      for (const k of inputs) removeEventListener(k, quit, { capture: true });
      // (Back / Forward often starts with input of its own: a thumb button's press, a swipe, Alt)
      setTimeout(() => lining === mine && (lining = null), stop ? 600 : 0);
      return;
    }
    const post = find(spot.id);
    if (post) {
      const off = post.getBoundingClientRect().top - spot.top;
      if (Math.abs(off) > 40) {
        scrollBy(0, off);
        settled = 0;
      } else if (t > 1200) settled++; // X's own restore comes about a second in
    } else if (t > 1200 && Math.abs(scrollY - spot.y) > 200) {
      scrollTo(0, spot.y); // somewhere without the post: back to where you were, then line it up
      settled = 0;
    }
    setTimeout(step, 150);
  };
  setTimeout(step, 150);
}

export function initRestore(): void {
  addEventListener('click', remember, true);
  addEventListener('popstate', putBack);
  nav?.addEventListener('currententrychange', leave);
}
