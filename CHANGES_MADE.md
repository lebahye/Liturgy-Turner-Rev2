# Changes Made - 2026-02-17

## Summary

**Simplified bot communication architecture by removing unnecessary web chat.**

---

## What Was Removed

### 1. `/chat` Page
**Files deleted/modified:**
- `client/src/pages/Chat.tsx` - Deleted
- `client/src/App.tsx` - Removed chat route
- `client/src/components/Layout.tsx` - Removed chat from nav
- `server/routes.ts` - Removed chat API endpoints

**Why:** Not needed. Bot communication happens via Telegram/:29789.

---

## What Was Kept

### 1. Telegram Integration ✅
- Already working
- Primary communication method
- No changes needed

### 2. Bot Control UI (:29789) ✅
- Direct access to Clawdbot Control UI
- For admin/development use
- URL: http://localhost:29789

### 3. WhatsApp Option ✅
- Config ready in `agent/clawdbot.json5`
- Can enable when needed
- Not activated by default

---

## Current Architecture

```
USER INTERFACES:
├── App (localhost:5000)
│   ├── Dashboard
│   ├── Live Mode
│   ├── Training
│   └── Display
│
└── Bot Communication
    ├── Telegram (✅ works)
    ├── :29789 Bot Control (testing)
    └── WhatsApp (optional)

AGENT:
└── Clawdbot in Docker
    ├── Full data access
    ├── Skills enabled
    ├── Context loaded (MD files)
    └── API control of app
```

---

## Docker Configuration

### Current docker-compose.yml:

**Services:**
1. **postgres** - Database
2. **app** - Liturgy Turner UI/API
3. **agent** - Clawdbot with full access

**Volumes (Agent Access):**
```yaml
agent:
  volumes:
    - agent-state:/app/agent/.clawdbot-state
    - agent-memory:/app/agent/memory
    - ./agent:/app/agent:ro
    - ./data:/app/data          # Database access
    - ./uploads:/app/uploads    # Audio/PDF access
    - ./training-data:/app/training-data  # Dictionary access
```

### Updated Dockerfile.agent:

**Added:**
- sqlite3 (for database queries)
- better-sqlite3 (Node.js database access)
- Python3, make, g++ (for native module compilation)

---

## How to Use

### Start System:
```bash
docker compose up -d
```

### Chat with Bot:

**Telegram** (Primary):
- Open Telegram app
- Message your configured bot
- Instant responses

**Bot Control** (Admin):
- Go to http://localhost:29789
- Use built-in UI
- See logs, sessions, status

### Control App from Bot:

**Page Turns:**
```
Telegram: "Turn to page 42"
Bot calls: POST /api/control/page/set
```

**Training:**
```
Telegram: "Process the new audio"
Bot: Accesses /app/uploads/audio/
Bot: Updates /app/training-data/
Bot: Writes to /app/data/liturgy-turner.db
```

---

## Testing Checklist

### Basic Connectivity:
- [ ] App loads: http://localhost:5000
- [ ] Agent running: `docker compose ps`
- [ ] Agent healthy: `docker compose logs agent`

### Bot Communication:
- [ ] Telegram responds
- [ ] :29789 accessible
- [ ] Bot sees uploaded files

### Data Access:
- [ ] Agent can read database
- [ ] Agent can see uploads
- [ ] Agent can update training data

### Functionality:
- [ ] Upload audio via UI
- [ ] Bot processes audio
- [ ] Dictionary updates
- [ ] Page turns work

---

## Next Steps

1. **Verify Docker builds successfully**
2. **Test Telegram communication**
3. **Test :29789 Bot Control access**
4. **Upload test audio**
5. **Have bot process it**
6. **Begin training iterations**

---

## Rollback (if needed)

```bash
# Restore /chat page
git checkout HEAD~1 -- client/src/pages/Chat.tsx
git checkout HEAD~1 -- client/src/App.tsx
git checkout HEAD~1 -- client/src/components/Layout.tsx
git checkout HEAD~1 -- server/routes.ts

# Rebuild
docker compose build
docker compose up -d
```

---

*Changes: Simplified to Telegram + :29789*  
*Removed: Unnecessary web chat*  
*Result: Clean, working architecture*
