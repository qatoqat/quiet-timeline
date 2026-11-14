import type { Settings } from './defaults';
import type { TallyRow, Tweet, User } from './types';

export interface ScoreCtx {
  isReply?: boolean;
  parent?: Tweet | null;
  domText?: string;
  dupSameUser?: number;
  dupUsers?: number;
  seen?: { total: number; replies: number } | null;
  now?: number;
}

const DAY = 864e5;

// Whole-reply matches (after stripping punctuation/emoji); alone they never reach the "dim" threshold.
const GENERIC = new Set([
  'this', 'this is huge', 'huge', 'wow', 'wow just wow', 'so true', 'true', 'facts', '100', 'exactly',
  'absolutely', 'agreed', 'interesting', 'very interesting', 'big if true', 'let that sink in',
  'thats insane', "that's insane", 'insane', 'wild', 'crazy', 'bullish', 'based', 'well said',
  'great point', 'great post', 'great thread', 'love this', 'thanks for sharing', 'incredible',
  'amazing', 'unbelievable', 'so good', 'beautiful', 'nice', 'this is the way', 'game changer',
  'this is it', 'spot on', 'massive', 'this right here', 'couldnt agree more', "couldn't agree more",
]);

const BAIT = [
  'follow me', 'follow back', 'follow for follow', 'f4f', 'like and retweet', 'like & retweet',
  'rt and follow', 'check my bio', 'link in bio', 'link in my bio', 'check my profile',
  'dm me for', 'drop your', 'reply with', 'comment below', 'say something nice', 'who else',
  'agree?', 'thoughts?', 'bookmark this', "you won't believe", 'must watch', 'giveaway',
];

const SPAM_BIO = [
  'onlyfans', 'nsfw', '🔞', 'dm for promo', 'dm for collab', 'crypto signals', 'forex',
  '100x', 'airdrop', 'sugar daddy', 'cashapp', 'link below', 'ifb', 'follow back', 'follow for follow',
  'promo', 'memecoin', 'telegram', 'whatsapp', 'paid partnership', 'business inquiries', 'dm for business',
];

// "🚨 BREAKING:", "JUST IN:" — the house style of engagement farms.
const ALARM = /^\s*(?:🚨|‼️|❗|⚡️?|🔥)|\b(?:breaking|just in|holy sh\w*|this is huge)\b\s*[:!—–-]/iu;

const STOP = new Set(
  ('this that with from have they them their there what when where which while will would could should about ' +
    'into just like your youre more most some than then were been being only also very much over such here ' +
    'look love cute when after before again ever every always never really today video photo pics watch ' +
    'make made know want need gonna wanna thats dont cant isnt doesnt didnt still because people thing things ' +
    'good great best time year years week right back even well image images used under attribution credit ' +
    'the and for you are but not all can has was his her one our out new now get got see how who why its too any ' +
    'day way may own say she him let lol omg wow yes via did had off use two big old ' +
    'top try let say per amp rt').split(/\s+/),
);

const EMOJI_ONLY = /^[\s\p{Extended_Pictographic}\p{Emoji_Component}\p{P}\p{S}]+$/u;

const CREDIT =
  /(?:🎥|📹|📸|🎬|📷)\s*(?:[:\-–]|by\b|via\b|credit|@|ig\b|tiktok\b)|\b(?:credits?|cred|source|src|via|h\/t)\s*[:\-–]\s*\S|\b(?:credits?|via)\s+@\w|\b(?:ig|tiktok|instagram|youtube|yt|reddit)\s*:\s*@?\w/iu;

export function cleanText(text: string | undefined): string {
  return String(text || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/@\w+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const isPaid = (u: User | null | undefined): boolean => !!(u && u.blue && !u.vtype && !u.label);

export function nonOriginal(t: Tweet | null): string | null {
  if (!t) return null;
  if (t.isRetweet) return 'repost';
  if (t.copiedFrom) return t.copiedFrom === '?' ? 'copied media' : `media from @${t.copiedFrom}`;
  if (t.hasMedia && CREDIT.test(t.text || '')) return 'credited to someone else';
  return null;
}

const singular = (w: string) => (/(?:xes|ches|shes|sses)$/.test(w) ? w.slice(0, -2) : /[^s]s$/.test(w) && w.length > 4 ? w.slice(0, -1) : w);

// Words (singular-ish) and emoji in a post; each counted once per post.
export function topicTokens(text: string): Set<string> {
  const out = new Set<string>();
  const clean = cleanText(text).replace(/#/g, ' ');
  for (const word of clean.match(/\p{L}{3,}/gu) || []) {
    if (STOP.has(word)) continue;
    const w = singular(word);
    if (!STOP.has(w)) out.add(w);
  }
  for (const e of clean.match(/\p{Extended_Pictographic}/gu) || []) if (!/[❤♥🔥😂🤣😭👀💀✨🙏😍🥰👍]/u.test(e)) out.add(e);
  return out;
}

// One topic dominating a media-heavy account (only capybaras, only foxes…).
export function themeOf(row: TallyRow | undefined, u: User | null): { word: string; pct: number; inName: boolean } | null {
  const wt = row?.wt ?? 0;
  if (!row || !row.w || !(wt >= 5)) return null;
  const total = row.o + row.n;
  if (!total || row.m / total < 0.6) return null;
  const handle = ((u && u.handle) || '').toLowerCase();
  const name = ((u && u.name) || '').toLowerCase();
  // "Capybara Nation", "pics_with_fox", "CapybaraLand"
  const nameWords = new Set(
    `${(u && u.handle) || ''} ${(u && u.name) || ''}`
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/[^\p{L}]+/u)
      .map(singular),
  );
  const inNameOf = (word: string) =>
    nameWords.has(word) ||
    (word.length >= 3 && (handle.startsWith(word) || handle.endsWith(word))) ||
    (word.length >= 5 && (handle + ' ' + name).includes(word));
  const mediaHeavy = row.m / total >= 0.75;
  let best: { word: string; pct: number; inName: boolean; rank: number } | null = null;
  for (const [word, c] of Object.entries(row.w)) {
    const pct = c / wt;
    if (word === handle) continue; // brands mention themselves (NASA…)
    const inName = inNameOf(word);
    // A topic in the account's own name needs less evidence: such accounts often post captions that never name it.
    const ok = (c >= 3 && pct >= 0.6) || (inName && c >= 3 && pct >= 0.25) || (inName && mediaHeavy && c >= 2 && pct >= 0.1);
    const rank = pct + (inName ? 0.5 : 0);
    if (ok && (!best || rank > best.rank)) best = { word, pct, inName, rank };
  }
  return best && { word: best.word, pct: Math.round(best.pct * 100), inName: best.inName };
}

export function scoreTweet(u: User | null, t: Tweet | null, ctx: ScoreCtx, s: Settings): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const add = (pts: number, why: string) => {
    score += pts;
    reasons.push(why);
  };
  const now = ctx.now || Date.now();

  if (u) {
    const age = u.createdMs !== null && Number.isFinite(u.createdMs) ? Math.max((now - u.createdMs) / DAY, 1) : u.oldId ? 4000 : null;
    if (age !== null) {
      if (age < 30) add(30, 'account <30 days');
      else if (age < 90) add(20, 'account <3 months');
      else if (age < 365) add(8, 'account <1 year');
    }
    if (/\d{6,}$/.test(u.handle)) add(20, 'auto-generated handle');
    else if (/\d{4,5}$/.test(u.handle)) add(10, 'numeric handle');
    if (u.defaultAvatar) add(20, 'default avatar');
    if (typeof u.followers === 'number') {
      if (u.followers < 50) add(10, '<50 followers');
      if ((u.statuses ?? 0) > 20000 && u.followers < 300) add(15, 'posts a lot, nobody follows');
      if ((u.following ?? 0) > 500 && (u.following ?? 0) > u.followers * 10) add(15, 'follows ≫ followers');
    }
    if (age !== null && typeof u.statuses === 'number') {
      const perDay = u.statuses / age;
      if (perDay > 200) add(35, `${Math.round(perDay)} posts/day (automated)`);
      else if (perDay > 100) add(20, `${Math.round(perDay)} posts/day`);
      else if (perDay > 50) add(10, `${Math.round(perDay)} posts/day`);
    }
    if (isPaid(u)) {
      add(s.paid.weight, 'paid check');
      if (typeof u.followers === 'number' && u.followers < 1000) add(10, 'paid check on tiny account');
    }
    const bio = (u.bio || '').toLowerCase();
    if (bio && SPAM_BIO.some((w) => bio.includes(w))) add(15, 'spammy bio');
    if (u.vtype) score -= 20;
    if (u.followsMe) score -= 15;
  }

  const text = cleanText(t && t.text ? t.text : ctx.domText);
  if (ctx.isReply && text) {
    const bare = text.replace(/[^\p{L}\p{N}\s']/gu, '').replace(/\s+/g, ' ').trim();
    if (EMOJI_ONLY.test(text)) add(20, 'emoji-only reply');
    else if (text.length < 60 && GENERIC.has(bare)) add(15, 'generic reply');
  }
  if (ctx.isReply && t && ctx.parent) {
    const d = (Number(t.createdMs) - Number(ctx.parent.createdMs)) / 1000;
    if (d >= 0 && d < 20) add(20, `replied in ${Math.round(d)}s`);
    else if (d >= 0 && d < 60) add(10, 'replied in <1 min');
  }
  if (text && BAIT.some((p) => text.includes(p))) add(15, 'engagement bait');
  const raw = (t && t.text) || ctx.domText || '';
  if (ALARM.test(raw)) add(10, 'alarm-style hook');
  if ((raw.match(/#\w/g) || []).length >= 4) add(10, 'hashtag spam');
  // Seen replying far more than posting, many times over: reply guy / farmer.
  const seen = ctx.seen;
  if (seen && seen.total >= 8 && seen.replies / seen.total >= 0.85) add(10, `${Math.round((seen.replies / seen.total) * 100)}% of seen posts are replies`);
  if ((ctx.dupSameUser ?? 0) >= 2) add(25, 'copy-pasted replies');
  if ((ctx.dupUsers ?? 0) >= 3) add(25, `same text as ${(ctx.dupUsers ?? 0) - 1} other accounts`);

  return { score: Math.max(0, Math.min(100, score)), reasons };
}
