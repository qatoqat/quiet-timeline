import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { DEFAULTS, merge, type Settings } from '../src/shared/defaults';
import { createWordFilter } from '../src/shared/words';
import { isPaid, nonOriginal, scoreTweet } from '../src/shared/score';
import { lum, makeMapper, onAccent, onMedia, parseColor, PRESETS, remap, remapDecls } from '../src/theme/color';
import { extract, extractFromScript, snowflakeMs } from '../src/hook/extract';
import type { Tweet, User } from '../src/shared/types';

// Fixtures only set the fields each case needs.
const as = <T>(v: unknown) => v as T;
const S = merge(DEFAULTS, null);

test('merge keeps known keys and types', () => {
  const m = merge(DEFAULTS, { bot: { high: 70, bogus: 1 }, enabled: 'yes' });
  assert.equal(m.bot.high, 70);
  assert.equal(as<Record<string, unknown>>(m.bot).bogus, undefined);
  assert.equal(m.enabled, true);
  assert.equal(m.theme.custom.bg, '#121316');
});

test('extract handles old and new user schemas', () => {
  const json = {
    data: {
      timeline: [
        {
          __typename: 'Tweet',
          rest_id: '200',
          core: {
            user_results: {
              result: {
                __typename: 'User',
                rest_id: '1',
                is_blue_verified: true,
                core: { screen_name: 'farmer8812345', created_at: 'Wed Oct 01 10:00:00 +0000 2026' },
                avatar: { image_url: 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png' },
                legacy: { followers_count: 3, friends_count: 900, statuses_count: 5000 },
                relationship_perspectives: { following: false },
              },
            },
          },
          legacy: { created_at: 'Fri Nov 13 12:00:10 +0000 2026', in_reply_to_status_id_str: '100', in_reply_to_user_id_str: '9', full_text: '@x This is huge 🔥' },
        },
        {
          __typename: 'User',
          rest_id: '2',
          legacy: { screen_name: 'oldschool', created_at: 'Wed Oct 10 20:19:24 +0000 2012', verified_type: 'Business', following: true },
        },
      ],
    },
  };
  const { users, tweets } = extract(json);
  assert.equal(users.length, 2);
  const f = users.find((u) => u.id === '1')!;
  assert.equal(f.handle, 'farmer8812345');
  assert.equal(f.defaultAvatar, true);
  assert.equal(f.blue, true);
  const o = users.find((u) => u.id === '2')!;
  assert.equal(o.vtype, 'Business');
  assert.equal(o.followedByMe, true);
  assert.equal(tweets[0].userId, '1');
  assert.equal(tweets[0].replyTo, '100');
  assert.equal(tweets[0].replyToUser, '9');
  assert.ok(Number.isFinite(f.createdMs));
});

test('word filter: catches variants', () => {
  const f = createWordFilter(S);
  const kinds = (t: string) => f.find(t).map((h) => h.kind);
  assert.deepEqual(kinds('what the fuck'), ['prof']);
  assert.deepEqual(kinds('FUUUUCK this'), ['prof']);
  assert.deepEqual(kinds('sh1t happens'), ['prof']);
  assert.deepEqual(kinds('f u c k off'), ['prof']);
  assert.deepEqual(kinds('motherfuckers!!'), ['prof']);
  assert.deepEqual(kinds('you f@ggot'), ['slur']);
  assert.deepEqual(kinds('n1gg3r'), ['slur']);
});

test('word filter: no false positives', () => {
  const f = createWordFilter(S);
  for (const t of [
    'class assassin Scunthorpe cocktail Dickens shiitake Niger raccoon spice',
    'fire retardant prickly passion Essex hello I am a b c',
    'cockpit dickson',
  ]) {
    assert.deepEqual(f.find(t), [], t);
  }
});

test('word filter: custom words and masking', () => {
  const f = createWordFilter(merge(DEFAULTS, { lang: { custom: 'crypto*\n@spoiler' } }));
  assert.equal(f.find('Cryptocurrency moon')[0].kind, 'custom');
  assert.equal(f.find('big spoilers ahead')[0].kind, 'custom');
  const all = { slur: true, prof: true, custom: true };
  assert.equal(f.mask('what the fuck, man', all), 'what the f•••, man');
  assert.equal(f.mask('f u c k', all), 'f • • •');
  assert.equal(f.mask('nothing here 🙂', all), 'nothing here 🙂');
  assert.equal(f.mask('shit', as({ prof: false })), 'shit');
});

test('score: farmer vs normal account', () => {
  const now = Date.parse('2026-11-14T00:00:00Z');
  const farmer = as<User>({
    handle: 'crypto_king8812345', createdMs: Date.parse('2026-10-01T10:00:00Z'), followers: 12, following: 900,
    statuses: 9000, blue: true, defaultAvatar: false, bio: 'DM for promo 🚀',
  });
  const parent = as<Tweet>({ createdMs: Date.parse('2026-11-13T12:00:00Z') });
  const t = as<Tweet>({ createdMs: Date.parse('2026-11-13T12:00:07Z'), text: '@elon This is huge 🔥🔥', userId: 'f' });
  const a = scoreTweet(farmer, t, { isReply: true, parent, now }, S);
  assert.ok(a.score >= 60, JSON.stringify(a));

  const normal = as<User>({
    handle: 'jane_doe', oldId: true, followers: 400, following: 300,
    statuses: 8000, blue: false, bio: 'birds, bikes, bread',
  });
  const t2 = as<Tweet>({ createdMs: Date.parse('2026-11-13T13:00:00Z'), text: '@elon I tried this last year and the battery died after a week.' });
  const b = scoreTweet(normal, t2, { isReply: true, parent, now }, S);
  assert.ok(b.score < 20, JSON.stringify(b));

  const gold = { ...farmer, vtype: 'Business' };
  assert.ok(!isPaid(gold));
  assert.ok(isPaid(farmer));
});

test('score: copy-paste networks', () => {
  const u = as<User>({ handle: 'someone', createdMs: Date.parse('2015-10-10T00:00:00Z'), followers: 300, following: 200, statuses: 1000 });
  const r = scoreTweet(u, as({ text: 'Great insight, check my pinned post' }), { isReply: true, dupSameUser: 3, dupUsers: 4 }, S);
  assert.ok(r.score >= 50, JSON.stringify(r));
});

test('theme mapper', () => {
  const p = PRESETS.nord;
  const m = makeMapper(p, 'lightsout', p.accent);
  assert.deepEqual(m(0, 0, 0), [0x2e, 0x34, 0x40]); // bg
  assert.deepEqual(m(231, 233, 234), [0xec, 0xef, 0xf4]); // text
  assert.deepEqual(m(29, 155, 240), [0x5e, 0x81, 0xac]); // X's blue → the accent
  assert.equal(makeMapper(p, 'lightsout')(29, 155, 240), null); // "Same as X": X's blue stays
  assert.equal(m(249, 24, 128), null); // like-pink untouched
  const md = makeMapper(p, 'dim');
  assert.deepEqual(md(21, 32, 43), [0x2e, 0x34, 0x40]);
  const ml = makeMapper(p, 'light');
  assert.deepEqual(ml(255, 255, 255), [0x2e, 0x34, 0x40]);
  assert.deepEqual(ml(15, 20, 25), [0xec, 0xef, 0xf4]);
  assert.equal(
    remap('color: rgba(231, 233, 234, 0.5); border-color: rgb(249, 24, 128);', m),
    'color: rgba(236, 239, 244, 0.5); border-color: rgb(249, 24, 128);',
  );
});

test('inline recoloring: X\'s color variables themed, our own left alone', () => {
  const m = makeMapper(PRESETS.quiettl, 'lightsout', PRESETS.quiettl.accent);
  const out = remapDecls('--article-tone-dark: rgb(42 41 37); --xs-bg: rgb(21, 23, 27); --qt-page-bg: rgb(21, 23, 27)', m, /^--(xs|qt)-/);
  assert.ok(!out.includes('rgb(42 41 37)'), out);
  assert.ok(out.includes('--xs-bg: rgb(21, 23, 27)') && out.includes('--qt-page-bg: rgb(21, 23, 27)'), out);
  assert.equal(remapDecls('--x-bg: rgb(0, 0, 0)', m), '--x-bg: rgb(0, 0, 0)'); // stylesheets: every custom property kept
});

test('new x-web schema, embedded page data, originality', () => {
  const tweet = {
    __typename: 'Tweet', rest_id: '2121109552108351631',
    core: { user_results: { result: { __typename: 'User', rest_id: '1194889317388374016', core: { screen_name: 'agg' },
      relationship_counts: { followers: 10, following: 900 }, tweet_counts: { tweets: 50000 },
      verification: { is_blue_verified: true }, relationship_perspectives: { following: false } } } },
    details: { created_at_ms: 1794546900000, full_text: 'Wow 🎥 IG: @someone https://t.co/x' },
    reply_to_results: { rest_id: '100' },
    reply_to_user_results: { rest_id: '1194889317388374016' }, // a part of its own thread
    media_entities2: [{ type: 'video', additional_media_info: { source_user_results: { result: { core: { screen_name: 'orig' } } } } }],
  };
  const page = 'self.$R=1;$R[51]={kind:"Result.Ok",value:' + JSON.stringify(JSON.stringify({ data: { x: tweet } })) + '};';
  const { users, tweets } = extractFromScript(page);
  assert.equal(users[0].handle, 'agg');
  assert.equal(users[0].followers, 10);
  assert.equal(users[0].blue, true);
  assert.equal(new Date(users[0].createdMs!).getUTCFullYear(), 2019);
  assert.equal(tweets[0].replyTo, '100');
  assert.equal(tweets[0].replyToUser, tweets[0].userId);
  assert.equal(tweets[0].copiedFrom, 'orig');
  assert.equal(nonOriginal(tweets[0]), 'media from @orig');
  assert.equal(nonOriginal(as({ text: 'just my cat', hasMedia: true })), null);
  assert.equal(nonOriginal(as({ text: 'amazing 🎥: @bob', hasMedia: true })), 'credited to someone else');
  assert.equal(snowflakeMs('177101260'), null);
  assert.equal(parseColor('#ffffff26')!.a, '0.149');
  const m = makeMapper(PRESETS.nord, [[0, 0, 0], [20, 20, 20], [38, 38, 38], [153, 153, 153], [255, 255, 255]], PRESETS.nord.accent);
  assert.equal(remap('color-mix(in srgb, #1d9bf0 14%, #000)', m), 'color-mix(in srgb, rgb(94, 129, 172) 14%, rgb(46, 52, 64))');
});

test('"Not interested" only on posts whose own feed entry offers it', () => {
  const tw = (id: string, extra = {}) => ({ __typename: 'Tweet', rest_id: id, legacy: { full_text: 'x' }, ...extra });
  const dontLike = { key: 'k1', value: { feedback_type: 'DontLike', icon: 'Frown' } };
  // new app: snake_case, the entry's tweet under content.content
  const fresh = {
    data: { home_timeline: { home_timeline_urt: {
      instructions: [{ entries: [
        { entry_id: 'tweet-1', content: { content: { tweet_results: { result: tw('1') } }, feedback_info: { feedback_keys: ['k1'] } } },
        { entry_id: 'promoted-tweet-2', content: { content: { tweet_results: { result: tw('2') } } } },
        { entry_id: 'tweet-3', content: { content: { tweet_results: { result: { __typename: 'TweetWithVisibilityResults', tweet: tw('3') } } }, feedback_info: { feedback_keys: ['k1'] } } },
      ] }],
      response_objects: { feedback_actions: [dontLike, { key: 'k9', value: { feedback_type: 'SeeFewer' } }] },
    } } },
  };
  assert.deepEqual(extract(fresh).ni.sort(), ['1', '3']);
  // old app: a conversation (a reply under the post it answers); only the reply's own item offers it,
  // a repost's original counts, other feedback types don't
  const old = {
    data: { home: { home_timeline_urt: {
      instructions: [{ entries: [
        { entryId: 'home-conversation-9', content: { feedbackInfo: { feedbackKeys: ['k1'] }, items: [
          { entryId: 'home-conversation-9-tweet-10', item: { itemContent: { tweet_results: { result: tw('10') } } } },
          { entryId: 'home-conversation-9-tweet-11', item: { itemContent: { tweet_results: { result: tw('11') } }, feedbackInfo: { feedbackKeys: ['k1'] } } },
        ] } },
        { entryId: 'tweet-20', content: { itemContent: { tweet_results: { result: tw('20', { legacy: { retweeted_status_result: { result: tw('21') } } }) } }, feedbackInfo: { feedbackKeys: ['k1'] } } },
        { entryId: 'tweet-30', content: { itemContent: { tweet_results: { result: tw('30') } }, feedbackInfo: { feedbackKeys: ['k9'] } } },
      ] }],
      responseObjects: { feedbackActions: [{ key: 'k1', value: { feedbackType: 'DontLike', icon: 'Frown' } }, { key: 'k9', value: { feedbackType: 'SeeFewer' } }] },
    } } },
  };
  assert.deepEqual(extract(old).ni.sort(), ['11', '20', '21']);
});

test('calm mutes X\'s plum (subscriptions), nothing else saturated', () => {
  const ramp: [number, number, number][] = [[0, 0, 0], [20, 20, 20], [38, 38, 38], [153, 153, 153], [255, 255, 255]];
  const calm = makeMapper(PRESETS.nord, ramp, null, true);
  const plain = makeMapper(PRESETS.nord, ramp, null, false);
  assert.equal(remap('rgb(201, 54, 204)', plain), 'rgb(201, 54, 204)');
  assert.notEqual(remap('rgb(201, 54, 204)', calm), 'rgb(201, 54, 204)');
  for (const kept of ['rgb(249, 24, 128)', 'rgb(0, 186, 124)', 'rgb(29, 155, 240)']) assert.equal(remap(kept, calm), kept); // like, repost, X blue
  // its outlines (the old app's Subscribe button) become plain borders, its text and icons muted
  const [border, muted] = [parseColor(PRESETS.nord.border)!.rgb, parseColor(PRESETS.nord.muted)!.rgb];
  assert.equal(remapDecls('border-color: rgb(201, 54, 204); color: rgb(201, 54, 204)', calm), `border-color: rgb(${border.join(', ')}); color: rgb(${muted.join(', ')})`);
});

test('farmer signals', () => {
  const s = as<Settings>({ paid: { weight: 15 } });
  const u = as<User>({ handle: 'news', createdMs: Date.now() - 4000 * 864e5, followers: 9000, following: 100, statuses: 1000 });
  const r = scoreTweet(u, as({ text: '🚨 BREAKING: thing happened #a #b #c #d' }), { seen: { total: 10, replies: 9 } }, s);
  assert.deepEqual(r.reasons, ['alarm-style hook', 'hashtag spam', '90% of seen posts are replies']);
});

test("X's whites and blacks on photos stay light and dark in X's light mode; faint hover tints follow the page", async () => {
  (globalThis as { document?: unknown }).document ??= { createElement: () => ({}) }; // (it makes its <style> on import)
  const { overrides, ts } = await import('../src/theme/vars');
  const light = { '--x-bg-primary': '#fff', '--x-bg-secondary': '#f7f9f9', '--x-bg-tertiary': '#eff3f4', '--x-fg-secondary': '#536471', '--x-fg-primary': '#0f1419' };
  const out = overrides({ ...light, '--x-white': '#fff', '--x-black': '#000', '--x-black-40': '#0006', '--x-black-04': '#0000000a', '--x-white-70': '#ffffffb3', '--x-fg-on-color': '#fff', '--x-fg-on-brand': '#000', '--x-toast-bg': '#2229' }, PRESETS.quiettl, false)!;
  const val = (k: string) => new RegExp(`${k}: ([^;]+?) !important`).exec(out)?.[1];
  const [bg, text] = [PRESETS.quiettl.bg, PRESETS.quiettl.text].map((h) => parseColor(h)!.rgb.join(', '));
  assert.equal(val('--x-white'), `rgb(${text})`); // text on a photo
  assert.equal(val('--x-black'), `rgb(${bg})`);
  assert.equal(val('--x-black-40'), `rgba(${bg}, 0.4)`); // a scrim
  assert.equal(val('--x-fg-on-color'), `rgb(${text})`); // a video's play button and time on it, a toast's text
  assert.equal(val('--x-toast-bg'), `rgba(${bg}, 0.6)`); // under that text
  assert.equal(val('--x-fg-on-brand'), '#000'); // X's own on its own accent (black on yellow, orange, green)
  ts.accent = '#4c8bf5';
  assert.equal(/--x-fg-on-brand: ([^;]+?) !important/.exec(overrides({ ...light, '--x-fg-on-brand': '#000' }, PRESETS.quiettl, false)!)?.[1], 'var(--qt-on-accent)');
  ts.accent = null;
  // text on an accent: X's own pairings (white on its blue, pink, purple; black on yellow, orange, green)
  for (const c of ['#1d9bf0', '#f91880', '#7856ff', '#4c8bf5']) assert.equal(onAccent(c), '#ffffff', c);
  for (const c of ['#ffd400', '#ff7a00', '#00ba7c']) assert.equal(onAccent(c), '#15171b', c);
  assert.equal(val('--x-white-70'), `rgba(${text}, 0.702)`);
  assert.equal(val('--x-black-04'), `rgba(${text}, 0.039)`); // a hover tint on the (now dark) page
  assert.equal(val('--x-bg-primary'), `rgb(${bg})`);
});

test("old app: X's whites and blacks on media stay light and dark when X's mode and ours differ", () => {
  const ml = makeMapper(PRESETS.quiettl, 'light');
  const mm = onMedia(ml, PRESETS.quiettl, 'light')!;
  const [bg, text] = [PRESETS.quiettl.bg, PRESETS.quiettl.text].map((h) => parseColor(h)!.rgb.join(', '));
  assert.equal(remap('background-color: rgba(0, 0, 0, 0.77)', mm), `background-color: rgba(${bg}, 0.77)`); // a video's time pill
  assert.equal(remap('color: rgb(255, 255, 255)', mm), `color: rgb(${text})`); // its text
  assert.equal(remap('background-color: rgba(15, 20, 25, 0.75)', mm), `background-color: rgba(${bg}, 0.75)`); // a button disc
  assert.equal(remap('background-color: rgba(0, 0, 0, 0.03)', mm), remap('background-color: rgba(0, 0, 0, 0.03)', ml)); // a hover tint
  // X's hover / pressed fills of those buttons (10% / 20% lighter) stay dark under the light glyph, a step up
  const fill = (c: string, m = mm) => lum(...parseColor(remap(`background-color: ${c}`, m))!.rgb);
  for (const c of ['rgba(39, 44, 48, 0.75)', 'rgba(63, 67, 71, 0.75)', 'rgba(26, 26, 26, 0.77)', 'rgba(51, 51, 51, 0.77)']) {
    assert.ok(fill(c) < 0.4 && fill(c) > fill('rgba(15, 20, 25, 0.75)'), c);
    assert.ok(fill(c, ml) > 0.5, c); // (off media they follow the page)
  }
  assert.equal(remap('background-color: rgb(39, 44, 48)', mm), remap('background-color: rgb(39, 44, 48)', ml)); // opaque: the page's
  assert.equal(remap('color: rgb(255, 255, 255)', ml), `color: rgb(${bg})`); // off media: X's light page stays ours
  assert.equal(onMedia(makeMapper(PRESETS.quiettl, 'lightsout'), PRESETS.quiettl, 'lightsout'), null); // same way round
  assert.ok(onMedia(makeMapper(PRESETS.paper, 'lightsout'), PRESETS.paper, 'lightsout'));
});
