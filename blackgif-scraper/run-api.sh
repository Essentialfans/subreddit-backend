#!/usr/bin/env bash
# Keep BlackGif API running. Restarts if it crashes.
# Starts the API FIRST — UI build is optional and never blocks Online.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
LOG_DIR="${BLACKGIF_LOG_DIR:-$HOME/.blackgif/logs}"
PID_FILE="${BLACKGIF_PID_FILE:-$HOME/.blackgif/api.pid}"
PORT="${BLACKGIF_PORT:-8000}"
HOST="${BLACKGIF_HOST:-127.0.0.1}"

mkdir -p "$LOG_DIR" "$(dirname "$PID_FILE")" "$ROOT/data/downloads"

log() {
  echo "[blackgif] $*" | tee -a "$LOG_DIR/api.log"
}

find_python() {
  local c
  for c in \
    /opt/homebrew/bin/python3 \
    /usr/local/bin/python3 \
    "$HOME/.pyenv/shims/python3" \
    /Library/Frameworks/Python.framework/Versions/Current/bin/python3 \
    python3
  do
    if command -v "$c" >/dev/null 2>&1 || [[ -x "$c" ]]; then
      if "$c" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
        echo "$c"
        return 0
      fi
    fi
  done
  return 1
}

ensure_venv() {
  local py
  py="$(find_python)" || {
    log "ERROR: Python 3.10+ not found. Install with: brew install python"
    return 1
  }
  log "using python: $py ($("$py" -V 2>&1))"

  local need_create=0
  if [[ ! -x "$BACKEND/.venv/bin/python" ]]; then
    need_create=1
  elif ! "$BACKEND/.venv/bin/python" -c "import fastapi, uvicorn" 2>/dev/null; then
    log "venv exists but deps missing/broken — recreating"
    need_create=1
  fi

  if [[ "$need_create" -eq 1 ]]; then
    rm -rf "$BACKEND/.venv"
    log "creating venv…"
    if ! "$py" -m venv "$BACKEND/.venv" >>"$LOG_DIR/api.log" 2>&1; then
      log "ERROR: python -m venv failed. Try: brew install python"
      return 1
    fi
    "$BACKEND/.venv/bin/pip" install -U pip setuptools wheel >>"$LOG_DIR/api.log" 2>&1 || true
    log "installing Python packages (first run can take a minute)…"
    if ! "$BACKEND/.venv/bin/pip" install -r "$BACKEND/requirements.txt" >>"$LOG_DIR/api.log" 2>&1; then
      log "ERROR: pip install failed — see $LOG_DIR/api.log"
      return 1
    fi
  fi

  if [[ ! -x "$BACKEND/.venv/bin/uvicorn" ]]; then
    log "uvicorn missing — reinstalling requirements…"
    "$BACKEND/.venv/bin/pip" install -r "$BACKEND/requirements.txt" >>"$LOG_DIR/api.log" 2>&1 || return 1
  fi
  return 0
}

build_frontend_later() {
  # Never block API startup on npm
  if [[ ! -d "$FRONTEND" ]]; then
    return 0
  fi
  if [[ -f "$FRONTEND/dist/index.html" ]]; then
    return 0
  fi
  if ! command -v npm >/dev/null 2>&1; then
    log "npm not found — skip UI build (API still works; extension uses API)"
    return 0
  fi
  log "building dashboard UI in background…"
  (
    cd "$FRONTEND"
    if [[ ! -d node_modules ]]; then
      npm install --no-audit --no-fund
    fi
    npm run build
    echo "[blackgif] dashboard UI ready"
  ) >>"$LOG_DIR/api.log" 2>&1 &
}

cd "$BACKEND" || exit 1

if ! ensure_venv; then
  log "setup failed — sleeping 15s before launchd retry"
  sleep 15
  exit 1
fi

build_frontend_later

echo $$ > "$PID_FILE"
log "keep-alive started $(date -u +%Y-%m-%dT%H:%M:%SZ) port=$PORT host=$HOST"

cleanup() {
  rm -f "$PID_FILE"
}
trap cleanup EXIT

UVICORN="$BACKEND/.venv/bin/uvicorn"

while true; do
  if curl -sf --max-time 2 "http://${HOST}:${PORT}/api/health" >/dev/null 2>&1; then
    log "API healthy on ${HOST}:${PORT} — idle check"
    sleep 20
    continue
  fi

  # Free a dead listener on the port if needed
  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "${pids:-}" ]]; then
      log "port $PORT busy by pid(s) $pids but unhealthy — killing"
      # shellcheck disable=SC2086
      kill $pids 2>/dev/null || true
      sleep 1
    fi
  fi

  log "starting uvicorn on ${HOST}:${PORT}"
  "$UVICORN" app.main:app --host "$HOST" --port "$PORT" \
    >>"$LOG_DIR/api.log" 2>&1
  code=$?
  log "uvicorn exited code=$code — restarting in 3s"
  sleep 3
done
