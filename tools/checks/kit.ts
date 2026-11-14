// Runs in the page (stringified by check.ts): what every check group shares.
// PAL: the chosen theme's palette (null for X default)
export function kit(S: any, NAV: [string, string, string][], PAL: Record<string, string> | null) {
  const out: [string, string, string][] = [];
  // ok: true = pass, false = fail, null/undefined = skip (setting off, or nothing to check on this page)
  const add = (name: string, ok: boolean | null | undefined, detail = '') => out.push([name, ok == null ? 'skip' : ok ? 'pass' : 'fail', detail]);
  const cs = (e: Element) => getComputedStyle(e);
  const box = (e: Element) => e.getBoundingClientRect();
  const visible = (e: Element | null | undefined): e is HTMLElement => {
    if (!e) return false;
    const r = box(e);
    return r.width > 1 && r.height > 1 && cs(e).visibility !== 'hidden' && cs(e).display !== 'none';
  };
  const all = (sel: string, root: ParentNode = document) => [...root.querySelectorAll<HTMLElement>(sel)];
  const anyVisible = (sel: string) => all(sel).some(visible);
  // present on the page → shown? (null when X didn't render it at all)
  const shown = (sel: string) => (all(sel).length ? anyVisible(sel) : null);
  const transparent = (c: string) => c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c);
  const rgb = (hex: string) => (/^#[0-9a-f]{6}$/i.test(hex) ? `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})` : '');
  const mid = (e: Element) => { const r = box(e); return r.left + r.width / 2; };
  const OLD = ![...document.scripts].some((s) => /x-web\/x-web/.test(s.src));
  const POST = OLD ? 'article[data-testid="tweet"]' : '[role="link"][data-href*="/status/"]';
  const roots = all(POST).filter((r) => OLD || !r.parentElement!.closest(POST));
  const article = (r: HTMLElement) => (OLD ? r : r.querySelector<HTMLElement>(':scope > article'));
  const avatar = (r: HTMLElement) => r.querySelector('[data-testid="Tweet-User-Avatar"], [data-post-avatar]');
  const bookmark = (r: HTMLElement) => r.querySelector('[role="group"] :is([data-testid="bookmark"], [data-testid="removeBookmark"], [data-engagement-action="bookmark"] button)');
  const share = (r: HTMLElement) =>
    OLD ? [...r.querySelectorAll('[role="group"] svg path[d^="M12 2.59l5.7"]')].map((p) => p.closest('button'))[0] : r.querySelector('[data-engagement-action="share"] button, [data-engagement-action="share"]');
  const html = document.documentElement;
  const accent = (name: string) => rgb(cs(html).getPropertyValue(name).trim());
  const page = location.pathname;
  return { S, D: S.declutter, NAV, PAL, out, add, cs, box, visible, all, anyVisible, shown, transparent, rgb, mid, OLD, POST, roots, article, avatar, bookmark, share, html, accent, page, onHome: page === '/home' };
}
export type Kit = ReturnType<typeof kit>;

// Extension switched off: nothing of ours left on the page.
export function offChecks(K: Kit) {
  const flags = [...K.html.attributes].map((a) => a.name).filter((n) => n.startsWith('data-xs-') && n !== 'data-xs-font');
  K.add('off: no page flags', !flags.length, flags.join(' '));
  const ours = K.all('[data-xs-key], [data-xs-want-bm], [data-xs-side-ni], [data-xs-side-bm], [data-xs-pfp], [data-xs-media], [data-xs-state], [data-xs-hidden], .qt-ni-cell, .xs-toggle, .qt-reblur, use[href^="#xs-"]');
  K.add('off: no marks on posts', !ours.length, ours.slice(0, 4).map((e) => e.tagName + [...e.attributes].map((a) => (a.name.startsWith('data-xs') || a.name === 'class' ? ` ${a.name}` : '')).join('')).join(' | '));
  const css = K.all('style[id^="quiettl-"]').filter((s) => s.textContent!.trim());
  K.add('off: no styles of ours', !css.length, css.map((s) => s.id).join(' '));
}
