#!/usr/bin/env bash
# One-shot: pull latest, fix Offline API, tell you what to do in Chrome.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BG="$ROOT/blackgif-scraper"

cd "$ROOT"
echo "→ Pulling latest…"
git fetch origin cursor/blackgif-scraper-e6d6 || true
git checkout cursor/blackgif-scraper-e6d6 2>/dev/null || true
git pull origin cursor/blackgif-scraper-e6d6 || true

chmod +x \
  "$BG/run-api.sh" \
  "$BG/start.sh" \
  "$BG/fix-mac.sh" \
  "$BG/install-autostart-mac.sh" \
  "$BG/uninstall-autostart-mac.sh" \
  "$ROOT/fix-blackgif.sh" \
  2>/dev/null || true

echo "→ Installing / restarting API autostart…"
if "$BG/install-autostart-mac.sh"; then
  echo
  echo "API is Online."
else
  echo
  echo "Autostart health check failed — starting API in the foreground instead."
  echo "Leave this Terminal window open. In Chrome, reopen the BlackGif popup."
  echo
  exec "$BG/fix-mac.sh"
fi

echo
echo "Next:"
echo "  1. Chrome → chrome://extensions → Reload BlackGif"
echo "  2. Hard-refresh RedGifs (Cmd+Shift+R)"
echo "  3. Open the popup — status should be Online — then Download"
echo
echo "Dashboard: http://127.0.0.1:8000"
echo "Extension folder: $BG/extension"
