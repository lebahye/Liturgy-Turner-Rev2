#!/bin/bash
cd ~/Liturgy-Turner-Rev2

# Auto-detect WSL IP
WSL_IP=$(ip addr show eth0 | grep "inet " | awk '{print $2}' | cut -d/ -f1)

# Set the gateway URL to use WSL IP (matches agent/clawdbot.json5)
export CLAWDBOT_GATEWAY_URL="http://${WSL_IP}:29790"

echo "Starting Liturgy app with gateway at: $CLAWDBOT_GATEWAY_URL"

# Start the app
npm run local:up
