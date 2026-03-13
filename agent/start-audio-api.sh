#!/bin/bash
# Start the Liturgy Audio API natively (not in Docker)
# This talks to liturgy-app Docker container at localhost:5000

export APP_BASE_URL="http://localhost:5000"
export PORT=29788

cd "$(dirname "$0")"
exec node audio-api.mjs
