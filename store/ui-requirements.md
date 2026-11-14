# Quiet Timeline UI requirements (from user messages; verify on old and new X web app)

## Left menu / nav
1. X logo in the left menu is hidden (option, default on), with no leftover gap above the menu on any page (profile, h1 variant, etc.).
2. Option to move the profile button to the top, in the logo's slot; gap between it and the next item is normal (no wider gap); 8px padding around it.
3. Left menu can be forced icon-only (X's narrow mode); a settings section toggles each left item's visibility.
4. When icon-only, each left button shows a tooltip in the same style as the like-button tooltip.
5. Left-menu icons are muted to the same color as the lock icon, except the active/current page (Home), which stays highlighted. Same muting for composer/toolbar icons.
6. Left icon buttons have consistent padding, including on the profile page (old app: padding issue reported).
7. Post button text color matches the Post button's icon color; the disabled Post button is not faded (opacity 1) under calm.

## Post layout and action buttons
8. Stats (views etc.) sit after the post date, separated by a dot like the one left of the date; the word "views" is removed.
9. Bookmark and Share are in a vertical stack under the author avatar (setting "Bookmark & share under avatar"), restored after being removed once.
10. Stack buttons are centered on the avatar, consistently spaced (36px apart), not misaligned with the pfp.
11. Stack top aligns with the media/quote top when that starts within about one text line of the post; otherwise it starts after about one line of text, 4px below the avatar (4px top padding).
12. Short posts do not leave odd empty space beside/under the avatar (stack only applied when the post is tall enough for it).
13. The avatar is not clipped/trimmed by the stack.
14. Share icon is a better "share" glyph (forward/arrow style), not an upload-looking one.
15. Not-interested button sits in the stack under the avatar, only for non-followed authors on timeline posts (home feed); replies/threads keep the original menu placement.
16. Not-interested hover color/style matches the bookmark button; clicking it acts as a shortcut (performs Not interested), not just opening the menu.
17. The "..." menu opened for that shortcut is hidden from view (invisible) while the item is still clicked, with no flash.
18. Verified checkmarks are outlined icons keeping original colors: blue stays blue, yellow (company) stays yellow, grey (government) stays grey.
19. Hidden ads leave no left gap or empty space in the feed.

## Tooltips
20. All custom tooltips use the same style as the like-button tooltip.
21. Bookmark, Share and Not-interested tooltips have identical position (below the button) and identical delay (about 1000ms); Share has a tooltip.

## Header / top bars
22. Feed tabs (For you/Following) active underline is the original X underline (fixed narrow custom one was tried then reverted); on the Japanese/older UI the original is kept.
23. Option to disable the blur on feed tabs and profile top bar (default: disabled/no blur).
24. Profile page has no unwanted gap at the top; other pages (search, notifications, bookmarks, post detail, etc.) checked for the same gap.

## Sidebar / right column
25. Sidebar sections have no gradient.
26. Right-column cards and search have separate configurable corner radii (cards and search; default 12px preferred for cards, search, menu items, search suggestions).
27. Big gap in right column is removed; upsell/premium/Grok sections hidden by option.

## Media and blur
28. Corner settings: cards, search, media, banner, plus menu items and search hint/suggestions (default 12px); media and banner radii adjustable.
29. Media of repost/aggregator accounts is blurred or unloaded, with option to not load, and is not autoplayed even when scrolling (pause on play).
30. Blurred media uses a contoured blur (not a gradient), soft contrast, little glow, strength about 5/10, with a lighter/softer color option (variant "f"); settings switch for monochrome vs colored.
31. Reveal control exists, and a component to un-reveal (re-blur) media after revealing.
32. Same media blur/unload behaviour applies in replies as in the feed.
33. Setting to blur avatars of non-followed accounts in feed and replies; separate setting for checkmarked accounts; unblur on post hover.
34. Avatar blur is not animated (no transition).
35. Avatar blur edge fits square avatars (business accounts) as well as round ones.
36. Media detail/viewer has no borders.

## Collapsed / dimmed posts
37. Collapsed reply keeps account name, handle, checkmark, score, date and view count; a "show/hide" hyperlink is at the end, just before the "..." menu.
38. "Show posts" button corners are rounded to match the rest (not square), and have no border.
39. Scrolling up past hidden/collapsed posts is smooth with no stutter or scroll-bar jump (fixed sizes for collapsed items).
40. Reposter/aggregator marks: repost accounts get a mark (orange), aggregators have orange rather than green-ish mark, themed accounts (e.g. only animals) get a specific mark; business accounts get no aggregator mark.

## Theme / colors
41. A "Quiet" theme (XSieve palette, second in the preset list) is applied by default; presets switch correctly.
42. Calm, low-contrast palette applied across the app (no mixed light/dark components); post text and other UI text softened, including post detail page and other sections.
43. Bottom-right messages/dock button follows the theme.
44. Chat page (shadow DOM) follows the theme colors, with readable buttons.
45. Center-column borders removed by default; content hover shape is rounded.
46. Popup/modal and composer parts follow the theme.

## Popups / declutter
47. Option to auto-close popups/nags (default on).
48. Options to hide upsells, ads, logo, sidebar sections.

## Settings panel
49. Settings open as an in-page panel from the extension button (not a new tab or a stuck popup), organized in tabs (Accounts, Content, Theme, Layout) with the last tab remembered.
50. Defaults are listed and sane before publish (borders off, rounded, calm, quiet theme, pfp top, side actions on, radii 12 etc.); no broken settings on either app; broken old config is simply dropped, no migration.
51. Name "XSieve" appears nowhere (rename to Quiet Timeline for X, folder included); icon is the d2i loop-wave logo.

## Other / filtering
52. Bot/engagement-farmer scoring with collapse/dim of high/mid scores, with badges.
53. Paid blue check treated as non-trusted (dim/hide, option); slurs collapsed, profanity masked.
54. Memory and performance kept low; performance issues checked without breaking function.
55. Tests cover both old and new X web app, including default settings (borders, buttons, left padding on profile page).
