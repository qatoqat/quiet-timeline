import { DEFAULTS, merge, parseList } from '../shared/defaults';
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
  flag('data-xs-upsells', S.declutter.upsells);
  flag('data-xs-sidebar', S.declutter.sidebar);
  flag('data-xs-logo', S.declutter.logo);
  flag('data-xs-navicons', S.declutter.navIcons);
  flag('data-xs-profile-top', S.declutter.profileTop);
  flag('data-xs-narrow-tabs', S.declutter.narrowTabs);
  flag('data-xs-noborders', S.declutter.borders);
  flag('data-xs-rounded', S.declutter.rounded);
  flag('data-xs-solid-bars', S.declutter.solidBars);
  flag('data-xs-no-grok', S.declutter.grokButtons);
  flag('data-xs-no-chat-button', S.declutter.chatButton);
  flag('data-xs-accent-post', S.theme.accentPost && S.theme.preset !== 'off');
  flag('data-xs-accent-follow', S.theme.accentFollow && S.theme.preset !== 'off');
  flag('data-xs-accent-tabs', S.theme.accentTabs && S.theme.preset !== 'off');
  flag('data-xs-views-inline', S.declutter.viewsInline);
  flag('data-xs-paid-check', true, S.paid.check);
  flag('data-xs-blur', true, S.blurStyle);
  flag('data-xs-blur-mono', S.blurMono);
  if (on && S.blurStyle === 'contour') ensureContourFilters();
  root.style.setProperty('--xs-card-radius', `${S.declutter.cardRadius}px`);
  root.style.setProperty('--xs-search-radius', `${S.declutter.searchRadius}px`);
  root.style.setProperty('--xs-media-radius', `${S.declutter.mediaRadius}px`);
  root.style.setProperty('--xs-banner-radius', `${S.declutter.bannerRadius}px`);
  root.style.setProperty('--xs-menu-radius', `${S.declutter.menuRadius}px`);
  applyTheme(S.theme, on);
  applyNavVisibility();

  if (!on && prevEnabled) clearAll();
  updateSizeCss();
  schedule();
}

// Same order as the original single script: capture listeners on window depend on it.
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
