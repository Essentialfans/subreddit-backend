#!/usr/bin/env bash
# Start BlackGif Scraper API on this Mac (catalog only — no auto-download).
# Prefer ./install-autostart-mac.sh so it stays Online after reboot.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
exec "$ROOT/run-api.sh"
