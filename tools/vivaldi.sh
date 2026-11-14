#!/bin/sh
# Dev Vivaldi: separate profile, DevTools protocol on 127.0.0.1:9333.
# One-time: vivaldi://extensions → Developer mode → Load unpacked → this repo.
# (Not --load-extension: those copies vanish on chrome.runtime.reload().)
PROFILE="${QUIETTL_PROFILE:-$HOME/.config/quiettl-vivaldi}"
exec vivaldi \
  --user-data-dir="$PROFILE" \
  --remote-debugging-port=9333 \
  --no-first-run --no-default-browser-check \
  "https://x.com/home"
