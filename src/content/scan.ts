import { MEDIA_IMG, MEDIA_PRESS, POST, topPost } from '../apps';
import { st, revealed, mediaRevealed, playAllowed, unset } from './state';
import { sizeState, updateSizeCss, applyKnownSize } from './sizes';
import { readPost, pageCtx, ownHandle, reset, processPost, maskText } from './post';
import { restoreMedia, setReblur } from './media';
import { setToggle, layoutSide, stop } from './side';
import { closeNags, navTooltips, hideTip, outlineChecks, hideUpsellCallouts } from './page';

// schedule() re-checks every post (new data, settings); schedule(root) only that post.
// X changes its page many times a second, so mutations only mark the posts they touched.
let pending = false;
let full = true;
const dirty = new Set<Element>();
export function schedule(root?: Element): void {
  if (root) dirty.add(root);
  else full = true;
  if (pending) return;
  pending = true;
  // Animation frames stop when the tab isn't drawn, so a timer backs them up.
  const run = () => pending && scan();
  requestAnimationFrame(run);
  setTimeout(run, 120);
}

let lastGlobal = 0;
let lastPath = '';
export function scan(): void {
  pending = false;
  // a new URL (incl. opening / closing the photo viewer over the feed): every post's context changed
  if (location.pathname !== lastPath) {
    lastPath = location.pathname;
    full = true;
  }
  // your own posts are never filtered: once the menu shows who you are, look at every post again
  if (st.S.enabled && !st.myHandle && (st.myHandle = ownHandle())) {
    st.ver++;
    full = true;
  }
  const roots = full ? [...document.querySelectorAll<HTMLElement>(POST)] : ([...dirty] as HTMLElement[]);
  full = false;
  dirty.clear();
  if (!st.S.enabled) return;
  const page = pageCtx();
  for (const root of roots) {
    if (!root.isConnected || (root.parentElement && root.parentElement.closest(POST))) continue; // gone / quoted post
    try {
      const before = root.dataset.xsKey;
      processPost(root, page);
      if (root.dataset.xsKey !== before) layoutSide(root); // later size changes: ResizeObserver
    } catch (err) {
      console.debug('[quiettl]', err);
    }
  }
  if (performance.now() - lastGlobal > 300) globalTasks();
}

function globalTasks() {
  lastGlobal = performance.now();
  if (st.S.declutter.popups) closeNags();
  if (st.S.declutter.upsells) hideUpsellCallouts();
  // the page's own background (old app: the solid top bar without a theme)
  const bg = getComputedStyle(document.body).backgroundColor;
  if (!/^transparent$|,\s*0\)$/.test(bg)) document.documentElement.style.setProperty('--qt-page-bg', bg);
  navTooltips();
  outlineChecks();
  // X's share button has no tooltip; give it its own (translated) label
  for (const b of document.querySelectorAll<HTMLElement>('button[data-engagement-action="share"]:not([data-xs-tip])')) {
    b.dataset.xsTip = b.getAttribute('aria-label') || 'Share';
  }
}

export function clearAll(): void {
  for (const root of document.querySelectorAll<HTMLElement>('[data-xs-key]')) {
    const info = readPost(root);
    if (info) {
      reset(root, info);
      if (root.dataset.xsMasked) maskText(info, { slur: false, prof: false, custom: false });
    }
    restoreMedia(root);
    setToggle(root, null, null);
    setReblur(root, null, false);
    root.querySelector('.qt-ni-cell')?.remove();
    unset(root, 'xsKey', 'xsWantBm', 'xsSideNi', 'xsSideBm', 'xsMasked');
  }
  for (const b of document.querySelectorAll<HTMLElement>('button[data-engagement-action="share"][data-xs-tip]')) delete b.dataset.xsTip;
  navTooltips();
  outlineChecks();
}

// Marks the top-level post containing el as needing a re-check → false if none.
function markPost(el: Node): boolean {
  const root = (el as Element).closest ? topPost(el as Element) : null;
  if (!root) return false;
  schedule(root);
  return true;
}

function observe() {
  new MutationObserver((muts) => {
    if (st.S.enabled && sizeState.size) for (const m of muts) for (const n of m.addedNodes) applyKnownSize(n);
    let other = false;
    let newMedia = false;
    for (const m of muts) {
      if (m.type === 'characterData') {
        // React restoring masked words
        const t = m.target.parentElement && m.target.parentElement.closest('article div[dir="auto"]');
        if (t) markPost(t);
        continue;
      }
      if (!markPost(m.target)) other = true;
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        const e = n as Element;
        if (!newMedia && (e.matches(MEDIA_IMG) || e.querySelector(MEDIA_IMG))) newMedia = true;
        if (e.matches(POST)) markPost(e);
        else for (const p of e.querySelectorAll(POST)) markPost(p);
      }
    }
    if (other && performance.now() - lastGlobal > 300) schedule(document.documentElement);
    // "Don't load" media: strip images now, not next frame, before they download
    if (newMedia && st.S.enabled && (st.S.repost.media === 'unload' || st.S.replies.media === 'unload')) scan();
  }).observe(document.documentElement, { subtree: true, childList: true, characterData: true });
}

function onClick(e: MouseEvent) {
  const tg = e.target as HTMLElement;
  if (!tg.closest) return;
  const reblur = tg.closest<HTMLElement>('.qt-reblur');
  if (reblur) {
    stop(e);
    const root = reblur.closest<HTMLElement>(POST);
    const info = root && readPost(root);
    if (!root || !info) return;
    if (reblur.dataset.act === 'show') {
      mediaRevealed.add(info.id);
      delete root.dataset.xsMedia;
      restoreMedia(root);
    } else {
      mediaRevealed.delete(info.id);
      playAllowed.delete(info.id);
      for (const v of root.querySelectorAll('video')) if (!v.paused) v.pause();
    }
    hideTip();
    schedule();
    return;
  }
  const toggle = tg.closest('.xs-toggle');
  if (toggle) {
    stop(e);
    const root = toggle.closest<HTMLElement>(POST);
    const info = root && readPost(root);
    if (!root || !info) return;
    if (!revealed.delete(info.id)) {
      revealed.add(info.id);
      delete root.dataset.xsState;
    }
    hideTip();
    updateSizeCss();
    schedule();
    return;
  }
  // links in a collapsed post's header (name, handle, date) work as usual
  const collapsed = !tg.closest('a, button') && tg.closest<HTMLElement>('[data-xs-state="collapsed"]');
  const blurred = !collapsed && tg.closest<HTMLElement>('[data-xs-media="blur"], [data-xs-media="unload"]');
  const onMedia =
    blurred && tg.closest(`${MEDIA_PRESS}, article img, article div.rounded-md`);
  const root = collapsed || (onMedia && blurred);
  if (!root) return;
  stop(e);
  const info = readPost(root);
  if (collapsed) {
    if (info) revealed.add(info.id);
    updateSizeCss();
    delete root.dataset.xsState;
  } else {
    if (info) mediaRevealed.add(info.id);
    delete root.dataset.xsMedia;
    restoreMedia(root);
  }
  schedule();
}

export function initScan(): void {
  setInterval(() => st.S.enabled && globalTasks(), 1000);
  observe();
  window.addEventListener('click', onClick, true);
}
