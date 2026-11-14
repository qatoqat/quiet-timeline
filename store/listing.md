# Chrome Web Store listing

**Name** (manifest, 30 chars): Quiet Timeline for X (Twitter)

**Summary** (manifest description, ≤132 chars):
A calmer X (Twitter): quiets bots, engagement farmers, paid-check reply spam, slurs and nags, with a soft low-contrast theme.

**Category:** Social & Communication   **Language:** English

## Description

Quiet Timeline makes X (formerly Twitter) calm again. It turns down the noise and leaves the people you follow alone.

**Filter the noise**
• Bots and engagement farmers get a score from account age, posting rate, follower ratio, copy-pasted replies, bait phrases, alarm-style hooks and more. You choose what happens at each level: dim, collapse or hide.
• Paid checkmarks no longer buy trust: dim or collapse their replies, and grey out or hide the badge.
• Slurs and profanity are masked or collapsed, including leetspeak and stretched spellings. You can add your own muted words.
• Repost, aggregator and single-topic accounts (only capybaras, only foxes…) get a tag, and their media can be blurred, left unloaded until you click, or hidden. Their videos won't autoplay.
• Collapsed replies keep a single tidy line (name, handle, date, views) with a show/hide link.
• Blur the avatars of accounts you don't follow, and media in replies, with a smooth or a soft "contour" blur, in colour or greyscale. Hover to see an avatar; click to see media (or let it show while you hover over it), and blur it again with one click.
• Promoted posts are hidden, and Premium and verification upsells, Grok buttons, the floating chat button and nag popups are removed.

**A quieter look**
• Soft low-contrast themes (Quiet, Graphite, Nord, Gruvbox, Mocha, OLED, Paper, or your own colors), calmer buttons and softer text. X Chat is themed too.
• Declutter: icon-only menu, hide the logo and trends, no center borders, solid top bars, adjustable corners, view counts next to the date, outlined checkmarks, and a quick "Not interested" button.

Works with both of X's web apps (the new one and the older one X still serves to some accounts).

**Private by design**
Everything runs in your browser. No accounts, no analytics, no servers: Quiet Timeline makes no network requests of its own.

Not affiliated with X Corp.

## Privacy tab (developer dashboard)

**Single purpose:** Filter and declutter the X (Twitter) timeline and re-theme its interface to be calmer.

**Permission justifications**
- storage: Saves the user's settings and per-account post counts (kept on the device) used to detect repost and aggregator accounts.
- Host permissions (x.com, twitter.com, mobile.x.com): The extension only works on X; it reads the page and X's own page data to filter posts and applies the theme there.

**Remote code:** No, I am not using remote code.

**Data usage:** Collects none of the listed categories. (Website content is processed locally only and never leaves the device, so it is not "collected" under the Chrome Web Store definition.)
Certify: does not sell or transfer data to third parties, does not use or transfer it for purposes unrelated to the single purpose, and does not use or transfer it to determine creditworthiness or for lending.

**Privacy policy URL:** https://qatoqat.com/quiet-timeline/PRIVACY.html

## Assets
- Upload: dist/quiet-timeline-1.0.0.zip (`bun run pack`)
- Icon: icons/128.png
- Screenshots (1280×800, in this order): store/screenshots/1-profile.png, 2-posts.png, 3-replies.png,
  4-settings.png, 5-themes.png. 1–3 are diagonal splits (Quiet Timeline top-left, X bottom-right) on
  SpaceX / Elon Musk posts; other accounts' names, handles and avatars are blurred. 3 has paid-check
  replies set to Collapse; 4 shows a custom theme and accent; 5 is the presets.
- Optional small promo tile 440×280
