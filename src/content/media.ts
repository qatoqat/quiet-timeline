import { appOf, POST } from '../apps';
import { st, playAllowed } from './state';
import { readPost, pageCtx, processPost } from './post';

export const MEDIA_IMG = 'img[src*="pbs.twimg.com/media/"], img[src*="video_thumb"], img[src*="/card_img/"]';

// Remove image sources before they load; keep them to restore on click.
export function stripMedia(root: ParentNode): void {
  for (const img of root.querySelectorAll<HTMLImageElement>(MEDIA_IMG)) {
    img.dataset.xsSrc = img.getAttribute('src') ?? '';
    img.removeAttribute('src');
    if (img.hasAttribute('srcset')) {
      img.dataset.xsSrcset = img.getAttribute('srcset') ?? '';
      img.removeAttribute('srcset');
    }
  }
  for (const v of root.querySelectorAll('video')) {
    v.preload = 'none';
    if (!v.paused) v.pause();
  }
}

export function restoreMedia(root: ParentNode): void {
  for (const img of root.querySelectorAll<HTMLImageElement>('img[data-xs-src]')) {
    if (img.dataset.xsSrcset) img.setAttribute('srcset', img.dataset.xsSrcset);
    img.setAttribute('src', img.dataset.xsSrc!);
    delete img.dataset.xsSrc;
    delete img.dataset.xsSrcset;
  }
}

// "Contour" blur: band only the lightness (banding R/G/B separately gives false rainbow colours),
// then blend 70/30 with the plain blur so it stays light and soft.
export function ensureContourFilters(): void {
  if (document.getElementById('quiettl-contour')) return;
  const steps = '0.36 0.485 0.61 0.735 0.86'; // no pure white (glow) or black
  const f = (id: string, sd: number, soft: number) =>
    `<filter id="${id}" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%">` +
    `<feGaussianBlur in="SourceGraphic" stdDeviation="${sd}" edgeMode="duplicate" result="b0"/>` +
    `<feColorMatrix in="b0" type="saturate" values="0.9" result="b"/>` +
    `<feColorMatrix in="b" type="saturate" values="0" result="g"/>` +
    `<feComponentTransfer in="g" result="p">${['R', 'G', 'B'].map((c) => `<feFunc${c} type="discrete" tableValues="${steps}"/>`).join('')}</feComponentTransfer>` +
    `<feGaussianBlur in="p" stdDeviation="${soft}" result="ps"/>` +
    `<feBlend in="ps" in2="b" mode="luminosity" result="c"/>` +
    `<feComposite in="c" in2="b" operator="arithmetic" k2="0.7" k3="0.3"/></filter>`;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'quiettl-contour';
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.innerHTML = f('quiettl-contour-sm', 3, 0.5) + f('quiettl-contour-lg', 10, 1);
  document.documentElement.appendChild(svg);
}

export const EYE =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
export const EYE_OFF =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.3 2.4-2.6 3.7M6.6 6.6C4.4 8 2.9 10.1 2 12c1 2.5 5 7 10 7 1.9 0 3.6-.6 5-1.5"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

// Eye on covered media (always shown, click to show); crossed eye on revealed media (on hover, click to cover again).
export function setReblur(root: HTMLElement, mode: string | null, covered?: boolean): void {
  const box = mode && appOf(root).mediaBox(root);
  let btn = root.querySelector<HTMLButtonElement>('.qt-reblur');
  if (!box) {
    if (btn) btn.remove();
    return;
  }
  if (!btn || btn.parentElement !== box) {
    if (btn) btn.remove();
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'qt-reblur';
    if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
    box.appendChild(btn);
  }
  const act = covered ? 'show' : 'cover';
  if (btn.dataset.act !== act) {
    btn.dataset.act = act;
    btn.innerHTML = covered ? EYE : EYE_OFF;
  }
  const label = covered ? 'Show media' : mode === 'unload' ? 'Unload media again' : 'Blur media again';
  btn.dataset.xsTip = label;
  btn.setAttribute('aria-label', label);
}

export function initMedia(): void {
  // No autoplay for flagged posts: pause any play that you didn't start.
  document.addEventListener(
    'play',
    (e) => {
      const v = e.target as HTMLVideoElement | null;
      if (!v || v.tagName !== 'VIDEO' || !st.S.enabled) return;
      // The video may mount before the post has been processed.
      const root = v.closest<HTMLElement>(POST);
      if (root && !root.dataset.xsKey) {
        try {
          processPost(root, pageCtx());
        } catch (_) {}
      }
      if (v.closest('[data-xs-noplay]')) v.pause();
    },
    true,
  );
  // Pressing on the video (or its controls) counts as you starting it.
  window.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target as Element;
      const root = t.closest && t.closest<HTMLElement>('[data-xs-noplay]');
      if (!root || !t.closest('article [data-press-control], article video')) return;
      const info = readPost(root);
      if (info) playAllowed.add(info.id);
      delete root.dataset.xsNoplay;
    },
    true,
  );
}
