#!/usr/bin/env bash
# Install a macOS LaunchAgent so BlackGif API starts at login and stays Online.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
LABEL="com.blackgif.scraper.api"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="$HOME/.blackgif/logs"

chmod +x \
  "$ROOT/run-api.sh" \
  "$ROOT/start.sh" \
  "$ROOT/fix-mac.sh" \
  "$ROOT/install-autostart-mac.sh" \
  "$ROOT/uninstall-autostart-mac.sh" \
  2>/dev/null || true

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR" "$HOME/.blackgif" "$ROOT/data/downloads"

ROOT_ABS="$(cd "$ROOT" && pwd)"
RUNNER_ABS="$ROOT_ABS/run-api.sh"

# Pre-create venv in Terminal (has full PATH) before launchd takes over
echo "Preparing Python environment…"
if ! bash "$RUNNER_ABS" --help >/dev/null 2>&1; then
  :
fi
# Run a one-shot setup by invoking ensure logic via a short foreground start
if [[ ! -x "$ROOT_ABS/backend/.venv/bin/uvicorn" ]]; then
  echo "First-time setup: creating venv + installing packages (1–2 min)…"
  (
    cd "$ROOT_ABS/backend"
    PY=""
    for c in /opt/homebrew/bin/python3 /usr/local/bin/python3 python3; do
      if command -v "$c" >/dev/null 2>&1 || [[ -x "$c" ]]; then
        if "$c" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
          PY="$c"
          break
        fi
      fi
    done
    if [[ -z "$PY" ]]; then
      echo "ERROR: need Python 3.10+. Install: brew install python"
      exit 1
    fi
    rm -rf .venv
    "$PY" -m venv .venv
    .venv/bin/pip install -U pip setuptools wheel
    .venv/bin/pip install -r requirements.txt
    echo "Python packages installed."
  ) || {
    echo "Setup failed. Fix Python, then re-run this script."
    exit 1
  }
fi

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
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>BLACKGIF_PORT</key>
    <string>8000</string>
    <key>BLACKGIF_HOST</key>
    <string>127.0.0.1</string>
    <key>HOME</key>
    <string>${HOME}</string>
  </dict>
</dict>
</plist>
EOF

UID_NUM="$(id -u)"
launchctl bootout "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
launchctl unload "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/${UID_NUM}" "$PLIST" 2>/dev/null || launchctl load -w "$PLIST"
launchctl enable "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
launchctl kickstart -k "gui/${UID_NUM}/${LABEL}" 2>/dev/null || launchctl start "$LABEL" || true

echo "Installed LaunchAgent: $PLIST"
echo "BlackGif API will start at login and restart if it dies."
echo
echo "Waiting for health (up to ~45s)…"
for i in $(seq 1 45); do
  if curl -sf --max-time 2 http://127.0.0.1:8000/api/health >/dev/null; then
    echo "Online — http://127.0.0.1:8000/api/health"
    curl -s http://127.0.0.1:8000/api/health
    echo
    echo "In Chrome: reopen the BlackGif popup → should show Online → Download."
    exit 0
  fi
  sleep 1
done

echo
echo "API still not responding. Last log lines:"
echo "----- $LOG_DIR/api.log -----"
tail -n 40 "$LOG_DIR/api.log" 2>/dev/null || echo "(no api.log yet)"
echo "----- $LOG_DIR/launchd.err.log -----"
tail -n 20 "$LOG_DIR/launchd.err.log" 2>/dev/null || echo "(empty)"
echo
echo "Try a foreground start to see the error:"
echo "  cd \"$ROOT_ABS\" && ./fix-mac.sh"
exit 1
