#!/bin/sh
# Logged-out dev Vivaldi: X serves its NEW web app (x-web) to logged-out
# visitors, while signed-in accounts may still get the old one. Use this to test
# the new app. DevTools on 127.0.0.1:9334 (CDP_PORT=9334 bun tools/cdp.ts …).
# The extension is preloaded (--load-extension): after code edits, restart this
# script instead of reloading the extension.
PROFILE="${QUIETTL_GUEST_PROFILE:-$HOME/.config/quiettl-vivaldi-guest}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
exec vivaldi \
  --user-data-dir="$PROFILE" \
  --remote-debugging-port=9334 \
  --load-extension="$DIR" \
  --no-first-run --no-default-browser-check \
  "https://x.com/Reuters"
