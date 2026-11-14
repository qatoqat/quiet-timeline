import { DEFAULTS, merge, parseList, type Settings } from '../shared/defaults';
import { createWordFilter } from '../shared/words';
import { applyTheme } from '../theme/index';
import { st, stats, users, tweets, tally, langCache } from './state';
import { initData } from './data';
import { updateSizeCss } from './sizes';
import { processPost, pageCtx } from './post';
import { ensureContourFilters, initMedia } from './media';
import { initSide } from './side';
import { applyNavVisibility, initPage } from './page';
import { schedule, scan, clearAll, initScan } from './scan';

const PANEL_ORIGIN = new URL(chrome.runtime.getURL('')).origin;
let panel: HTMLIFrameElement | null = null;

function closePanel() {
  if (!panel) return;
  panel.remove();
  panel = null;
}

function togglePanel(): void {
  if (panel) return closePanel();
  panel = document.createElement('iframe');
  panel.id = 'quiettl-panel';
  panel.src = chrome.runtime.getURL('popup/popup.html');
  panel.setAttribute('title', 'Quiet Timeline settings');
  document.documentElement.appendChild(panel);
}

(globalThis as any).XS = {
  _debug: {
    stats,
    users,
    tweets,
    tally,
    get settings() {
      return st.S;
    },
    togglePanel,
    scanNow: scan,
    processOne: (r: HTMLElement) => processPost(r, pageCtx()),
  },
};

const DECLUTTER_FLAGS: Record<string, keyof Settings['declutter']> = {
  upsells: 'upsells', sidebar: 'sidebar', logo: 'logo', navicons: 'navIcons', 'profile-top': 'profileTop',
  'narrow-tabs': 'narrowTabs', noborders: 'borders', rounded: 'rounded', 'solid-bars': 'solidBars',
  'no-grok': 'grokButtons', 'no-chat-button': 'chatButton', 'views-inline': 'viewsInline',
};

function applySettings(raw: unknown) {
  const prevEnabled = st.S.enabled;
  const S = (st.S = merge(DEFAULTS, raw));
  st.ver++;
  st.filter = createWordFilter(S);
  st.allow = new Set(parseList(S.allow));
  st.repostList = new Set(parseList(S.repost.list));
  langCache.clear();

  const root = document.documentElement;
  const on = S.enabled;
  const flag = (name: string, cond: boolean, val = '') => (on && cond ? root.setAttribute(name, val) : root.removeAttribute(name));
  for (const [a, k] of Object.entries(DECLUTTER_FLAGS)) flag(`data-xs-${a}`, !!S.declutter[k]);
  const themed = S.theme.preset !== 'off';
  flag('data-xs-accent-post', S.theme.accentPost && themed);
  flag('data-xs-accent-follow', S.theme.accentFollow && themed);
  flag('data-xs-accent-tabs', S.theme.accentTabs && themed);
  flag('data-xs-paid-check', true, S.paid.check);
  flag('data-xs-blur', true, S.blurStyle);
  flag('data-xs-blur-mono', S.blurMono);
  if (on && S.blurStyle === 'contour') ensureContourFilters();
  for (const k of ['card', 'search', 'media', 'banner', 'menu'] as const) root.style.setProperty(`--xs-${k}-radius`, `${S.declutter[`${k}Radius`]}px`);
  applyTheme(S.theme, on);
  applyNavVisibility();

  if (!on && prevEnabled) clearAll();
  updateSizeCss();
  schedule();
}

// Order matters: capture listeners on window run in registration order.
initData();
initPage();
initMedia();
initSide();
initScan();

window.addEventListener('message', (e) => {
  if (e.origin !== PANEL_ORIGIN || !panel || e.source !== panel.contentWindow || !e.data) return;
  if (e.data.quiettlPanel === 'close') closePanel();
  if (typeof e.data.quiettlPanelHeight === 'number') panel.style.height = `${Math.ceil(e.data.quiettlPanelHeight)}px`;
});
window.addEventListener('keydown', (e) => e.key === 'Escape' && closePanel(), true);
window.addEventListener('pointerdown', (e) => panel && e.target !== panel && closePanel(), true);

chrome.storage.sync.get('settings', (r) => applySettings(r && r.settings));
chrome.storage.onChanged.addListener((ch, area) => {
  if (area === 'sync' && ch.settings) applySettings(ch.settings.newValue);
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg && msg.type === 'quiettl-toggle-panel') {
    togglePanel();
    reply({ ok: true });
    return;
  }
  if (msg && msg.type === 'quiettl-stats') {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(stats)) out[k] = v.size;
    reply(out);
  }
});
