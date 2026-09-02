#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
EXT="$ROOT/blackgif-scraper/extension"

cd "$ROOT"
echo "→ Pulling latest…"
git fetch origin cursor/blackgif-scraper-e6d6
git checkout cursor/blackgif-scraper-e6d6 2>/dev/null || git checkout -B cursor/blackgif-scraper-e6d6 origin/cursor/blackgif-scraper-e6d6
git pull origin cursor/blackgif-scraper-e6d6

VERSION="$(python3 -c "import json; print(json.load(open('$EXT/manifest.json'))['version'])")"
echo "→ Extension version on disk: $VERSION"
echo "→ Extension folder: $EXT"

if [[ -x "$ROOT/blackgif-scraper/install-autostart-mac.sh" ]]; then
  echo "→ Ensuring API autostart…"
  "$ROOT/blackgif-scraper/install-autostart-mac.sh" || true
fi

if command -v open >/dev/null 2>&1; then
  echo "→ Opening Chrome Extensions + Finder on the extension folder"
  open -a "Google Chrome" "chrome://extensions" 2>/dev/null || true
  open "$EXT"
fi

cat <<MSG

Done.
1. chrome://extensions → BlackGif Scraper → click Reload
2. Hard-refresh RedGifs (Cmd+Shift+R)
3. Open popup → big blue Download (v$VERSION)

Load unpacked path if needed:
  $EXT
MSG
