#!/usr/bin/env bash
# ── pack the browser extension into a downloadable zip ── owner: David
# Zips the extension/ folder into client/public/orbis-extension.zip so the deployed site can offer
# it as a real "Download" on the /extension page (Vite serves /public at the site root). Re-run
# this whenever the extension changes, then commit the updated zip.
#
# Usage:  bash scripts/pack-extension.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/extension"
OUT="$ROOT/client/public/orbis-extension.zip"

# Zip the extension contents (not the parent dir), excluding cruft + the extension's own README so
# the download is exactly what "Load unpacked" needs. -X strips extra file attributes for a stable zip.
cd "$SRC"
rm -f "$OUT"
zip -r -X "$OUT" . \
  -x "*.DS_Store" -x "__MACOSX/*" -x "*/.*" -x "README.md" \
  -x "*.svg" -x "STORE_SUBMISSION.md" >/dev/null

echo "Packed $(cd "$SRC" && find . -type f | wc -l | tr -d ' ') files → client/public/orbis-extension.zip"
