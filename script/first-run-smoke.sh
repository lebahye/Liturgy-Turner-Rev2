#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

APP_URL="http://127.0.0.1:${PORT:-5000}"
GATEWAY_PORT="${CLAWDBOT_GATEWAY_PORT:-29789}"
GATEWAY_URL="http://127.0.0.1:${GATEWAY_PORT}"

say() { printf "\n==> %s\n" "$*"; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

need_cmd node
need_cmd npm
need_cmd curl

say "Node: $(node -v)"
say "NPM:  $(npm -v)"

# Ensure .env exists (optional; keep user overrides)
if [ ! -f .env ] && [ -f .env.example ]; then
  say "Creating .env from .env.example"
  cp .env.example .env
fi

# DB: seed if present, otherwise migrate
DB_PATH="${SQLITE_DB_PATH:-./data/liturgy-turner.db}"
SEED_DB="./seed/liturgy-turner.seed.db"

if [ ! -f "$DB_PATH" ] && [ -f "$SEED_DB" ]; then
  say "Seeding DB from $SEED_DB -> $DB_PATH"
  mkdir -p "$(dirname "$DB_PATH")"
  cp "$SEED_DB" "$DB_PATH"
else
  say "Running DB migrate (creates SQLite DB if missing)"
  npm run -s db:migrate
fi

# Start gateway + app in background
say "Starting gateway (agent)"
( npm run -s agent:start ) &
GATEWAY_PID=$!

say "Starting app server"
( npm run -s dev:lan ) &
APP_PID=$!

cleanup() {
  say "Stopping background processes"
  kill "$APP_PID" "$GATEWAY_PID" 2>/dev/null || true
}
trap cleanup EXIT

wait_for() {
  local url="$1"
  local name="$2"
  local tries=60
  while [ $tries -gt 0 ]; do
    if curl -fsS -m 1 "$url" >/dev/null 2>&1; then
      echo "OK: $name ($url)"
      return 0
    fi
    tries=$((tries-1))
    sleep 0.5
  done
  echo "FAIL: $name did not respond: $url" >&2
  return 1
}

say "Waiting for gateway"
wait_for "$GATEWAY_URL/" "Gateway"

say "Waiting for app"
wait_for "$APP_URL/" "App"

say "Checking bot token endpoint"
curl -fsS "$APP_URL/api/clawdbot/token" | sed -e 's/"token":"[^"]\+"/"token":"***"/'

say "Checking control state endpoint"
curl -fsS "$APP_URL/api/control/state" | head -c 500; echo

say "Smoke test complete"
