import { ACTIONS, DEFAULTS, MASK, MEDIA, merge, NAV_ITEMS } from '../shared/defaults';
import { hex, KEYS, lum, onAccent, PRESETS } from '../theme/color';

type Obj = Record<string, unknown>;

(async function () {
  const fill = (sel: HTMLSelectElement, opts: [string, string][]) => {
    for (const [v, label] of opts) sel.add(new Option(label, v));
  };
  for (const sel of document.querySelectorAll<HTMLSelectElement>('select.action')) {
    fill(sel, sel.classList.contains('mask') ? [ACTIONS[0], MASK, ...ACTIONS.slice(1)] : ACTIONS);
  }
  for (const sel of document.querySelectorAll<HTMLSelectElement>('select.media')) fill(sel, MEDIA);

  const navBox = document.getElementById('nav-items')!;
  for (const [key, label] of NAV_ITEMS) {
    const l = document.createElement('label');
    l.className = 'tg';
    l.innerHTML = `<input type="checkbox" data-path="nav.${key}" /> `;
    l.append(label);
    navBox.append(l);
  }

  const get = (obj: Obj, path: string) => path.split('.').reduce<unknown>((o, k) => (o ? (o as Obj)[k] : undefined), obj);
  const set = (obj: Obj, path: string, val: unknown) => {
    const keys = path.split('.');
    const last = keys.pop()!;
    keys.reduce<Obj>((o, k) => (o[k] = o[k] || {}) as Obj, obj)[last] = val;
  };

  const stored = (await chrome.storage.sync.get('settings')).settings;
  const S = merge(DEFAULTS, stored);

  const fields = document.querySelectorAll<HTMLInputElement>('[data-path]');
  const custom = document.getElementById('custom')!;
  const accentRow = document.getElementById('accent-custom')!;
  // the pen chip comes first so its picker opens inside the panel
  const PRESET_ACCENTS = ['#1d9bf0', '#ffd400', '#f91880', '#7856ff', '#ff7a00', '#00ba7c', '#4c8bf5'];
  const accentInput = accentRow.querySelector('input')!;
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
    const pick = accentRow.querySelector<HTMLElement>('.pick')!;
    const cur = S.theme.accentColor.toLowerCase();
    const c = /^#[0-9a-f]{6}$/.test(cur) ? cur : '#4c8bf5';
    pick.style.setProperty('--pick', c);
    pick.style.setProperty('--pick-fg', onAccent(c)); // as on the page's accent buttons
    for (const b of chips) b.setAttribute('aria-pressed', String(b.title === cur));
    pick.style.outline = PRESET_ACCENTS.includes(cur) ? '' : '2px solid var(--text, #e4e6ea)';
  };
  // the panel wears the chosen theme (X default: its own dark/light colors)
  const paint = () => {
    const t = S.theme;
    const p = t.preset === 'custom' ? t.custom : PRESETS[t.preset];
    const root = document.documentElement.style;
    for (const k of [...KEYS, 'accent'] as const) {
      if (p) root.setProperty(`--${k}`, k === 'accent' && t.accentMode === 'custom' ? t.accentColor : p[k]);
      else root.removeProperty(`--${k}`);
    }
    root.colorScheme = p ? (lum(...hex(p.bg)) > 0.5 ? 'light' : 'dark') : '';
  };
  // data-needs="path" or "path!=value": a control that only works while that holds
  const needy = [...fields].filter((el) => el.dataset.needs);
  const holds = (need: string) => {
    const [path, not] = need.split('!=');
    const v = get(S as unknown as Obj, path);
    return not === undefined ? !!v : v !== not;
  };
  const sync = () => {
    custom.hidden = S.theme.preset !== 'custom';
    accentRow.hidden = S.theme.accentMode !== 'custom' || S.theme.preset === 'off';
    for (const el of needy) el.disabled = !holds(el.dataset.needs!);
    markChip();
    paint();
  };

  for (const el of fields) {
    const path = el.dataset.path!;
    const v = get(S as unknown as Obj, path);
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v as string;
    el.addEventListener(el.type === 'color' ? 'input' : 'change', () => {
      const val =
        el.type === 'checkbox' ? el.checked : el.type === 'number' ? Math.max(+el.min || 0, Math.min(+el.max, Number(el.value) || 0)) : el.value;
      set(S as unknown as Obj, path, val);
      if (el.type === 'number') el.value = String(val);
      sync();
      save();
    });
  }
  sync();

  const tabs = document.querySelectorAll<HTMLButtonElement>('.tabs button');
  const show = (name: string) => {
    for (const b of tabs) b.setAttribute('aria-selected', String(b.dataset.tab === name));
    for (const sec of document.querySelectorAll<HTMLElement>('section[data-tab]')) sec.hidden = sec.dataset.tab !== name;
    try {
      localStorage.setItem('quiettl-tab', name);
    } catch (_) {}
  };
  for (const b of tabs) b.addEventListener('click', () => show(b.dataset.tab!));
  let last = 'filter';
  try {
    last = localStorage.getItem('quiettl-tab') || last;
  } catch (_) {}
  show([...tabs].some((b) => b.dataset.tab === last) ? last : 'filter');

  const close = () => parent.postMessage({ quiettlPanel: 'close' }, '*');
  let timer: ReturnType<typeof setTimeout> | undefined;
  function flush() {
    clearTimeout(timer);
    timer = undefined;
    // after an extension reload or update the open panel is left behind and chrome.* calls throw: close it
    if (!chrome.runtime?.id) return close();
    chrome.storage.sync.set({ settings: S });
  }
  function save() {
    clearTimeout(timer);
    timer = setTimeout(flush, 250);
  }
  addEventListener('pagehide', () => {
    // closed while typing (Esc, a click on the page): the field never sent its change
    const el = document.activeElement as HTMLElement | null;
    if (el && el.dataset.path) el.dispatchEvent(new Event('change'));
    if (timer) flush();
  });

  const report = () => parent.postMessage({ quiettlPanelHeight: document.body.offsetHeight }, '*');
  new ResizeObserver(report).observe(document.body);
  report();
  document.getElementById('close')!.addEventListener('click', close);
  window.addEventListener('keydown', (e) => e.key === 'Escape' && close());

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const r = await chrome.tabs.sendMessage(tab.id!, { type: 'quiettl-stats' });
    if (r) {
      document.getElementById('stats')!.textContent =
        `This tab: ${r.hidden} hidden · ${r.collapsed} collapsed · ${r.dimmed} dimmed · ${r.masked} masked · ${r.media} media covered · ${r.ads} ads · ${r.popups} popups closed`;
    }
  } catch (_) {
    // not an X tab
  }
})();
