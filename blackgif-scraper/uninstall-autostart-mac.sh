#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
LABEL="com.blackgif.scraper.api"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl unload "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
echo "Removed LaunchAgent $LABEL"
echo "API will no longer start at login."
echo "To run manually: cd \"$ROOT\" && ./fix-mac.sh"
