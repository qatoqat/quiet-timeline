import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { DEFAULTS, merge, type Settings } from '../src/shared/defaults';
import { createWordFilter } from '../src/shared/words';
import { isPaid, nonOriginal, scoreTweet, themeOf, topicTokens } from '../src/shared/score';
import { makeMapper, parseColor, PRESETS, remap, remapDecls } from '../src/theme/color';
import { extract, extractFromScript, snowflakeMs } from '../src/hook/extract';
import type { TallyRow, Tweet, User } from '../src/shared/types';

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
          legacy: { created_at: 'Fri Nov 13 12:00:10 +0000 2026', in_reply_to_status_id_str: '100', full_text: '@x This is huge 🔥' },
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
    media_entities2: [{ type: 'video', additional_media_info: { source_user_results: { result: { core: { screen_name: 'orig' } } } } }],
  };
  const page = 'self.$R=1;$R[51]={kind:"Result.Ok",value:' + JSON.stringify(JSON.stringify({ data: { x: tweet } })) + '};';
  const { users, tweets } = extractFromScript(page);
  assert.equal(users[0].handle, 'agg');
  assert.equal(users[0].followers, 10);
  assert.equal(users[0].blue, true);
  assert.equal(new Date(users[0].createdMs!).getUTCFullYear(), 2019);
  assert.equal(tweets[0].replyTo, '100');
  assert.equal(tweets[0].copiedFrom, 'orig');
  assert.equal(nonOriginal(tweets[0]), 'media from @orig');
  assert.equal(nonOriginal(as({ text: 'just my cat', hasMedia: true })), null);
  assert.equal(nonOriginal(as({ text: 'amazing 🎥: @bob', hasMedia: true })), 'credited to someone else');
  assert.equal(snowflakeMs('177101260'), null);
  assert.equal(parseColor('#ffffff26')!.a, '0.149');
  const m = makeMapper(PRESETS.nord, [[0, 0, 0], [20, 20, 20], [38, 38, 38], [153, 153, 153], [255, 255, 255]], PRESETS.nord.accent);
  assert.equal(remap('color-mix(in srgb, #1d9bf0 14%, #000)', m), 'color-mix(in srgb, rgb(94, 129, 172) 14%, rgb(46, 52, 64))');
});

test('single-topic accounts and farmer signals', () => {
  const row: TallyRow & { w: Record<string, number>; wt: number } = { o: 8, n: 0, m: 7, wt: 0, w: {}, ids: [] };
  const posts = ['Capybaras just vibing', 'capybara bath time 🦫', 'look at this capybara', 'a baby capybara', 'sunday mood', 'Capybara and friends', 'orange cat'];
  for (const p of posts) {
    row.wt++;
    for (const tok of topicTokens(p)) row.w[tok] = (row.w[tok] || 0) + 1;
  }
  const th = themeOf(row, as({ handle: 'capydaily', name: 'Capy' }))!;
  assert.equal(th.word, 'capybara');
  assert.equal(th.pct, 71);
  assert.equal(themeOf({ ...row, m: 1 }, null), null); // text accounts aren't "themed"
  assert.deepEqual([...topicTokens('Foxes and #fox pics https://t.co/a @someone')], ['fox']);

  const s = as<Settings>({ paid: { weight: 15 } });
  const u = as<User>({ handle: 'news', createdMs: Date.now() - 4000 * 864e5, followers: 9000, following: 100, statuses: 1000 });
  const r = scoreTweet(u, as({ text: '🚨 BREAKING: thing happened #a #b #c #d' }), { seen: { total: 10, replies: 9 } }, s);
  assert.deepEqual(r.reasons, ['alarm-style hook', 'hashtag spam', '90% of seen posts are replies']);
});
