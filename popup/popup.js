(async function () {
  'use strict';
  const XS = globalThis.XS;

  const ACTIONS = [
    ['none', 'Show'],
    ['dim', 'Dim'],
    ['collapse', 'Collapse'],
    ['hide', 'Hide'],
  ];
  for (const sel of document.querySelectorAll('select.action')) {
    const opts = sel.classList.contains('mask') ? [ACTIONS[0], ['mask', 'Mask word'], ...ACTIONS.slice(1)] : ACTIONS;
    for (const [v, label] of opts) sel.add(new Option(label, v));
  }

  // Left menu item checkboxes
  const navBox = document.getElementById('nav-items');
  for (const [key, label] of XS.NAV_ITEMS) {
    const l = document.createElement('label');
    l.className = 'check';
    l.innerHTML = `<input type="checkbox" data-path="nav.${key}" /> `;
    l.append(label);
    navBox.append(l);
  }

  const get = (obj, path) => path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);
  const set = (obj, path, val) => {
    const keys = path.split('.');
    const last = keys.pop();
    keys.reduce((o, k) => (o[k] = o[k] || {}), obj)[last] = val;
  };

  const stored = (await chrome.storage.sync.get('settings')).settings;
  const S = XS.merge(XS.DEFAULTS, stored);

  const fields = document.querySelectorAll('[data-path]');
  const custom = document.getElementById('custom');
  const sync = () => (custom.hidden = S.theme.preset !== 'custom');

  for (const el of fields) {
    const v = get(S, el.dataset.path);
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v;
    el.addEventListener(el.type === 'color' ? 'input' : 'change', () => {
      let val = el.type === 'checkbox' ? el.checked : el.value;
      if (el.type === 'number') val = Math.max(+el.min || 0, Math.min(+el.max || 100, Number(val) || 0));
      set(S, el.dataset.path, val);
      sync();
      save();
    });
  }
  sync();

  // Tabs (remember the last one).
  const tabs = document.querySelectorAll('.tabs button');
  const show = (name) => {
    for (const b of tabs) b.setAttribute('aria-selected', String(b.dataset.tab === name));
    for (const sec of document.querySelectorAll('section[data-tab]')) sec.hidden = sec.dataset.tab !== name;
    try {
      localStorage.setItem('xsieve-tab', name);
    } catch (_) {}
  };
  for (const b of tabs) b.addEventListener('click', () => show(b.dataset.tab));
  let last = 'accounts';
  try {
    last = localStorage.getItem('xsieve-tab') || last;
  } catch (_) {}
  show(last);

  let timer = null;
  function save() {
    clearTimeout(timer);
    timer = setTimeout(() => chrome.storage.sync.set({ settings: S }), 250);
  }

  // Inside the in-page panel: report height, offer a close button.
  if (window.top !== window) {
    document.documentElement.classList.add('in-panel');
    const report = () => parent.postMessage({ xsievePanelHeight: document.documentElement.scrollHeight }, '*');
    new ResizeObserver(report).observe(document.body);
    report();
    document.getElementById('close').addEventListener('click', () => parent.postMessage({ xsievePanel: 'close' }, '*'));
    window.addEventListener('keydown', (e) => e.key === 'Escape' && parent.postMessage({ xsievePanel: 'close' }, '*'));
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const r = await chrome.tabs.sendMessage(tab.id, { type: 'xsieve-stats' });
    if (r) {
      document.getElementById('stats').textContent =
        `This tab: ${r.hidden} hidden · ${r.collapsed} collapsed · ${r.dimmed} dimmed · ${r.masked} masked · ${r.media} media blurred · ${r.ads} ads · ${r.popups} popups closed`;
    }
  } catch (_) {
    /* not an X tab */
  }
})();
