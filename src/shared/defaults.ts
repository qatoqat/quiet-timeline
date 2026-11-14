import { PRESETS } from '../theme/color';

export const NAV_ITEMS: [key: string, label: string, selector: string][] = [
  ['home', 'Home', 'a[href="/home"]'],
  ['explore', 'Explore', 'a[href="/explore"]'],
  ['notifications', 'Notifications', 'a[href="/notifications"]'],
  ['follow', 'Follow', 'a[href="/i/connect_people"]'],
  ['chat', 'Chat', 'a[href^="/i/chat"]'],
  ['calls', 'Calls', 'a[href^="/i/calls"]'],
  ['grok', 'Grok', 'a[href^="/i/grok"]'],
  ['history', 'History', 'a[href^="/i/history"]'],
  ['creators', 'Creator Studio', 'a[href^="/i/jf/creators"]'],
  ['premium', 'Premium', 'a[href^="/i/premium"]'],
  ['profile', 'Profile', 'a[aria-label="Profile"]'],
  ['more', 'More', 'button[aria-label="More menu items"]'],
];

// The panel's choices for what to do with a post, and with media
export const ACTIONS: [string, string][] = [
  ['none', 'Show'],
  ['dim', 'Dim'],
  ['collapse', 'Collapse'],
  ['hide', 'Hide'],
];
export const MASK: [string, string] = ['mask', 'Mask']; // words only
export const MEDIA: [string, string][] = [
  ['none', 'Show'],
  ['blur', 'Blur'],
  ['unload', "Don't load"],
  ['hide', 'Hide'],
];

// Actions, from mildest to strongest: none < mask (words only) < dim < collapse < hide
export const DEFAULTS = {
  enabled: true,
  bot: {
    scope: 'replies', // 'replies' | 'all'
    high: 60,
    highAction: 'collapse',
    mid: 35,
    midAction: 'dim',
    badges: true,
  },
  paid: {
    replyAction: 'dim',
    weight: 15,
    check: 'keep', // 'keep' | 'grey' | 'hide'
  },
  // Blur avatars (until hover) of accounts you don't follow
  pfp: {
    others: true,
    paid: true,
  },
  replies: {
    media: 'blur', // 'none' | 'blur' | 'unload' | 'hide'
  },
  lang: {
    slurAction: 'collapse',
    profanityAction: 'mask',
    custom: '',
    customAction: 'collapse',
  },
  theme: {
    preset: 'quiettl',
    font: 'default',
    calm: true,
    softText: true,
    accentMode: 'x', // 'x' | 'theme' | 'custom'
    accentColor: '#8b7cf6',
    accentPost: false,
    accentFollow: false,
    accentTabs: false,
    custom: { ...PRESETS.graphite },
  },
  repost: {
    mark: true,
    media: 'blur', // 'none' | 'blur' | 'unload' | 'hide'
    noAutoplay: true,
    minPosts: 4,
    ratio: 50, // % non-original to count as a reposter
    aggregators: true,
    aggPerDay: 30, // lifetime average posts/day
    themed: true,
    themedMedia: true,
    list: '',
  },
  declutter: {
    upsells: true,
    ads: true,
    sidebar: false,
    logo: true,
    popups: true,
    navIcons: true,
    profileTop: true,
    narrowTabs: true,
    borders: true,
    rounded: true,
    cardRadius: 12,
    searchRadius: 999, // 999 = pill
    mediaRadius: 12,
    outlineChecks: true,
    viewsInline: true,
    sideActions: true,
    notInterested: true,
    shareIcon: 'nodes', // 'x' | 'forward' | 'nodes'
    bannerRadius: 8,
    menuRadius: 12,
    solidBars: true,
    grokButtons: true,
    chatButton: true,
  },
  nav: Object.fromEntries(NAV_ITEMS.map(([k]) => [k, true])) as Record<string, boolean>,
  blurStyle: 'smooth', // 'smooth' | 'contour'
  blurMono: true,
  mediaHover: false, // blurred media shows while the pointer is on it
  allow: '',
};

export type Settings = typeof DEFAULTS;

// Deep-merge stored settings over defaults, keeping only known keys of the right type.
export function merge<T>(base: T, over: unknown): T {
  if (base && typeof base === 'object' && !Array.isArray(base)) {
    const out: Record<string, unknown> = {};
    const src = (over && typeof over === 'object' ? over : {}) as Record<string, unknown>;
    for (const k of Object.keys(base)) out[k] = merge((base as Record<string, unknown>)[k], src[k]);
    return out as T;
  }
  return over === undefined || typeof over !== typeof base ? base : (over as T);
}

export function parseList(s: string): string[] {
  return String(s || '')
    .split(/[\n,]+/)
    .map((x) => x.trim().replace(/^@/, '').toLowerCase())
    .filter(Boolean);
}
