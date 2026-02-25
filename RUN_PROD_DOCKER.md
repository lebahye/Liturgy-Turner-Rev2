# RUN_PROD_DOCKER.md

## Purpose
Reference deployment flow for production-like runtime using Docker Compose.

## Target
- Linux host preferred for production reliability
- Docker Compose orchestrates app + postgres (+ optional agent)

---

## 1) Prerequisites
- Docker Engine + Compose plugin
- Project `.env` configured

Minimum env values to review:
- `POSTGRES_PASSWORD`
- `OPENAI_API_KEY` (if used)
- `GATEWAY_TOKEN` (for agent gateway auth)
- `APP_HOST_PORT` (optional override, default `5000`)
- `TRACKER_MODE` (`prod` recommended)

---

## 2) Start stack
```bash
docker compose up -d --build
```

Check status:
```bash
docker compose ps
docker compose logs --tail=120 app
```

---

## 3) Verify app health
```bash
curl -s http://127.0.0.1:${APP_HOST_PORT:-5000}/api/liturgy/status
curl -s -X POST http://127.0.0.1:${APP_HOST_PORT:-5000}/api/liturgy/start -H 'Content-Type: application/json' -d '{}'
```

Optional first-run verification on Windows host:
```powershell
.\verify-first-run.ps1 -BaseUrl "http://127.0.0.1:5000"
```

---

## 4) Tracker configuration
Default recommended:
- `TRACKER_MODE=prod`

Supported env knobs:
- `TRACKER_MODE=prod|diag`
- `TRACKER_LOOKAHEAD`
- `TRACKER_CONFIDENCE`
- `TRACKER_COOLDOWN_MS`
- `TRACKER_EVALUATE_ALWAYS`
- `TRACKER_ALLOW_JUMPS`

---

## 5) Agent policy
- Agent is **optional/non-blocking** for core page-turn runtime.
- If agent is unhealthy, app should still serve and process liturgy endpoints.

Check agent logs:
```bash
docker compose logs --tail=200 agent
```

---

## 6) Operational commands
Restart app only:
```bash
docker compose restart app
```

Rebuild app only:
```bash
docker compose up -d --build app
```

Stop stack:
```bash
docker compose down
```

---

## 7) Release gate (must pass)
1. `/api/liturgy/status` returns initialized state
2. `/api/liturgy/start` succeeds
3. `/api/liturgy/process` accepts valid chunk payload
4. UI root loads
5. Optional agent failure does not break app
