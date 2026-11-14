import { DEFAULTS, merge, type Settings } from '../shared/defaults';
import { createWordFilter } from '../shared/words';
import type { TallyRow, Tweet, User } from '../shared/types';

const S0 = merge(DEFAULTS, null);

export const st: {
  S: Settings;
  ver: number;
  filter: ReturnType<typeof createWordFilter>;
  allow: Set<string>;
  repostList: Set<string>;
  myHandle: string | null;
} = { S: S0, ver: 0, filter: createWordFilter(S0), allow: new Set(), repostList: new Set(), myHandle: null };

export interface LangHits {
  slur: boolean;
  prof: boolean;
  custom: boolean;
}

export const users = new Map<string, User>();
export const byHandle = new Map<string, User>(); // lowercase handle
export const tweets = new Map<string, Tweet>();
export const dup = new Map<string, Map<string, Set<string>>>(); // cleaned text → userId → tweet ids
export const langCache = new Map<string, LangHits>();
export const tally = new Map<string, TallyRow>(); // persisted, see data.ts
export const revealed = new Set<string>();
export const mediaRevealed = new Set<string>();
export const playAllowed = new Set<string>(); // posts whose video you started yourself
export const adIds = new Set<string>();

export const stats = {
  hidden: new Set<string>(),
  collapsed: new Set<string>(),
  dimmed: new Set<string>(),
  masked: new Set<string>(),
  popups: new Set<string>(),
  media: new Set<string>(),
  ads: new Set<string>(),
};

export const LEVEL: Record<string, number> = { dim: 1, collapse: 2, hide: 3 };
export const RESERVED = new Set([
  'home', 'explore', 'notifications', 'messages', 'search', 'settings', 'i', 'compose', 'bookmarks',
  'lists', 'communities', 'jobs', 'premium', 'login', 'logout', 'tos', 'privacy',
]);

export const unset = (el: HTMLElement, ...keys: string[]): void => {
  for (const k of keys) delete el.dataset[k];
};
// a data-* flag on one of X's elements: set to val, or removed when val is empty
export const setData = (el: HTMLElement, key: string, val: string | false | null | undefined): void => {
  if (!val) delete el.dataset[key];
  else if (el.dataset[key] !== val) el.dataset[key] = val;
};

export function cap(map: Map<unknown, unknown>, max: number): void {
  if (map.size <= max) return;
  let n = map.size - max * 0.8;
  for (const k of map.keys()) {
    if (n-- <= 0) break;
    map.delete(k);
  }
}
