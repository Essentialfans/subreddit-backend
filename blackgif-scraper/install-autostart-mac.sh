#!/usr/bin/env bash
# Install a macOS LaunchAgent so BlackGif API starts at login and stays up.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
LABEL="com.blackgif.scraper.api"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
RUNNER="$ROOT/run-api.sh"
LOG_DIR="$HOME/.blackgif/logs"

chmod +x "$ROOT/run-api.sh" "$ROOT/start.sh" "$ROOT/install-autostart-mac.sh" 2>/dev/null || true
mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR" "$HOME/.blackgif"

# Resolve absolute paths (LaunchAgents need them)
ROOT_ABS="$(cd "$ROOT" && pwd)"
RUNNER_ABS="$ROOT_ABS/run-api.sh"
PYTHON_BIN="/usr/bin/env"

cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${RUNNER_ABS}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${ROOT_ABS}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/launchd.err.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    <key>BLACKGIF_PORT</key>
    <string>8000</string>
    <key>BLACKGIF_HOST</key>
    <string>127.0.0.1</string>
  </dict>
</dict>
</plist>
EOF

# Unload if already loaded, then load
launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl unload "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || launchctl load "$PLIST"
launchctl enable "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl kickstart -k "gui/$(id -u)/${LABEL}" 2>/dev/null || launchctl start "$LABEL" || true

echo "Installed LaunchAgent: $PLIST"
echo "BlackGif API will start at login and restart if it dies."
echo
echo "Waiting for health…"
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf --max-time 2 http://127.0.0.1:8000/api/health >/dev/null; then
    echo "Online — http://127.0.0.1:8000/api/health"
    curl -s http://127.0.0.1:8000/api/health
    echo
    echo "Reload the Chrome extension, then reopen the popup."
    exit 0
  fi
  sleep 1
done

echo "API not responding yet. Check logs:"
echo "  $LOG_DIR/api.log"
echo "  $LOG_DIR/launchd.err.log"
exit 1
