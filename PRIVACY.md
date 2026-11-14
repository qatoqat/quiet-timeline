# Privacy policy — Quiet Timeline for X (Twitter)

_Last updated: November 14, 2026_

**Short version: Quiet Timeline collects nothing. Everything it does happens
inside your browser, and nothing is sent to the developer or anyone else.**

## What the extension reads

To decide what to filter, Quiet Timeline reads, on x.com and twitter.com only:

- the posts and account details X already loads into the page (text, author
  handle, follower counts, account age, checkmark type, whether a post has
  media), and
- the page itself, to dim, collapse, blur or re-theme parts of it.

This is processed on your device, in memory. It is not uploaded, logged or shared.

## What it stores

- **Your settings**, in the browser's extension storage (`chrome.storage.sync`).
  If browser sync is on, your browser vendor syncs them between your own
  devices, as it does for any extension's settings. The developer never sees them.
- **Per-account counts**, in local extension storage (`chrome.storage.local`)
  on your device only: for accounts you've seen, how many of their posts were
  original, reposts or media, and common words in them. This is what lets it
  recognize repost/aggregator and single-topic accounts. It is capped at
  about 3,000 accounts, and the oldest are dropped first. Removing the extension deletes it.

## What it does not do

- No analytics, tracking, ads or telemetry.
- No network requests of its own, and no remote code. It talks to no server.
- No selling, transferring or sharing of data, and no use of data for anything
  other than the filtering and theming features you see.
- It never posts, likes, follows or sends anything on your behalf. The
  "Not interested" button only clicks X's own menu item for that post, when you press it.

## Permissions

- `storage`: to keep your settings and the per-account counts above.
- Access to `x.com`, `twitter.com`, `mobile.x.com`: to run on X and nowhere else.

## Contact

Questions: qatoqatt@gmail.com · https://qatoqat.com
