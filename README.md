# Quiet Timeline for X (Twitter)

Browser extension for X (Twitter): filters bots, engagement farmers, paid-checkmark reply spam,
slurs and profanity, and re-themes the site. Everything runs locally; nothing is sent anywhere.

## Install (Vivaldi / any Chromium)

1. `bun install && bun run build` (TypeScript in `src/` → minified bundles + source maps in `build/`)
2. `vivaldi://extensions` → enable **Developer mode**
3. **Load unpacked** → pick this folder (the repo root, not `build/`)
4. Reload x.com. Click the toolbar button for settings (they open in the page).

After editing the code, run `bun run build`, press the reload icon on the extension card, then reload the X tab.
`bun run typecheck` type-checks everything (strict).

## How it works

- `src/hook/` runs in the page and reads X's own API responses and server-rendered page data (account age, followers,
  paid/gold check, who you follow…) and passes them to the content script.
- `src/shared/score.ts` gives each account/tweet a 0–100 score with reasons. Hover the badge next to a
  name to see why. Accounts you follow, your own tweets, the tweet you opened, and the profile
  you're viewing are never hidden.
- `src/shared/words.ts` matches slurs/profanity per whole word, including leetspeak, stretched letters
  and s p a c e d letters, without hitting words like "Scunthorpe" or "cocktail".
- `src/theme/` remaps X's color palette (it doesn't depend on X's class names, which change).
  Works from any X display mode (Light / Dim / Lights out).

Works with both of X's web apps: the new one ("x-web", Tailwind markup) and the older
"responsive-web" one (`data-testid` markup), which X still serves to some accounts.
`src/apps.ts` holds the per-app markup adapters (`NEW` / `OLD`); `src/content/` picks one per post.

## Package for the Chrome Web Store

    bun run pack                     # build, then → dist/quiet-timeline-<version>.zip

Listing text, privacy answers and screenshots: `store/`. Privacy policy: `PRIVACY.md`.

## Tests

    bun test

Besides the logic, this checks that every setting has exactly one control in the panel and
the other way round. Each setting owns one thing on the page; a control that only works
together with another setting says so with `data-needs` in `popup/popup.html` (the panel
greys it out while that setting is off).

## End-to-end checks (both X web apps)

    bun tools/check.ts --old --url /home        # X's old app (entered via /i/topics)
    bun tools/check.ts --url /home              # whatever X serves (usually the new app)
    bun tools/check.ts --old --url /<user>/status/<id>   # replies, collapsed posts
    CDP_PORT=9334 bun tools/check.ts --url /Reuters      # logged-out profile: new app
    bun tools/check.ts --matrix [--old]         # every panel control set to each other value

Each setting's visible effect is asserted on the live page as its panel label describes it,
on and off (borders, menu, under-the-avatar buttons, views, checkmarks, corners, blur,
collapsed replies, ads…); failures exit 1. `--matrix` runs all checks once per setting
change, from the defaults and from "all switches on", so one setting quietly depending on
another fails there (stored settings are restored afterwards; `--only <text>` picks variants).

## Dev loop against live X

    tools/vivaldi.sh                 # separate Vivaldi profile with DevTools on :9333
    bun tools/cdp.ts reload        # reload extension + X tab after edits
    tools/vivaldi-guest.sh           # logged-out profile on :9334 — X serves its NEW app to
                                     # logged-out visitors; test it with CDP_PORT=9334 bun tools/cdp.ts …
    bun tools/cdp.ts evalx '<js>'  # run JS in Quiet Timeline's content-script world (XS._debug …)
    bun tools/cdp.ts eval '<js>'   # run JS in the page
    bun tools/cdp.ts net <regex> <dir>   # save matching API responses after a reload

One-time setup in that profile: vivaldi://extensions → Developer mode → Load unpacked.

## License

Proprietary, all rights reserved. See [LICENSE](LICENSE). Privacy: [PRIVACY.md](PRIVACY.md).
Not affiliated with X Corp.
