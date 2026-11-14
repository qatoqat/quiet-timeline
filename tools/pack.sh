#!/bin/sh
# Build the Chrome Web Store upload: dist/quiet-timeline-<version>.zip
# (extension files only — no dev tools, tests, design or store assets).
set -e
cd "$(dirname "$0")/.."
v=$(node -p "require('./manifest.json').version")
mkdir -p dist
python3 - "$v" <<'PY'
import os, sys, zipfile
out = f"dist/quiet-timeline-{sys.argv[1]}.zip"
files = ["manifest.json", "LICENSE"]
for d in ["src", "popup", "icons"]:
    for root, _, names in os.walk(d):
        files += [os.path.join(root, n) for n in sorted(names) if n != "icon.svg" and not n.startswith(".") and not n.endswith(".d.ts")]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for f in files:
        z.write(f)
print(out, f"{os.path.getsize(out) // 1024} KB")
for f in files:
    print("  " + f)
PY
