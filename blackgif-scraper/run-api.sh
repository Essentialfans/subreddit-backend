#!/usr/bin/env bash
# Keep BlackGif API running. Restarts automatically if it crashes.
# Also rebuilds the dashboard UI when frontend sources are newer than dist.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
LOG_DIR="${BLACKGIF_LOG_DIR:-$HOME/.blackgif/logs}"
PID_FILE="${BLACKGIF_PID_FILE:-$HOME/.blackgif/api.pid}"
PORT="${BLACKGIF_PORT:-8000}"
HOST="${BLACKGIF_HOST:-127.0.0.1}"

mkdir -p "$LOG_DIR" "$(dirname "$PID_FILE")"

build_frontend_if_needed() {
  if [[ ! -d "$FRONTEND" ]]; then
    return 0
  fi
  local need=0
  if [[ ! -f "$FRONTEND/dist/index.html" ]]; then
    need=1
  else
    # Rebuild if any source file is newer than the built index
    if find "$FRONTEND/src" "$FRONTEND/index.html" "$FRONTEND/package.json" \
      -type f -newer "$FRONTEND/dist/index.html" 2>/dev/null | grep -q .; then
      need=1
    fi
  fi
  if [[ "$need" -ne 1 ]]; then
    return 0
  fi
  echo "[blackgif] building dashboard UI…" | tee -a "$LOG_DIR/api.log"
  (
    cd "$FRONTEND"
    if [[ ! -d node_modules ]]; then
      npm install --no-audit --no-fund
    fi
    npm run build
  ) >>"$LOG_DIR/api.log" 2>&1 || {
    echo "[blackgif] frontend build failed — serving previous dist if present" | tee -a "$LOG_DIR/api.log"
    return 0
  }
  echo "[blackgif] dashboard UI ready" | tee -a "$LOG_DIR/api.log"
}

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

build_frontend_if_needed

echo $$ > "$PID_FILE"
echo "[blackgif] keep-alive started $(date -u +%Y-%m-%dT%H:%M:%SZ) port=$PORT" | tee -a "$LOG_DIR/api.log"

cleanup() {
  rm -f "$PID_FILE"
}
trap cleanup EXIT

while true; do
  build_frontend_if_needed

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
