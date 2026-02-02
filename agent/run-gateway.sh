#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

export CLAWDBOT_STATE_DIR="$(pwd)/agent/.clawdbot-state"
export CLAWDBOT_CONFIG_PATH="$(pwd)/agent/clawdbot.json5"

# Dedicated gateway port for this project (avoid conflicts with any other Clawdbot instance)
export CLAWDBOT_GATEWAY_PORT="28789"

mkdir -p "$CLAWDBOT_STATE_DIR"

if [ ! -f "$CLAWDBOT_CONFIG_PATH" ]; then
  echo "Missing $CLAWDBOT_CONFIG_PATH"
  echo "Copy the example config first:"
  echo "  cp agent/clawdbot.json5.example agent/clawdbot.json5"
  exit 1
fi

# Runs the gateway in the foreground (WSL-friendly; no systemd required).
# This project is intended to use the Clawdbot version shipped in this repo (clawdbot-main.zip).
# After running: bash script/setup-clawdbot-from-zip.sh
# we can start the gateway via the vendored build.

VENDORED_ENTRY="$(pwd)/vendor/clawdbot-main/dist/entry.js"
if [ -f "$VENDORED_ENTRY" ]; then
  node "$VENDORED_ENTRY" gateway run --port "$CLAWDBOT_GATEWAY_PORT" --bind loopback --allow-unconfigured
else
  echo "Vendored Clawdbot not built yet." >&2
  echo "Run: bash script/setup-clawdbot-from-zip.sh" >&2
  echo "(or install clawdbot globally if you choose to override this policy)" >&2
  exit 1
fi
