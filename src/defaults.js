(function (XS) {
  'use strict';

  // Actions, from mildest to strongest: none < mask (words only) < dim < collapse < hide
  XS.DEFAULTS = {
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
      replyAction: 'dim', // what to do with replies from paid checkmarks
      weight: 15, // how much a paid check adds to the bot score
      check: 'keep', // 'keep' | 'grey' | 'hide' the paid checkmark icon
    },
    // Blur profile pictures (until you hover the post) of accounts you don't follow
    pfp: {
      others: true, // accounts without a paid checkmark
      paid: true, // paid checkmarks
    },
    replies: {
      media: 'blur', // media in replies from accounts you don't follow: 'none' | 'blur' | 'unload' | 'hide'
    },
    lang: {
      slurAction: 'collapse',
      profanityAction: 'mask',
      custom: '',
      customAction: 'collapse',
    },
    theme: {
      preset: 'quiettl', // 'Quiet'
      font: 'default',
      calm: true, // tone down bright buttons, colored banners, pink badges
      softText: true, // slightly dimmer text, semi-bold instead of bold, airier post text
      custom: {
        bg: '#121316',
        surface: '#1b1d22',
        border: '#2c2f36',
        muted: '#8a909a',
        text: '#e4e6ea',
        accent: '#4c8bf5',
      },
    },
    repost: {
      mark: true, // tag accounts that mostly repost / post others' content
      media: 'blur', // 'none' | 'blur' | 'unload' (placeholder, click to load) | 'hide'
      noAutoplay: true, // pause their videos unless you click play
      minPosts: 4, // posts seen before judging an account
      ratio: 50, // % non-original to count as a reposter
      aggregators: true, // high-volume, media-heavy accounts count as reposters
      aggPerDay: 30, // posts/day (lifetime average) to count as an aggregator
      themed: true, // mark single-topic media accounts (only capybaras, only foxes…)
      themedMedia: true, // treat their media like reposters'
      list: '', // handles always treated as reposters
    },
    declutter: {
      upsells: true,
      ads: true, // hide promoted posts
      sidebar: false,
      logo: true,
      popups: true,
      navIcons: true,
      profileTop: true, // profile button at the top of the left column
      narrowTabs: true, // short fixed-width underline under For you / Following
      borders: true, // remove center column borders
      rounded: true, // rounded hover shape for posts
      cardRadius: 12, // right sidebar cards, px
      searchRadius: 999, // search box, px (999 = pill)
      mediaRadius: 12, // images/videos in posts, px
      outlineChecks: true, // outlined verified checkmarks
      viewsInline: true, // view count after the post date instead of in the action bar
      sideActions: true, // bookmark + share under the avatar (timeline posts)
      notInterested: true, // 'Not interested' button under the avatar for accounts you don't follow
      shareIcon: 'forward', // 'x' | 'forward' | 'nodes'
      bannerRadius: 8, // profile banner, px
      menuRadius: 12, // popup menus and search suggestions, px
    },
    // Left menu items: true = shown
    nav: {
      home: true, explore: true, notifications: true, follow: true, chat: true, calls: true, grok: true,
      history: true, creators: true, premium: true, profile: true, more: true,
    },
    blurStyle: 'smooth', // 'smooth' | 'contour' — for blurred avatars and media
    blurMono: true, // blurred avatars and media in greyscale
    allow: '',
  };

  // Left menu items → how to find them (label, selector inside <nav>)
  XS.NAV_ITEMS = [
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

  // Deep-merge stored settings over defaults, keeping only known keys of the right type.
  XS.merge = function merge(base, over) {
    if (base && typeof base === 'object' && !Array.isArray(base)) {
      const out = {};
      const src = over && typeof over === 'object' ? over : {};
      for (const k of Object.keys(base)) out[k] = merge(base[k], src[k]);
      return out;
    }
    return over === undefined || typeof over !== typeof base ? base : over;
  };

  XS.parseList = function (s) {
    return String(s || '')
      .split(/[\n,]+/)
      .map((x) => x.trim().replace(/^@/, '').toLowerCase())
      .filter(Boolean);
  };
})((globalThis.XS = globalThis.XS || {}));
