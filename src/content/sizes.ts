import { CELL, NEW, OLD, POST } from '../apps';
import { putStyle, styleEl } from '../theme/vars';
import { revealed, st } from './state';

// Posts we hid or collapsed: re-applied the moment X re-creates them (e.g. scrolling back up), before they're drawn.
export const sizeState = new Map<string, { hidden?: true; why?: string }>();

// X's list measures a post the moment it's created, before any script can run,
// so these states are also written as CSS keyed on the post id.
const sizeCss = styleEl('quiettl-sizes');
let sizeCssQueued = false;

export function updateSizeCss(): void {
  if (sizeCssQueued) return;
  sizeCssQueued = true;
  queueMicrotask(() => {
    sizeCssQueued = false;
    const top = (id: string) => `[role="link"][data-href$="/status/${id}"]:not([role="link"] [role="link"])`;
    const hidden: string[] = [];
    const collapsed = ['[role="link"][data-xs-state="collapsed"]'];
    for (const id of [...sizeState.keys()].slice(-600)) {
      if (revealed.has(id)) continue;
      const s = sizeState.get(id)!;
      if (s.hidden) hidden.push(`li[data-index]:has(${top(id)})`);
      else if (s.why) collapsed.push(top(id));
    }
    const rules = [NEW.collapseCss(`:is(${collapsed.join(', ')})`), OLD.collapseCss()];
    if (hidden.length) {
      rules.unshift(`${hidden.join(',\n')} { height: 1px !important; overflow: hidden !important; }`);
      rules.unshift(`${hidden.map((h) => h + ' > *').join(',\n')} { display: none !important; }`);
    }
    putStyle(sizeCss, st.S.enabled ? rules.join('\n') : '');
  });
}

// Synchronous, so it runs before layout and X's list measures the post at its final size.
export function applyKnownSize(node: Node): void {
  if (node.nodeType !== 1 || !sizeState.size) return;
  const el = node as HTMLElement;
  const roots = el.matches(POST) ? [el] : el.querySelectorAll<HTMLElement>(POST);
  for (const root of roots) {
    const m = /\/status\/(\d+)/.exec(root.getAttribute('data-href') || '');
    const s = m && sizeState.get(m[1]);
    if (!m || !s || revealed.has(m[1])) continue;
    if (s.hidden) {
      const cell = root.closest<HTMLElement>(CELL);
      if (cell) cell.dataset.xsHidden = '1';
    } else if (s.why) {
      root.dataset.xsState = 'collapsed';
      root.dataset.xsWhy = s.why;
    }
  }
}
