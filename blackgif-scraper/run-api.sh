#!/usr/bin/env bash
# Keep BlackGif API running. Restarts automatically if it crashes.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
LOG_DIR="${BLACKGIF_LOG_DIR:-$HOME/.blackgif/logs}"
PID_FILE="${BLACKGIF_PID_FILE:-$HOME/.blackgif/api.pid}"
PORT="${BLACKGIF_PORT:-8000}"
HOST="${BLACKGIF_HOST:-127.0.0.1}"

mkdir -p "$LOG_DIR" "$(dirname "$PID_FILE")"
cd "$BACKEND"

if [[ ! -d .venv ]]; then
  python3 -m venv .venv
  .venv/bin/pip install -U pip
  .venv/bin/pip install -r requirements.txt
fi

# Prefer the venv python/uvicorn
UVICORN="$BACKEND/.venv/bin/uvicorn"
if [[ ! -x "$UVICORN" ]]; then
  echo "uvicorn missing — installing deps…" >&2
  .venv/bin/pip install -r requirements.txt
fi

echo $$ > "$PID_FILE"
echo "[blackgif] keep-alive started $(date -u +%Y-%m-%dT%H:%M:%SZ) port=$PORT" | tee -a "$LOG_DIR/api.log"

cleanup() {
  rm -f "$PID_FILE"
}
trap cleanup EXIT

while true; do
  # If something else already owns the port and answers health, wait instead of fighting it.
  if curl -sf --max-time 2 "http://${HOST}:${PORT}/api/health" >/dev/null 2>&1; then
    echo "[blackgif] API healthy on ${HOST}:${PORT} — idle check" | tee -a "$LOG_DIR/api.log"
    sleep 20
    continue
  fi

  echo "[blackgif] starting uvicorn on ${HOST}:${PORT}" | tee -a "$LOG_DIR/api.log"
  # No --reload in keep-alive mode (more stable for LaunchAgent)
  set +e
  "$UVICORN" app.main:app --host "$HOST" --port "$PORT" \
    >>"$LOG_DIR/api.log" 2>&1
  code=$?
  set -e
  echo "[blackgif] uvicorn exited code=$code — restarting in 3s" | tee -a "$LOG_DIR/api.log"
  sleep 3
done
