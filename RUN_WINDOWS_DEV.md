# RUN_WINDOWS_DEV.md

## Purpose
Fast, reliable local development on Windows with minimal friction.

## Recommended Mode (Windows)
- Run **app locally** (Node)
- Keep Docker optional (DB/agent only)
- Use Docker full-stack only when you specifically need it

---

## Prerequisites
- Node.js 22.x (recommended)
- npm
- PowerShell
- Optional: Docker Desktop (for Postgres/agent)

---

## 1) Install dependencies
```powershell
cd C:\Users\lebah\Documents\Liturgy-Turner-Rev2
npm install
```

## 2) Database
If using local SQLite path from project defaults, just run:
```powershell
npx drizzle-kit push
```

If using Docker Postgres, start only DB:
```powershell
docker compose up -d postgres
```

## 3) Start app locally
```powershell
$env:NODE_ENV="development"
$env:PORT="5000"
$env:HOST="127.0.0.1"
npx tsx server/index.ts
```

Open:
- http://127.0.0.1:5000/

---

## 4) Quick health checks
```powershell
curl.exe -s http://127.0.0.1:5000/api/liturgy/status
curl.exe -s -X POST http://127.0.0.1:5000/api/liturgy/start -H "Content-Type: application/json" -d "{}"
```

Synthetic process check:
```powershell
node -e "const audioData=Array.from({length:4096},(_,i)=>Math.sin(i/20)*0.01);fetch('http://127.0.0.1:5000/api/liturgy/process',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({audioData,timestamp:Date.now()})}).then(r=>r.text()).then(console.log)"
```

---

## 5) Tracker modes (no source edits)
Use env vars before starting app:

### Production-like behavior
```powershell
$env:TRACKER_MODE="prod"
```

### Diagnostic behavior
```powershell
$env:TRACKER_MODE="diag"
```

Optional overrides:
- `TRACKER_LOOKAHEAD`
- `TRACKER_CONFIDENCE`
- `TRACKER_COOLDOWN_MS`
- `TRACKER_EVALUATE_ALWAYS`
- `TRACKER_ALLOW_JUMPS`

---

## 6) Known Windows note
If Docker host port proxy gives `ERR_EMPTY_RESPONSE`, continue development in local Node mode above. This avoids Docker Desktop networking flakiness on some Windows setups.
