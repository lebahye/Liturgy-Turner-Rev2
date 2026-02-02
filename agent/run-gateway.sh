#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

export CLAWDBOT_STATE_DIR="$(pwd)/agent/.clawdbot-state"
export CLAWDBOT_CONFIG_PATH="$(pwd)/agent/clawdbot.json5"

mkdir -p "$CLAWDBOT_STATE_DIR"

if [ ! -f "$CLAWDBOT_CONFIG_PATH" ]; then
  echo "Missing $CLAWDBOT_CONFIG_PATH"
  echo "Copy the example config first:"
  echo "  cp agent/clawdbot.json5.example agent/clawdbot.json5"
  exit 1
fi

# Runs the gateway in the foreground (WSL-friendly; no systemd required).
clawdbot gateway run
