#!/bin/bash
# Start the Liturgy Audio API natively (not in Docker)
# This talks to liturgy-app Docker container at localhost:5000

export APP_BASE_URL="http://localhost:5000"
export PORT=29788

# Resolve to the actual local training-data directory (not the Docker /app path)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export TRAINING_DATA_DIR="$(cd "${SCRIPT_DIR}/../training-data" && pwd)"
export AGENT_DIR="${SCRIPT_DIR}"

echo "[start] TRAINING_DATA_DIR=${TRAINING_DATA_DIR}"

cd "${SCRIPT_DIR}"
exec node audio-api.mjs
