# Replit Deployment Guide

## ⚠️ Important Limitations

**Docker is NOT supported on Replit.** This app is designed for Docker, but we can run it on Replit with modifications.

---

## 🎯 What Works on Replit

✅ **Core Application**
- Web server (Express)
- Frontend (React + Vite)
- Database (SQLite)
- File uploads
- Training interface
- Local chat UI

❌ **What Doesn't Work**
- Docker containers
- Clawdbot agent (needs separate setup)
- Multi-container architecture

---

## 🚀 Replit Setup (Alternative)

### Option 1: Run Without Clawdbot (Simplest)

**What you get:**
- Full UI
- Page turning logic
- Training interface
- File uploads
- Basic chat (no AI responses)

**Steps:**

1. **Import from GitHub:**
   ```
   - Create new Repl
   - Import from GitHub: https://github.com/lebahye/Liturgy-Turner-Rev2
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Run Database Migration:**
   ```bash
   npm run db:migrate
   ```

4. **Start Server:**
   ```bash
   npm run dev
   ```

5. **Access:**
   - Replit will show the webview automatically
   - Or open the URL provided

**Configuration:**

Create `.replit` file:
```toml
run = "npm run dev"
entrypoint = "server/index.ts"

[nix]
channel = "stable-22_11"

[deployment]
run = ["npm", "run", "start"]
deploymentTarget = "cloudrun"

[[ports]]
localPort = 5001
externalPort = 80
```

---

### Option 2: With Clawdbot Agent (Advanced)

**Requires:**
- Separate Repl for Clawdbot
- Or external VPS running Clawdbot
- Connection via HTTP API

**Not recommended for Replit** - too complex

---

## 📝 Configuration Changes for Replit

### 1. Environment Variables

Create `.env` file:
```bash
NODE_ENV=production
PORT=5001
SQLITE_DB_PATH=./data/liturgy-turner.db

# Optional: If you have Clawdbot on external server
# CLAWDBOT_GATEWAY_URL=https://your-clawdbot-server.com
```

### 2. Package.json Scripts

Already configured for Replit:
```json
{
  "scripts": {
    "dev": "NODE_ENV=development tsx server/index.ts",
    "start": "NODE_ENV=production node dist/index.cjs",
    "build": "tsx script/build.ts"
  }
}
```

### 3. Database Path

SQLite works great on Replit:
- Database file: `./data/liturgy-turner.db`
- Persists between runs
- Backed up by Replit

---

## 🧪 Testing on Replit

### After Setup:

1. **Homepage:** Should load immediately
2. **Training Page:** Upload a PDF
3. **Live Mode:** Test controls (Next/Prev)
4. **Chat:** Type messages (may not get AI responses without agent)
5. **Display:** Open `/display` in new tab

### Expected Behavior:

✅ All pages load  
✅ PDFs upload successfully  
✅ Manual controls work  
✅ Database saves data  
⚠️ Chat may show "unavailable" without Clawdbot agent

---

## 🐛 Common Replit Issues

### Issue: Port Already in Use
**Fix:**
```bash
# Stop other processes
pkill -f node
# Restart
npm run dev
```

### Issue: Database Locked
**Fix:**
```bash
# Remove lock files
rm -f data/liturgy-turner.db-shm data/liturgy-turner.db-wal
# Restart app
```

### Issue: Out of Memory
**Fix:**
- Replit has limited RAM
- Don't upload huge audio files
- Use smaller PDFs for testing
- Consider upgrading Repl

### Issue: Slow Performance
**Fix:**
- Replit's free tier is slower
- Consider Hacker plan for better performance
- Or deploy to dedicated server

---

## 💡 Recommendations

### Best Setup:

**For Development/Testing:**
- ✅ Use Replit (easy, free)
- ✅ Test UI/UX
- ✅ Develop features
- ⚠️ Limited performance

**For Production:**
- ✅ Use VPS or dedicated server
- ✅ Full Docker support
- ✅ Better performance
- ✅ Clawdbot agent works

---

## 🔄 Syncing with GitHub

Replit auto-syncs with GitHub:

**To pull latest changes:**
```bash
git pull origin main
npm install
npm run build
# Restart
```

**To push changes:**
```bash
git add -A
git commit -m "Your message"
git push origin main
```

---

## 📦 Alternative: Replit without Git

If you don't want GitHub integration:

1. **Upload files directly:**
   - Zip the project
   - Upload to Replit
   - Extract

2. **Manual updates:**
   - Download new version
   - Replace files
   - Restart

---

## 🎯 What to Use Replit For

### ✅ Good Uses:
- UI/UX development
- Testing new features
- Demonstrating to others
- Quick prototypes
- Learning the codebase

### ❌ Not Ideal For:
- Production church use
- High-accuracy training
- Large audio processing
- Real-time liturgy (may lag)

---

## 🚀 Production Deployment Alternatives

### Recommended for Churches:

**1. Local Setup (Best):**
```bash
# On church laptop
docker compose up
# Works offline, full performance
```

**2. VPS (Good for remote):**
```bash
# DigitalOcean, Linode, etc.
git clone https://github.com/lebahye/Liturgy-Turner-Rev2.git
cd Liturgy-Turner-Rev2
docker compose up -d
```

**3. Replit (Testing only):**
- Good for development
- Not recommended for live services

---

## 🔧 Replit-Specific Optimizations

### 1. Reduce Memory Usage

Edit `vite.config.ts`:
```typescript
export default defineConfig({
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },
});
```

### 2. Optimize Database

```bash
# Vacuum database periodically
sqlite3 data/liturgy-turner.db "VACUUM;"
```

### 3. Limit File Sizes

Edit `server/routes.ts`:
```typescript
const uploadPdf = multer({ 
  storage: pdfStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for Replit
  },
});
```

---

## 📊 Performance Comparison

| Feature | Replit | Local Docker | VPS |
|---------|--------|--------------|-----|
| **Setup Time** | 5 min | 10 min | 30 min |
| **Cost** | Free* | $0 | $5-20/mo |
| **Performance** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Reliability** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Offline** | ❌ | ✅ | ❌ |
| **Clawdbot** | ⚠️ Complex | ✅ Works | ✅ Works |

*Free tier has limitations

---

## ✅ Final Recommendations

### For You (Developer):
- ✅ Use Replit for quick tests
- ✅ Use local Docker for real work
- ✅ Push to GitHub frequently

### For Churches:
- ✅ Use local Docker setup
- ✅ Works offline
- ✅ Full performance
- ✅ Clawdbot integrated

### For Demos:
- ✅ Replit is perfect
- ✅ Share URL easily
- ✅ No install needed
- ⚠️ Mention "demo only"

---

*Last Updated: 2026-02-15*  
*Replit Support: Partial (UI works, limited performance)*  
*Recommended: Local Docker for production*
