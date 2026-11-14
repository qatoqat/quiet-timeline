// Type-check settings for the plain JS (see tsconfig.json). No code depends on
// this file; it only tells the checker what the extension shares.

// The extension's shared namespace (set up by defaults.js, filled by the others).
declare var XS: any;

// DOM looseness: the code works with elements found by selectors and event
// targets inside X's page, which are always HTML elements. Saying so here keeps
// casts out of the code.
interface Element extends Pick<HTMLElement, 'dataset' | 'style' | 'offsetHeight' | 'offsetWidth' | 'offsetTop' | 'offsetLeft' | 'offsetParent' | 'blur' | 'click' | 'title'> {}
interface EventTarget {
  closest?(selectors: string): HTMLElement | null;
  matches?(selectors: string): boolean;
  tagName?: string;
  getAttribute?(name: string): string | null;
  pause?(): void;
}
interface Node {
  closest?(selectors: string): HTMLElement | null;
  matches?(selectors: string): boolean;
  querySelector?(selectors: string): HTMLElement | null;
  querySelectorAll?(selectors: string): NodeListOf<HTMLElement>;
  getAttribute?(name: string): string | null;
  tagName?: string;
}
interface Window {
  __quiettlHook?: any;
}
interface XMLHttpRequest {
  __xsUrl?: string;
}
