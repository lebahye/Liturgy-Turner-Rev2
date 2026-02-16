# Local Development - Official Strategy

## 🎯 Final Decision: Everything Local

**Date:** 2026-02-16  
**Decision:** Local development only, GitHub for version control, no cloud dependencies.

---

## ✅ Development Strategy

### Core Principles
1. **Local First** - Everything runs on your machine
2. **GitHub Only** - Version control, that's it
3. **Docker + SQLite** - Full stack locally
4. **Test Locally** - Until ready for packaging
5. **No Cloud Services** - Replit, VPS, etc. not needed

---

## 🚀 Local Setup

### Prerequisites
- Docker Desktop installed
- Git configured
- 8GB+ RAM
- 50GB+ disk space

### Start Development
```bash
# Clone (if needed)
git clone https://github.com/lebahye/Liturgy-Turner-Rev2.git
cd Liturgy-Turner-Rev2

# Start everything
docker compose up

# Open browser
# http://localhost:5000
```

**That's it!** No external services, no API keys, no complexity.

---

## 🔄 Daily Workflow

### Starting Your Day
```bash
cd /app/project

# Pull latest changes
git pull origin main

# Start services
docker compose up

# Start coding!
```

### During Development
```bash
# Make changes to files
# Save
# Refresh browser (hot reload works)

# Test changes
# Verify everything works
```

### End of Day
```bash
# Stop services (Ctrl+C)
# Or
docker compose down

# Commit changes
git add -A
git commit -m "Description of changes"
git push origin main

# Done!
```

---

## 🎯 Testing Locally

### Test Everything
```bash
# Start app
docker compose up

# Test all pages:
# http://localhost:5000        - Dashboard
# http://localhost:5000/live   - Live mode
# http://localhost:5000/training - Training
# http://localhost:5000/chat   - Chat
# http://localhost:5000/display - Display

# Verify:
# - All pages load
# - Upload works
# - Navigation works
# - Database saves data
```

### Run Validation Scripts
```bash
# Validate dictionary
npm run validate-dictionary

# Run self-tests
npm run self-test

# Check database
ls -lh data/
```

---

## 📊 What Runs Locally

### Services (Docker)
```
┌─────────────────────────────┐
│   Web App (port 5000)       │
│   - Frontend (React)         │
│   - Backend (Express)        │
│   - Database (SQLite)        │
│   - Clawdbot Agent           │
└─────────────────────────────┘
```

### Storage (Local Disk)
```
/app/project/
├── data/
│   └── liturgy-turner.db     Database
├── client/public/uploads/
│   ├── pdfs/                 Uploaded PDFs
│   └── audio/                Training audio
├── training-data/            Fingerprints, dictionary
└── reports/                  Test results
```

**Everything stays on your computer!**

---

## 🔧 Development Tools

### Available Commands
```bash
# Development mode (hot reload)
npm run dev

# Build for production
npm run build

# Start production build
npm start

# Database operations
npm run db:migrate
npm run db:push

# Validation & Testing
npm run validate-dictionary
npm run self-test
npm run create-annotation
```

### Docker Commands
```bash
# Start all services
docker compose up

# Start in background
docker compose up -d

# Stop services
docker compose down

# View logs
docker compose logs -f

# Rebuild after changes
docker compose build
docker compose up
```

---

## 🎓 Training Workflow

### When You Get New Audio

**Tomorrow when you provide new audio:**

1. **Upload via UI:**
   ```
   http://localhost:5000/training
   Click "Upload Audio"
   Select file
   Wait for processing
   ```

2. **Or copy directly:**
   ```bash
   cp ~/Downloads/new_service.wav /app/project/client/public/uploads/audio/
   ```

3. **Create annotation:**
   ```bash
   npm run create-annotation new_service.wav 50 annotations/service2.json
   # Edit the JSON file with page turn timestamps
   ```

4. **Train on it:**
   ```bash
   # Framework ready for pre-training script
   # Will process all audio and expand dictionary
   ```

5. **Validate:**
   ```bash
   npm run validate-dictionary
   # Check if score improved (target: 90+)
   ```

---

## 📦 Packaging Strategy

### When Ready to Package

**After:**
- ✅ Trained on 3+ services
- ✅ Dictionary at 90%+ score
- ✅ Tested thoroughly locally
- ✅ 90%+ accuracy validated

**Then create package:**

### Option 1: Docker Image
```bash
# Build production image
docker compose build

# Save image
docker save liturgy-turner > liturgy-turner.tar

# Transfer to another PC
# Load on other PC:
docker load < liturgy-turner.tar
docker compose up
```

### Option 2: Installer (Electron)
```bash
# Build desktop app
npm run package

# Creates installers:
# - LiturgyTurner-Setup.exe (Windows)
# - LiturgyTurner.dmg (Mac)
# - liturgy-turner.AppImage (Linux)
```

### Option 3: Portable Bundle
```bash
# Create portable package
tar -czf liturgy-turner-portable.tar.gz \
  --exclude=node_modules \
  --exclude=.git \
  /app/project/

# Extract on another PC
# Run: docker compose up
```

---

## 🧪 Testing on Another PC

### Test Installation

1. **Transfer package** (USB, network, whatever)

2. **On new PC:**
   ```bash
   # Extract
   tar -xzf liturgy-turner-portable.tar.gz

   # Or load Docker image
   docker load < liturgy-turner.tar

   # Start
   cd liturgy-turner
   docker compose up

   # Test
   # Open: http://localhost:5000
   ```

3. **Verify:**
   - [ ] App starts
   - [ ] Pages load
   - [ ] Upload works
   - [ ] Training data present
   - [ ] Dictionary loaded
   - [ ] Page turning works
   - [ ] Display syncs

4. **Test with church audio:**
   - Upload liturgy PDF
   - Test microphone
   - Try manual controls
   - Test auto page turning

---

## 🎯 Focus Areas

### What to Test Repeatedly

**Before each commit:**
- [ ] All pages load without errors
- [ ] Upload PDF works
- [ ] Upload audio works
- [ ] Chat responds (even if "unavailable" message)
- [ ] Display syncs with controls
- [ ] Database saves data
- [ ] No console errors

**Before packaging:**
- [ ] Train on 3+ services
- [ ] Dictionary 90%+ score
- [ ] Test full service simulation
- [ ] Accuracy 90%+
- [ ] All docs updated
- [ ] Installation tested on fresh PC

---

## 🔄 Continuous Improvement Loop

### Every Day:
1. Code changes
2. Test locally
3. Validate
4. Commit to GitHub
5. Repeat

### When You Have Audio:
1. Upload to app
2. Annotate timestamps
3. Train system
4. Validate dictionary
5. Test accuracy
6. Document improvements

### Weekly:
1. Review progress
2. Run full test suite
3. Update documentation
4. Backup database
5. Plan next week

---

## 📁 Local File Structure

### What's Where
```
/app/project/                     Project root
├── client/                       Frontend code
│   ├── src/pages/               React pages
│   └── public/uploads/          User uploads
├── server/                       Backend code
│   ├── index.ts                 Main server
│   ├── routes.ts                API endpoints
│   └── storage.ts               Database ops
├── shared/                       Shared code
│   └── schema.ts                Database schema
├── data/                         Local data
│   └── liturgy-turner.db        SQLite database
├── training-data/                Training files
│   ├── armenian-phonetic-dict.json
│   └── db-phonetic-dict.json
├── scripts/                      Utility scripts
├── docker-compose.yml           Docker config
└── package.json                 Dependencies
```

---

## 💾 Backup Strategy

### What to Backup

**Critical:**
- `data/` - Database
- `training-data/` - Dictionary, fingerprints
- `client/public/uploads/` - User files

**Optional:**
- `reports/` - Test results
- `.env` - Configuration

### How to Backup
```bash
# Daily backup
cp -r data/ backups/data-$(date +%Y%m%d)/
cp -r training-data/ backups/training-$(date +%Y%m%d)/

# Or full project
cd /app
tar -czf project-backup-$(date +%Y%m%d).tar.gz project/
```

### GitHub Backup
```bash
# Everything backed up on every commit
git add -A
git commit -m "Daily progress"
git push origin main

# GitHub = automatic backup!
```

---

## 🐛 Troubleshooting Local Setup

### Issue: Docker won't start
```bash
# Check Docker Desktop is running
docker ps

# Restart Docker Desktop

# Rebuild containers
docker compose build
docker compose up
```

### Issue: Port 5000 in use
```bash
# Find what's using port
lsof -i :5000

# Kill it
kill -9 <PID>

# Or change port in docker-compose.yml
```

### Issue: Database locked
```bash
# Stop all services
docker compose down

# Remove lock files
rm -f data/*.db-shm data/*.db-wal

# Restart
docker compose up
```

### Issue: Changes not showing
```bash
# Hard refresh browser (Ctrl+Shift+R)

# Or rebuild
docker compose build
docker compose up
```

---

## ✅ Daily Checklist

### Start of Day:
- [ ] Pull latest from GitHub
- [ ] Start Docker services
- [ ] Check logs for errors
- [ ] Verify app loads

### During Development:
- [ ] Test changes immediately
- [ ] Check console for errors
- [ ] Verify database saves
- [ ] Keep commits small and frequent

### End of Day:
- [ ] Run validation scripts
- [ ] Commit all changes
- [ ] Push to GitHub
- [ ] Stop Docker services
- [ ] Backup if needed

---

## 🎯 Success Metrics

### System is Ready When:
- ✅ Dictionary: 5000+ words, 90%+ validation score
- ✅ Accuracy: 90%+ on test audio
- ✅ Testing: Works on fresh PC
- ✅ Documentation: Complete and clear
- ✅ Packaging: Installer works
- ✅ Church Test: Successfully used in real service

---

## 📞 Remember

**Everything local means:**
- ✅ No internet required (except git push)
- ✅ No external services
- ✅ No API keys
- ✅ No monthly costs
- ✅ Full control
- ✅ Your data, your machine

**Focus on:**
- Making it work locally
- Getting 90%+ accuracy
- Testing thoroughly
- Packaging when ready

**Tomorrow:**
- You provide new audio
- I process it
- Dictionary expands
- Accuracy improves
- We get closer to 90%+

---

*Development Strategy: 100% Local*  
*Version Control: GitHub only*  
*Next: Process new audio tomorrow*  
*Goal: 90%+ accuracy, then package*
