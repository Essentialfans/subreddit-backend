#!/usr/bin/env bash
# Remove the BlackGif LaunchAgent.
set -euo pipefail
LABEL="com.blackgif.scraper.api"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl unload "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
echo "Removed LaunchAgent $LABEL"
echo "API will no longer auto-start. Stop any running instance with:"
echo "  pkill -f 'uvicorn app.main:app' || true"
