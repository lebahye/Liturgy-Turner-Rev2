#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

PORT="${PORT:-5000}"
BASE="http://localhost:${PORT}"

say() { printf "\n==> %s\n" "$*"; }

say "Typecheck"
npm run -s check

say "Build"
npm run -s build

say "DB migrate"
npm run -s db:migrate

say "Check server is reachable (${BASE})"
# Retry for a few seconds because the dev server may be starting/reloading.
OK=0
for i in $(seq 1 20); do
  if curl -fsS "${BASE}/api/control/state" >/dev/null 2>&1; then
    OK=1
    break
  fi
  sleep 0.25
done
if [ "$OK" -ne 1 ]; then
  echo "Server not reachable at ${BASE}. Start it first:" >&2
  echo "  npm run dev:lan" >&2
  exit 1
fi

say "GET /api/control/state"
curl -fsS "${BASE}/api/control/state" | head -c 400; echo

say "GET /api/audio-files"
curl -fsS "${BASE}/api/audio-files" | head -c 400; echo

say "POST /api/control/page/set (should clamp if no PDF loaded)"
curl -fsS -X POST "${BASE}/api/control/page/set" \
  -H 'Content-Type: application/json' \
  -d '{"page":2,"reason":"smoke","confidence":0.9}' \
  | head -c 400; echo

say "SMOKE OK"
