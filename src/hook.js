// Runs in the page's own JS world (MAIN). Collects user/tweet data from
//  1. API responses (fetch / XHR to .../graphql/...), and
//  2. data embedded in server-rendered pages (inline <script>s that carry the
//     GraphQL results as escaped JSON strings),
// and forwards a compact summary to the content script.
(function () {
  'use strict';

  const str = (v) => (typeof v === 'string' ? v : undefined);
  const num = (v) => (typeof v === 'number' ? v : undefined);
  const TWITTER_EPOCH = 1288834974657n;

  // IDs above 2^32 are "snowflakes" that encode their creation time.
  function snowflakeMs(id) {
    try {
      const n = BigInt(id);
      return n > 4294967296n ? Number((n >> 22n) + TWITTER_EPOCH) : null;
    } catch (_) {
      return null;
    }
  }

  function userFrom(o) {
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
  function copiedSource(o) {
    const lists = [o.media_entities2, o.legacy && o.legacy.extended_entities && o.legacy.extended_entities.media, o.legacy && o.legacy.entities && o.legacy.entities.media];
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

  function tweetFrom(o) {
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

  function extract(root) {
    const users = [];
    const tweets = [];
    const ads = [];
    const stack = [root];
    let n = 0;
    while (stack.length) {
      let v = stack.pop();
      if (!v || typeof v !== 'object') continue;
      if (++n > 400000) break;
      if (Array.isArray(v)) {
        for (let i = 0; i < v.length; i++) stack.push(v[i]);
        continue;
      }
      if (v.promoted_metadata && v.tweet_results) {
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
  function extractFromScript(text) {
    const users = [];
    const tweets = [];
    const ads = [];
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

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { extract, extractFromScript, snowflakeMs };
    return;
  }

  // Buffer everything until the content script says it's listening, then replay.
  let ready = false;
  const buffer = [];
  const dbg = (window.__xsieveHook = { scripts: 0, scriptTweets: 0, api: 0, apiTweets: 0, apiErr: null, sent: 0, buffered: 0 });
  const send = (out) => {
    dbg.sent += out.tweets.length;
    if (!out.users.length && !out.tweets.length && !out.ads.length) return;
    const msg = { __xsieve: 1, users: out.users, tweets: out.tweets, ads: out.ads };
    if (ready) window.postMessage(msg, location.origin);
    else if (buffer.length < 200) buffer.push(msg), dbg.buffered++;
  };
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.__xsieveReady !== 1) return;
    ready = true;
    for (const m of buffer.splice(0)) window.postMessage(m, location.origin);
  });

  const API = /\/graphql\/|\/i\/api\//;

  const origFetch = window.fetch;
  window.fetch = function (input) {
    const p = origFetch.apply(this, arguments);
    try {
      const url = typeof input === 'string' ? input : input && input.url;
      if (url && API.test(url)) {
        dbg.api++;
        p.then((res) => res.clone().json().then((j) => {
          const out = extract(j);
          dbg.apiTweets += out.tweets.length;
          send(out);
        })).catch((err) => (dbg.apiErr = String(err)));
      }
    } catch (_) {}
    return p;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__xsUrl = String(url);
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (this.__xsUrl && API.test(this.__xsUrl)) {
      this.addEventListener('load', () => {
        try {
          const t = this.responseType;
          const json = t === 'json' ? this.response : t === '' || t === 'text' ? JSON.parse(this.responseText) : null;
          if (json) send(extract(json));
        } catch (_) {}
      });
    }
    return origSend.apply(this, arguments);
  };

  // Inline data scripts are removed after hydration, so catch them as they
  // arrive. Their text streams in after the element is inserted, so rescan
  // whenever it grows (the observer runs before each script executes).
  const scannedLen = new WeakMap();
  const scanScript = (s) => {
    if (s.src) return;
    const text = s.textContent;
    if ((scannedLen.get(s) || 0) >= text.length) return;
    scannedLen.set(s, text.length);
    dbg.scripts++;
    const out = extractFromScript(text);
    dbg.scriptTweets += out.tweets.length;
    send(out);
  };
  for (const s of document.getElementsByTagName('script')) scanScript(s);
  const mo = new MutationObserver((muts) => {
    const todo = new Set();
    for (const m of muts) {
      const t = m.type === 'characterData' ? m.target.parentNode : m.target; // text appended to a script
      if (t && t.nodeName === 'SCRIPT') todo.add(t);
      for (const n of m.addedNodes) if (n.nodeName === 'SCRIPT') todo.add(n);
    }
    for (const s of todo) scanScript(s);
  });
  mo.observe(document, { childList: true, subtree: true, characterData: true });
  document.addEventListener('DOMContentLoaded', () => {
    for (const s of document.getElementsByTagName('script')) scanScript(s); // final, complete text
    setTimeout(() => mo.disconnect(), 5000);
  });
})();
