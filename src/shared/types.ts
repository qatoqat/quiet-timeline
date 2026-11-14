export interface User {
  id?: string;
  handle: string;
  name: string;
  createdMs: number | null;
  oldId: boolean;
  followers?: number;
  following?: number;
  statuses?: number;
  blue: boolean;
  vtype: string | null;
  label: boolean;
  defaultAvatar: boolean;
  followedByMe: boolean;
  followsMe: boolean;
  bio: string;
  _partial: boolean;
}

export interface Tweet {
  id?: string;
  userId?: string;
  createdMs: number | null;
  replyTo: string | null;
  text: string;
  isRetweet: boolean;
  copiedFrom: string | null;
  hasMedia: boolean;
}

export interface Extracted {
  users: User[];
  tweets: Tweet[];
  ads: string[];
}

export interface TallyRow {
  o: number;
  n: number;
  m: number;
  r?: number;
  w?: Record<string, number>;
  wt?: number;
  wv?: number;
  ids: string[];
}

export interface PostInfo {
  id: string;
  handle: string;
  nameEl: HTMLElement | null;
  texts: HTMLElement[];
  text: string;
  paidIcon: boolean;
  noTime?: boolean;
}

export type Palette = { bg: string; surface: string; border: string; muted: string; text: string; accent: string };
