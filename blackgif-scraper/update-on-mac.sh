#!/usr/bin/env bash
# Update BlackGif from git and open Chrome Extensions so you can click Reload.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXT="$ROOT/blackgif-scraper/extension"

cd "$ROOT"
echo "→ Pulling latest…"
git fetch origin cursor/blackgif-scraper-e6d6
git checkout cursor/blackgif-scraper-e6d6 2>/dev/null || true
git pull origin cursor/blackgif-scraper-e6d6

VERSION="$(python3 -c "import json; print(json.load(open('$EXT/manifest.json'))['version'])")"
echo "→ Extension version on disk: $VERSION"
echo "→ Extension folder: $EXT"

# Keep API online if install script exists
if [[ -x "$ROOT/blackgif-scraper/install-autostart-mac.sh" ]]; then
  echo "→ Ensuring API autostart…"
  "$ROOT/blackgif-scraper/install-autostart-mac.sh" || true
fi

# Open Chrome extensions page (user must click Reload once)
if command -v open >/dev/null 2>&1; then
  echo "→ Opening chrome://extensions (click Reload on BlackGif)"
  open -a "Google Chrome" "chrome://extensions" 2>/dev/null \
    || open -a "Chromium" "chrome://extensions" 2>/dev/null \
    || open -a "Microsoft Edge" "edge://extensions" 2>/dev/null \
    || true
  # Reveal the extension folder in Finder in case they need Load unpacked
  open "$EXT"
fi

cat <<EOF

Done.
1. In chrome://extensions, find "BlackGif Scraper"
2. Click Reload (circular arrow)
3. Hard-refresh RedGifs (Cmd+Shift+R)
4. Open the popup — you should see a big blue Download button (v$VERSION)

If the extension isn't loaded yet: Load unpacked → select:
  $EXT
EOF
