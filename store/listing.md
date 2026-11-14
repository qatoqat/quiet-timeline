# Chrome Web Store listing

**Name** (manifest, 30 chars): Quiet Timeline for X (Twitter)

**Summary** (manifest description, ≤132 chars):
A calmer X (Twitter): quiets bots, engagement farmers, paid-check reply spam, slurs and nags, with a soft low-contrast theme.

**Category:** Social Networking (Lifestyle)   **Language:** English

## Description

Plain text, ready to paste (the field doesn't render Markdown): store/description.txt

## Privacy tab (developer dashboard)

**Single purpose:**
Quiet Timeline makes the X (Twitter) website calmer to read. On x.com and twitter.com only, it turns down noise in timelines and replies — bot and engagement-farm accounts, paid-checkmark reply spam, slurs, profanity, muted words, ads and nag popups — and gives X's interface a soft, low-contrast, decluttered look. Everything happens locally in the browser.

**storage justification:**
chrome.storage.sync keeps the user's settings (filters, display options, theme) so they apply on every X tab and on the user's own synced devices. chrome.storage.local keeps a small on-device tally per X account seen — how many of its posts were original, reposts or media, and their common words — which is how the extension recognizes repost, aggregator and single-topic accounts. It is capped (about 3,000 accounts, oldest dropped first), never leaves the device, and is deleted with the extension.

**Host permission justification:**
The extension works only on X: https://x.com/*, https://twitter.com/* and https://mobile.x.com/*. On those pages it reads the posts and the account data X's page already loads (including X's own API responses as the page receives them) to score accounts and find filtered words; changes the page to dim, collapse, hide or blur filtered posts and media and to remove clutter; and applies the chosen theme. It needs no other sites and makes no network requests of its own.

**Data usage:** tick **Website content** (it reads the posts on X pages) and **User activity** (to read X's
own data it watches the page's network responses on x.com). Nothing else. The store's FAQ: "Extensions are
required to disclose how they handle user data, even when data is processed or stored locally on a user's
device and is not transmitted to external servers or third parties."
Certify all three: no selling / transfer to third parties; no use unrelated to the single purpose; no
creditworthiness / lending use.

**Remote code:** No.

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
