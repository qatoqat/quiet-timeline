#!/bin/sh
# Chrome Web Store upload: dist/quiet-timeline-<version>.zip (run `bun run build` first;
# extension files only, source maps included).
set -e
cd "$(dirname "$0")/.."
v=$(node -p "require('./manifest.json').version")
mkdir -p dist
python3 - "$v" <<'PY'
import os, sys, zipfile
out = f"dist/quiet-timeline-{sys.argv[1]}.zip"
files = ["manifest.json", "LICENSE"]
for d, keep in [("build", None), ("popup", (".html", ".css")), ("icons", (".png",))]:
    for root, _, names in os.walk(d):
        files += [os.path.join(root, n) for n in sorted(names) if not n.startswith(".") and (keep is None or n.endswith(keep))]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for f in files:
        z.write(f)
print(out, f"{os.path.getsize(out) // 1024} KB")
for f in files:
    print("  " + f)
PY
