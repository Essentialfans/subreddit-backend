#!/usr/bin/env bash
# Foreground API start — use this if Offline / LaunchAgent fails.
# Shows errors live in Terminal. Ctrl+C to stop.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
LOG_DIR="$HOME/.blackgif/logs"
PORT="${BLACKGIF_PORT:-8000}"
HOST="${BLACKGIF_HOST:-127.0.0.1}"

mkdir -p "$LOG_DIR" "$ROOT/data/downloads"
chmod +x "$ROOT/run-api.sh" 2>/dev/null || true

echo "BlackGif — starting API in this Terminal window"
echo "  URL:  http://${HOST}:${PORT}/api/health"
echo "  Logs: $LOG_DIR/api.log"
echo

# Stop LaunchAgent copy so we don't fight over the port
LABEL="com.blackgif.scraper.api"
launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true

if command -v lsof >/dev/null 2>&1; then
  pids="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${pids:-}" ]]; then
    echo "Freeing port $PORT (pids: $pids)"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 1
  fi
fi

cd "$BACKEND"

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
  echo "ERROR: Python 3.10+ not found."
  echo "Install Homebrew python, then re-run:"
  echo "  brew install python"
  exit 1
fi

echo "Python: $PY ($("$PY" -V 2>&1))"

if [[ ! -x .venv/bin/uvicorn ]] || ! .venv/bin/python -c "import fastapi,uvicorn" 2>/dev/null; then
  echo "Creating venv + installing packages…"
  rm -rf .venv
  "$PY" -m venv .venv
  .venv/bin/pip install -U pip setuptools wheel
  .venv/bin/pip install -r requirements.txt
fi

echo "Starting uvicorn…"
exec .venv/bin/uvicorn app.main:app --host "$HOST" --port "$PORT"
