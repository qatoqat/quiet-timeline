import type { Extracted, Tweet, User } from '../shared/types';

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
const TWITTER_EPOCH = 1288834974657n;

// IDs above 2^32 are "snowflakes" that encode their creation time.
export function snowflakeMs(id: unknown): number | null {
  try {
    const n = BigInt(id as string);
    return n > 4294967296n ? Number((n >> 22n) + TWITTER_EPOCH) : null;
  } catch (_) {
    return null;
  }
}

function userFrom(o: any): User | null {
  const core = o.core || {};
  const leg = o.legacy || {};
  const rel = o.relationship_perspectives || {};
  const cnt = o.relationship_counts || {};
  const ver = o.verification || {};
  const handle = str(core.screen_name) || str(leg.screen_name);
  if (!handle) return null;
  const avatar = str(o.avatar && o.avatar.image_url) || str(leg.profile_image_url_https) || '';
  const createdStr = str(core.created_at) || str(leg.created_at);
  const parsed = createdStr ? Date.parse(createdStr) : NaN;
  const label =
    (o.identity_profile_labels_highlighted_label && o.identity_profile_labels_highlighted_label.label) ||
    (o.affiliates_highlighted_label && o.affiliates_highlighted_label.label);
  return {
    id: str(o.rest_id),
    handle,
    name: str(core.name) || str(leg.name) || '',
    createdMs: Number.isFinite(parsed) ? parsed : snowflakeMs(o.rest_id),
    // pre-2014 accounts have small sequential ids — age unknown but old
    oldId: !Number.isFinite(parsed) && snowflakeMs(o.rest_id) === null,
    followers: num(cnt.followers) ?? num(leg.followers_count),
    following: num(cnt.following) ?? num(leg.friends_count),
    statuses: num(o.tweet_counts && o.tweet_counts.tweets) ?? num(leg.statuses_count),
    blue: !!(o.is_blue_verified || ver.is_blue_verified),
    vtype: str(ver.verified_type) || str(leg.verified_type) || null,
    label: !!(label && (label.description || label.badge || label.user_label_type)),
    defaultAvatar: !!leg.default_profile_image || /default_profile/.test(avatar),
    followedByMe: !!(rel.following ?? o.is_following ?? leg.following),
    followsMe: !!(rel.followed_by ?? leg.followed_by),
    bio: str(o.profile_bio && o.profile_bio.description) || str(leg.description) || '',
    _partial: !(cnt.followers !== undefined || leg.followers_count !== undefined),
  };
}

// Media copied from someone else's post carries its original source.
function copiedSource(o: any): string | null {
  const lists = [
    o.media_entities2,
    o.legacy && o.legacy.extended_entities && o.legacy.extended_entities.media,
    o.legacy && o.legacy.entities && o.legacy.entities.media,
  ];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const m of list) {
      if (!m) continue;
      const info = m.additional_media_info || {};
      const src = info.source_user_results || m.source_user_results || info.source_user;
      const srcUser = src && (src.result || src);
      const handle = srcUser && ((srcUser.core && srcUser.core.screen_name) || (srcUser.legacy && srcUser.legacy.screen_name));
      if (handle || m.source_status_id_str || info.source_status_id_str) return handle || '?';
    }
  }
  return null;
}

function tweetFrom(o: any): Tweet {
  const leg = o.legacy || {};
  const det = o.details || {};
  const note = o.note_tweet && o.note_tweet.note_tweet_results && o.note_tweet.note_tweet_results.result;
  const author = o.core && o.core.user_results && o.core.user_results.result;
  const legCreated = str(leg.created_at) ? Date.parse(leg.created_at) : NaN;
  const media = o.media_entities2 || (leg.extended_entities && leg.extended_entities.media) || [];
  return {
    id: str(o.rest_id),
    userId: str(author && author.rest_id) || str(leg.user_id_str),
    createdMs: num(det.created_at_ms) ?? (Number.isFinite(legCreated) ? legCreated : snowflakeMs(o.rest_id)),
    replyTo: str(o.reply_to_results && o.reply_to_results.rest_id) || str(leg.in_reply_to_status_id_str) || null,
    text: str(note && note.text) || str(det.full_text) || str(leg.full_text) || '',
    isRetweet: !!(o.retweeted_status_results || o.retweeted_status_result || leg.retweeted_status_result),
    copiedFrom: copiedSource(o),
    hasMedia: Array.isArray(media) && media.length > 0,
  };
}

export function extract(root: any): Extracted {
  const users: User[] = [];
  const tweets: Tweet[] = [];
  const ads: string[] = [];
  const stack: any[] = [root];
  let n = 0;
  while (stack.length) {
    const v = stack.pop();
    if (!v || typeof v !== 'object') continue;
    if (++n > 400000) break;
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) stack.push(v[i]);
      continue;
    }
    if ((v.promoted_metadata || v.promotedMetadata) && v.tweet_results) {
      const r = v.tweet_results.result || {};
      const adId = r.rest_id || (r.tweet && r.tweet.rest_id);
      if (adId) ads.push(String(adId));
    }
    if (v.__typename === 'User' && v.rest_id) {
      const u = userFrom(v);
      if (u) users.push(u);
    } else if (v.__typename === 'Tweet' && v.rest_id && (v.details || v.legacy)) {
      tweets.push(tweetFrom(v));
    }
    for (const k in v) {
      const x = v[k];
      if (x && typeof x === 'object') stack.push(x);
    }
  }
  return { users, tweets, ads };
}

// Server-rendered pages embed results as JS string literals holding JSON:
//   value:"{\"data\":{\"threaded_conversation_with_injections_v2\":...}}"
const LITERAL = /"\{\\"(?:[^"\\]|\\.)*"/g;

export function extractFromScript(text: string): Extracted {
  const users: User[] = [];
  const tweets: Tweet[] = [];
  const ads: string[] = [];
  if (!text || text.indexOf('__typename') < 0) return { users, tweets, ads };
  for (const m of text.match(LITERAL) || []) {
    if (m.indexOf('__typename') < 0) continue;
    try {
      const out = extract(JSON.parse(JSON.parse(m)));
      users.push(...out.users);
      tweets.push(...out.tweets);
      ads.push(...out.ads);
    } catch (_) {}
  }
  return { users, tweets, ads };
}
