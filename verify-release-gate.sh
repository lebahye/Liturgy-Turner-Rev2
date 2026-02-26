#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:5000}"

pass(){ echo "[PASS] $1"; }
fail(){ echo "[FAIL] $1"; exit 1; }

check_json(){
  local name="$1"
  local cmd="$2"
  if eval "$cmd" >/tmp/liturgy_check.json 2>/tmp/liturgy_check.err; then
    pass "$name"
  else
    echo "--- stderr ---"; cat /tmp/liturgy_check.err || true
    fail "$name"
  fi
}

check_json "GET /api/liturgy/status" "curl -fsS ${BASE_URL}/api/liturgy/status"
check_json "POST /api/liturgy/start" "curl -fsS -X POST ${BASE_URL}/api/liturgy/start -H 'Content-Type: application/json' -d '{}'"

PAYLOAD=$(python3 - <<'PY'
import json,math,time
arr=[math.sin(i/20)*0.01 for i in range(4096)]
print(json.dumps({'audioData':arr,'timestamp':int(time.time()*1000)}))
PY
)
check_json "POST /api/liturgy/process synthetic" "curl -fsS -X POST ${BASE_URL}/api/liturgy/process -H 'Content-Type: application/json' --data-binary '$PAYLOAD'"

check_json "POST /api/control/pdf/set" "curl -fsS -X POST ${BASE_URL}/api/control/pdf/set -H 'Content-Type: application/json' -d '{\"pdfPath\":\"/uploads/pdfs/liturgy.pdf\",\"totalPages\":183}'"
check_json "POST /api/control/page/set" "curl -fsS -X POST ${BASE_URL}/api/control/page/set -H 'Content-Type: application/json' -d '{\"page\":2,\"reason\":\"release_gate\",\"confidence\":1}'"
check_json "GET /api/control/state" "curl -fsS ${BASE_URL}/api/control/state"

if curl -fsS "${BASE_URL}/" | grep -Eiq '<!doctype html|<html'; then
  pass "UI root returns HTML"
else
  fail "UI root returns HTML"
fi

echo "All release-gate checks passed."