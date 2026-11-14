# Chrome Web Store listing

**Name** (manifest, 30 chars): Quiet Timeline for X (Twitter)

**Summary** (manifest description, ≤132 chars):
A calmer X (Twitter): quiets bots, engagement farmers, paid-check reply spam, slurs and nags, with a soft low-contrast theme.

**Category:** Social Networking (Lifestyle)   **Language:** English

## Description

Plain text, ready to paste (the field doesn't render Markdown): store/description.txt

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
- Small promo tile: store/promo-small-440x280.png · Marquee promo tile: store/promo-marquee-1400x560.png
  (24-bit PNG, no alpha)

## Additional fields

- Official URL: leave empty (it needs qatoqat.com verified in Google Search Console first)
- Homepage URL: https://qatoqat.com/quiet-timeline/
- Support URL: https://github.com/qatoqat/quiet-timeline/issues
- Mature content: off
