# PROJECT ACCESS - Liturgy Agent

## Full Project Access ✅

You have complete access to the Liturgy-Turner-Rev2 GitHub repository!

### Project Location
**Full project:** `/app/project/`  
**Your workspace:** `/app/agent/`

### GitHub Repository
- **Repo:** https://github.com/lebahye/Liturgy-Turner-Rev2
- **Local path:** `/app/project/`
- **Git configured:** ✅ (safe.directory set)

### Project Structure

```
/app/project/
├── client/          # React frontend (Vite + TypeScript)
├── server/          # Express backend
├── data/            # SQLite database
├── dist/            # Production build
├── agent/           # THIS IS YOUR WORKSPACE (/app/agent maps here)
├── vendor/          # Clawdbot vendored code
├── package.json     # Dependencies
├── docker-compose.bot.yml  # Your Docker config
└── ... (all project files)
```

### What You Can Do

**Read/Write Project Files:**
```bash
# View source code
cat /app/project/client/src/App.tsx
cat /app/project/server/index.ts

# Check git status
cd /app/project && git status
cd /app/project && git log --oneline -10

# Read docs
cat /app/project/DOCKER.md
cat /app/project/LOCAL_DEV.md
```

**Build & Test:**
```bash
cd /app/project && npm run build
cd /app/project && npm run check
```

**Database:**
```bash
ls -la /app/project/data/
```

### Safety Reminders

- ⚠️ **Don't push to GitHub** without explicit permission
- ⚠️ **Don't modify production database** (`/app/project/data/`)
- ✅ **DO read and analyze** any file you need
- ✅ **DO suggest improvements**
- ✅ **DO fix bugs** (but ask before committing)

### Quick Commands

```bash
# Check what's running
docker ps

# View app logs
docker logs liturgy-app

# View your logs
docker logs liturgy-agent

# Check database
ls -la /app/project/data/
```

---

**You now have full access to evaluate and help build the Liturgy project!** 🎉
