#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

export CLAWDBOT_STATE_DIR="$(pwd)/agent/.clawdbot-state"
export CLAWDBOT_CONFIG_PATH="$(pwd)/agent/clawdbot.json5"

# Dedicated gateway port for this project (avoid conflicts with any other Clawdbot instance)
export CLAWDBOT_GATEWAY_PORT="29789"

mkdir -p "$CLAWDBOT_STATE_DIR"

if [ ! -f "$CLAWDBOT_CONFIG_PATH" ]; then
  echo "Missing $CLAWDBOT_CONFIG_PATH"
  echo "Copy the example config first:"
  echo "  cp agent/clawdbot.json5.example agent/clawdbot.json5"
  exit 1
fi

# Ensure we have a gateway token.
# Newer Clawdbot builds may enforce token auth even on loopback.
TOKEN_FILE="$CLAWDBOT_STATE_DIR/gateway-token"
if [ -z "${CLAWDBOT_GATEWAY_TOKEN:-}" ]; then
  if [ -f "$TOKEN_FILE" ]; then
    export CLAWDBOT_GATEWAY_TOKEN="$(cat "$TOKEN_FILE")"
  else
    export CLAWDBOT_GATEWAY_TOKEN="$(openssl rand -hex 24)"
    echo "$CLAWDBOT_GATEWAY_TOKEN" > "$TOKEN_FILE"
    chmod 600 "$TOKEN_FILE" || true
  fi
fi

# Runs the gateway in the foreground (WSL-friendly; no systemd required).
# This project is intended to use the Clawdbot version shipped in this repo (clawdbot-main.zip).
# After running: bash script/setup-clawdbot-from-zip.sh
# we can start the gateway via the vendored build.

VENDORED_ENTRY="$(pwd)/vendor/clawdbot-main/dist/entry.js"
if [ -f "$VENDORED_ENTRY" ]; then
  node "$VENDORED_ENTRY" gateway run \
    --port "$CLAWDBOT_GATEWAY_PORT" \
    --bind loopback \
    --allow-unconfigured \
    --token "$CLAWDBOT_GATEWAY_TOKEN"
else
  echo "Vendored Clawdbot not built yet." >&2
  echo "Run: bash script/setup-clawdbot-from-zip.sh" >&2
  exit 1
fi
