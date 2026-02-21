#!/bin/bash
# Start Liturgy Bot Agent LOCALLY for testing (with microphone access)
# Use this during development on your laptop

cd "$(dirname "$0")"

# Load .env if it exists
if [ -f ../.env ]; then
    export $(cat ../.env | grep -v '^#' | xargs)
fi

# Check if clawdbot is installed globally
if command -v clawdbot &> /dev/null; then
    CLAWDBOT="clawdbot"
elif [ -f "../node_modules/.bin/clawdbot" ]; then
    CLAWDBOT="../node_modules/.bin/clawdbot"
else
    echo "❌ Clawdbot not found. Install with: npm install clawdbot"
    exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎵 Liturgy Bot Agent - LOCAL DEVELOPMENT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ Running on HOST (not Docker)"
echo "✅ CAN access laptop microphone"
echo "✅ Port: 29790"
echo "✅ Web UI: http://localhost:29790"
echo "✅ App: http://localhost:5000"
echo ""
echo "Press Ctrl+C to stop"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Start with local config
CLAWDBOT_CONFIG_PATH="$(pwd)/clawdbot-local.json5" \
CLAWDBOT_STATE_DIR="$(pwd)/.clawdbot-state-local" \
$CLAWDBOT gateway
