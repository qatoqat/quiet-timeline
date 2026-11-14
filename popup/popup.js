(async function () {
  'use strict';
  const XS = globalThis.XS;

  const ACTIONS = [
    ['none', 'Show'],
    ['dim', 'Dim'],
    ['collapse', 'Collapse'],
    ['hide', 'Hide'],
  ];
  for (const sel of /** @type {NodeListOf<HTMLSelectElement>} */ (document.querySelectorAll('select.action'))) {
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

  const fields = /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('[data-path]'));
  const custom = document.getElementById('custom');
  const accentRow = document.getElementById('accent-custom');
  // quick picks: X's display colors and the theme's accent; the pen chip
  // (first, so its picker opens inside the panel) picks anything
  const PRESET_ACCENTS = ['#1d9bf0', '#ffd400', '#f91880', '#7856ff', '#ff7a00', '#00ba7c', '#4c8bf5'];
  const accentInput = /** @type {HTMLInputElement} */ (accentRow.querySelector('input'));
  const chips = PRESET_ACCENTS.map((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.style.background = c;
    b.title = c;
    b.addEventListener('click', () => {
      accentInput.value = c;
      accentInput.dispatchEvent(new Event('input'));
    });
    accentRow.appendChild(b);
    return b;
  });
  const markChip = () => {
    // the picker chip shows the current custom color, with a pen icon in a readable color
    const pick = accentRow.querySelector('.pick');
    const cur = S.theme.accentColor.toLowerCase();
    const c = /^#[0-9a-f]{6}$/.test(cur) ? cur : '#4c8bf5';
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    pick.style.setProperty('--pick', c);
    pick.style.setProperty('--pick-fg', 0.2126 * r + 0.7152 * g + 0.0722 * b > 150 ? '#15171b' : '#fff');
    for (const b of chips) b.setAttribute('aria-pressed', String(b.title === cur));
    pick.style.outline = PRESET_ACCENTS.includes(cur) ? '' : '2px solid var(--text, #e4e6ea)';
  };
  const sync = () => {
    custom.hidden = S.theme.preset !== 'custom';
    accentRow.hidden = S.theme.accentMode !== 'custom';
    markChip();
  };

  for (const el of fields) {
    const v = get(S, el.dataset.path);
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v;
    el.addEventListener(el.type === 'color' ? 'input' : 'change', () => {
      const val =
        el.type === 'checkbox' ? el.checked : el.type === 'number' ? Math.max(+el.min || 0, Math.min(+el.max, Number(el.value) || 0)) : el.value;
      set(S, el.dataset.path, val);
      if (el.type === 'number') el.value = String(val); // show the clamped value
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
      localStorage.setItem('quiettl-tab', name);
    } catch (_) {}
  };
  for (const b of tabs) b.addEventListener('click', () => show(b.dataset.tab));
  let last = 'accounts';
  try {
    last = localStorage.getItem('quiettl-tab') || last;
  } catch (_) {}
  show(last);

  let timer = null;
  function save() {
    clearTimeout(timer);
    timer = setTimeout(() => chrome.storage.sync.set({ settings: S }), 250);
  }
  addEventListener('pagehide', () => timer && chrome.storage.sync.set({ settings: S })); // closed right after an edit

  // Shown in the in-page panel (iframe): report height, close on × / Esc.
  const report = () => parent.postMessage({ quiettlPanelHeight: document.documentElement.scrollHeight }, '*');
  new ResizeObserver(report).observe(document.body);
  report();
  document.getElementById('close').addEventListener('click', () => parent.postMessage({ quiettlPanel: 'close' }, '*'));
  window.addEventListener('keydown', (e) => e.key === 'Escape' && parent.postMessage({ quiettlPanel: 'close' }, '*'));

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const r = await chrome.tabs.sendMessage(tab.id, { type: 'quiettl-stats' });
    if (r) {
      document.getElementById('stats').textContent =
        `This tab: ${r.hidden} hidden · ${r.collapsed} collapsed · ${r.dimmed} dimmed · ${r.masked} masked · ${r.media} media blurred · ${r.ads} ads · ${r.popups} popups closed`;
    }
  } catch (_) {
    /* not an X tab */
  }
})();
