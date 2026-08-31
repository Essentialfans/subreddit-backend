#!/usr/bin/env bash
# Start BlackGif Scraper API on this Mac (catalog only — no auto-download).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/backend"

if [[ ! -d .venv ]]; then
  python3 -m venv .venv
  .venv/bin/pip install -U pip
  .venv/bin/pip install -r requirements.txt
fi

echo "Starting BlackGif API at http://127.0.0.1:8000"
echo "Sync catalogs + marks viral from min views. Files save only when you press Save to disk."
exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
