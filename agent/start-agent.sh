#!/bin/bash
set -e

# Start audio API in background
echo "[start-agent] Starting audio API on port 29788..."
node /app/agent/audio-api.mjs &
AUDIO_API_PID=$!

# Give audio API time to start
sleep 2

# Start openclaw gateway in foreground
echo "[start-agent] Starting openclaw gateway on port 29789..."
openclaw gateway --bind lan

# If gateway exits, kill audio API
kill $AUDIO_API_PID 2>/dev/null || true
