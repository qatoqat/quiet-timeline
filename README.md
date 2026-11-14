# Quiet Timeline for X (Twitter)

Browser extension for X (Twitter): filters bots, engagement farmers, paid-checkmark reply spam,
slurs and profanity, and re-themes the site. Everything runs locally; nothing is sent anywhere.

## Install (Vivaldi / any Chromium)

1. `vivaldi://extensions` → enable **Developer mode**
2. **Load unpacked** → pick this folder
3. Reload x.com. Click the toolbar button for settings (they open in the page).

After editing the code, press the reload icon on the extension card, then reload the X tab.

## How it works

- `src/hook.js` runs in the page and reads X's own API responses and server-rendered page data (account age, followers,
  paid/gold check, who you follow…) and passes them to the content script.
- `src/score.js` gives each account/tweet a 0–100 score with reasons. Hover the badge next to a
  name to see why. Accounts you follow, your own tweets, the tweet you opened, and the profile
  you're viewing are never hidden.
- `src/words.js` matches slurs/profanity per whole word, including leetspeak, stretched letters
  and s p a c e d letters, without hitting words like "Scunthorpe" or "cocktail".
- `src/theme.js` remaps X's color palette (it doesn't depend on X's class names, which change).
  Works from any X display mode (Light / Dim / Lights out).

Works with both of X's web apps: the new one ("x-web", Tailwind markup) and the older
"responsive-web" one (`data-testid` markup), which X still serves to some accounts.
`src/apps.js` holds the per-app markup adapters (`NEW` / `OLD`); `src/content.js` picks one per post.

## Package for the Chrome Web Store

    tools/pack.sh                    # → dist/quiet-timeline-<version>.zip

Listing text, privacy answers and screenshots: `store/`. Privacy policy: `PRIVACY.md`.

## Tests

    node --test test/

## End-to-end checks (both X web apps)

    node tools/check.mjs --old --url /home        # X's old app (entered via /i/topics)
    node tools/check.mjs --url /home              # whatever X serves (usually the new app)
    node tools/check.mjs --old --url /<user>/status/<id>   # replies, collapsed posts
    CDP_PORT=9334 node tools/check.mjs --url /Reuters      # logged-out profile: new app

Each setting with a visible effect is asserted on the live page (borders, icon-only
menu, side buttons, views, checkmarks, corners, blur, collapsed replies, ads…);
failures exit 1.

## Dev loop against live X

    tools/vivaldi.sh                 # separate Vivaldi profile with DevTools on :9333
    node tools/cdp.mjs reload        # reload extension + X tab after edits
    tools/vivaldi-guest.sh           # logged-out profile on :9334 — X serves its NEW app to
                                     # logged-out visitors; test it with CDP_PORT=9334 node tools/cdp.mjs …
    node tools/cdp.mjs evalx '<js>'  # run JS in Quiet Timeline's content-script world (XS._debug …)
    node tools/cdp.mjs eval '<js>'   # run JS in the page
    node tools/cdp.mjs net <regex> <dir>   # save matching API responses after a reload

One-time setup in that profile: vivaldi://extensions → Developer mode → Load unpacked.

## License

Proprietary, all rights reserved. See [LICENSE](LICENSE). Privacy: [PRIVACY.md](PRIVACY.md).
Not affiliated with X Corp.
