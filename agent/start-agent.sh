#!/usr/bin/env bash
set -euo pipefail

echo "[start-agent] Starting audio API on port 29788..."
exec node /app/agent/audio-api.mjs
