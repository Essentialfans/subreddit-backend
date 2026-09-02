#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
EXT="$ROOT/blackgif-scraper/extension"
FRONTEND="$ROOT/blackgif-scraper/frontend"

cd "$ROOT"
echo "→ Pulling latest…"
git fetch origin cursor/blackgif-scraper-e6d6
git checkout cursor/blackgif-scraper-e6d6 2>/dev/null || git checkout -B cursor/blackgif-scraper-e6d6 origin/cursor/blackgif-scraper-e6d6
git pull origin cursor/blackgif-scraper-e6d6

VERSION="$(python3 -c "import json; print(json.load(open('$EXT/manifest.json'))['version'])")"
echo "→ Extension version on disk: $VERSION"
echo "→ Extension folder: $EXT"

echo "→ Building dashboard UI (Library → Downloaded lives here)…"
(
  cd "$FRONTEND"
  if [[ ! -d node_modules ]]; then
    npm install --no-audit --no-fund
  fi
  npm run build
)

if [[ -x "$ROOT/blackgif-scraper/install-autostart-mac.sh" ]]; then
  echo "→ Ensuring API autostart / restart…"
  "$ROOT/blackgif-scraper/install-autostart-mac.sh" || true
fi

if command -v open >/dev/null 2>&1; then
  echo "→ Opening Chrome Extensions + Finder on the extension folder"
  open -a "Google Chrome" "chrome://extensions" 2>/dev/null || true
  open "$EXT"
  open "http://127.0.0.1:8000/library/downloaded" 2>/dev/null || true
fi

cat <<MSG

Done.
1. chrome://extensions → BlackGif Scraper → click Reload
2. Hard-refresh the dashboard (Cmd+Shift+R) → Library → Downloaded
3. Hard-refresh RedGifs, then Download again if needed

Your file is usually under:
  ~/subreddit-backend/blackgif-scraper/data/downloads/<creator>/

Load unpacked path if needed:
  $EXT
MSG
