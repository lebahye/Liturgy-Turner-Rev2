# Architecture - Liturgy Turner

## 🏗️ System Design

### Core Philosophy
**Local-first, self-contained, with optional cloud features**

---

## 📦 Core Components (Required)

### 1. Web Application
- **Frontend:** React + TypeScript
- **Backend:** Express.js + Node.js
- **Database:** SQLite (local file)
- **Purpose:** Main interface for everything

**What it provides:**
- ✅ Live Mode (page turning)
- ✅ Training interface
- ✅ Display view (for TV/projector)
- ✅ Local chat with bot
- ✅ File uploads (PDF, audio)
- ✅ Statistics and metrics

**No internet required** - Works completely offline

---

### 2. Clawdbot Agent (Simplified)
- **Version:** Lite/Embedded
- **Purpose:** AI assistant for setup and help
- **Interface:** Local chat (built into web app)

**What it helps with:**
- Setup guidance
- Troubleshooting
- Accuracy improvement
- Questions about the system
- Training recommendations

**Simplified for churches:**
- No complex configuration
- Pre-configured for liturgy
- Works out of the box
- Updates automatically

---

### 3. SQLite Database
- **Location:** Local file (`data/liturgy-turner.db`)
- **Size:** Starts ~1MB, grows to ~50MB
- **Backup:** Simple file copy

**Stores:**
- Training data
- Page fingerprints
- Armenian dictionary
- Chat history
- Accuracy metrics
- User settings

**Benefits:**
- No database server needed
- Easy to backup (just copy file)
- Works offline
- Fast and reliable

---

## 🔌 Optional Components

### Optional Add-on: Telegram Bot
**Use case:** Remote control from phones

**When to add:**
- Multiple people need to control
- Want notifications on phone
- Remote monitoring needed
- Testing from anywhere

**Setup complexity:** Medium  
**Requires:** Telegram Bot Token (free)

**Benefits:**
- Control from phone
- Get notifications
- Multiple users
- Remote access

**Skip if:** You only need local control

---

### Optional Add-on: WhatsApp Bot
**Use case:** Similar to Telegram

**When to add:**
- Congregation uses WhatsApp
- Want familiar interface
- Need group chat control

**Setup complexity:** Medium-High  
**Requires:** WhatsApp Business API

**Benefits:**
- Familiar for users
- Group coordination
- Voice messages
- Media sharing

**Skip if:** Not needed for your church

---

## 🎯 Default Installation (Recommended)

### What You Get Out of the Box:

```
┌─────────────────────────────────────────┐
│         Web Browser Interface           │
│  (http://localhost:5000)                │
│                                         │
│  - Live Mode (page turning)            │
│  - Training interface                   │
│  - Local chat with bot                  │
│  - Display view                         │
│  - Statistics                           │
└─────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────┐
│      Express.js Backend Server          │
│  - API endpoints                        │
│  - Audio processing                     │
│  - Page turn logic                      │
│  - File storage                         │
└─────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────┐
│         SQLite Database                 │
│  - Training data                        │
│  - Dictionary                           │
│  - Metrics                              │
└─────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────┐
│    Clawdbot Agent (Simplified)          │
│  - Setup help                           │
│  - Troubleshooting                      │
│  - Learning engine                      │
└─────────────────────────────────────────┘
```

**No external services needed!**

---

## 🌐 Optional: Add External Messaging

If you want Telegram/WhatsApp:

```
┌─────────────────────────────────────────┐
│         Web Interface (Core)            │
└─────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────┐
│         Backend Server                  │
└─────────────────────────────────────────┘
                    ↕
        ┌───────────┴───────────┐
        ↓                       ↓
┌──────────────┐        ┌──────────────┐
│   Telegram   │        │   WhatsApp   │
│   (Optional) │        │   (Optional) │
└──────────────┘        └──────────────┘
```

**Added later, not required for basic operation**

---

## 🚀 Deployment Options

### Option 1: Single Laptop (Simplest)
**Best for:** Small churches, single location

```
Church Laptop
├── Web server (port 5000)
├── Database (SQLite file)
├── Clawdbot agent
└── Training data
```

**Access:**
- Control: Same laptop (localhost:5000)
- Display: HDMI to TV/projector
- Network: Not required (unless remote display)

**Pros:**
- ✅ Simplest setup
- ✅ No network needed
- ✅ All in one place
- ✅ Easy backup

**Cons:**
- ❌ Single point of failure
- ❌ Must be near TV

---

### Option 2: Network Setup (Recommended)
**Best for:** Flexibility, remote display

```
Control Laptop              Church WiFi              Display Device
├── Browser ─────────────────────────────────────────→ TV Browser
│   (localhost:5000)                                    (laptop-ip:5000/display)
└── Runs server
    ├── Database
    └── Agent
```

**Access:**
- Control: Laptop browser
- Display: Any device on network
- Network: Local WiFi required

**Pros:**
- ✅ Flexible display placement
- ✅ Multiple control devices
- ✅ Remote testing
- ✅ Tablet control possible

**Cons:**
- ❌ Requires stable WiFi
- ❌ Network troubleshooting

---

### Option 3: Cloud/VPS (Advanced)
**Best for:** Multiple churches, remote access

**Not recommended initially** - Start local, upgrade later if needed

---

## 💾 Data Storage

### What's Stored Locally:

```
/app/project/
├── data/
│   └── liturgy-turner.db          (Database: ~1-50MB)
├── client/public/uploads/
│   ├── pdfs/                      (PDFs: ~2MB each)
│   └── audio/                     (Audio: ~100-500MB each)
├── training-data/
│   ├── fingerprints-v2.json       (Audio patterns: ~132KB)
│   ├── armenian-phonetic-dict.json (Words: ~22KB)
│   └── db-phonetic-dict.json      (Phonetics: ~310KB)
└── reports/                       (Test results: growing)
```

**Total storage needed:** 1-5GB (depending on audio files)

---

## 🔐 Security Model

### Local-First Security
- ✅ No data leaves the computer (by default)
- ✅ No cloud accounts required
- ✅ No API keys needed
- ✅ No external dependencies

### Network Security (if using WiFi)
- Password-protected WiFi recommended
- Firewall allows port 5000 locally
- HTTPS optional (local network)

### Optional: External Messaging
- Telegram/WhatsApp: Uses their encryption
- Bot tokens stored locally
- Only setup if needed

---

## 🎛️ Configuration Philosophy

### Default: Works Without Configuration
**Principle:** "Install and run"

**No required settings:**
- Database: Auto-created
- Tables: Auto-migrated
- Defaults: Pre-configured
- Training: Pre-loaded

### Optional: Customize Later
**Advanced users can:**
- Adjust confidence thresholds
- Tune audio sensitivity
- Customize page timings
- Add external messaging

---

## 🔄 Update Model

### Automatic Updates
**What updates automatically:**
- Training data (from live services)
- Dictionary (new words)
- Confidence thresholds (self-tuning)
- Metrics (accuracy tracking)

### Manual Updates
**When available:**
```bash
cd /app/project
git pull origin main
npm install
npm run build
# Restart app
```

**Gets you:**
- Bug fixes
- Algorithm improvements
- New features
- Documentation updates

---

## 📱 User Interfaces

### 1. Web UI (Primary)
**URL:** http://localhost:5000

**Pages:**
- `/` - Dashboard
- `/live` - Live mode control
- `/training` - Upload & train
- `/chat` - Talk to bot
- `/display` - Full-screen PDF view
- `/bot` - Advanced bot controls

### 2. Telegram (Optional)
**Setup:** Requires bot token  
**Commands:** `/start`, `/page`, `/status`

### 3. WhatsApp (Optional)
**Setup:** Requires business API  
**Commands:** Similar to Telegram

---

## 🎯 For New Churches

### Minimum Viable Setup:

**Hardware:**
- Laptop (any modern laptop)
- USB microphone (or built-in)
- HDMI cable to TV

**Software:**
- This app (Docker or npm)
- No accounts needed
- No API keys needed
- No external services

**Time to set up:**
- Install: 10 minutes
- Upload PDF: 2 minutes
- Test: 5 minutes
- **Total: ~20 minutes**

### Optional Enhancements:

**Later, if wanted:**
- Add Telegram control (30 min setup)
- Add WhatsApp (1 hour setup)
- Set up cloud backup
- Configure remote access

**But not required for basic operation!**

---

## 🔮 Future Considerations

### Potential Add-ons (Not Yet Built):

**Mobile App:**
- Native iOS/Android
- Offline-first
- Background sync

**Multi-Church Network:**
- Share training data (anonymized)
- Community improvements
- Central updates

**Voice Recognition:**
- Identify specific priest
- Speaker-aware turning
- Multi-language support

**Advanced AI:**
- Natural language control
- Predictive page turning
- Context-aware assistance

---

## 📊 Comparison: Standalone vs Full

### Standalone (Default)
```
✅ Install: 10 minutes
✅ Setup: Minimal
✅ Dependencies: None
✅ Offline: Works completely
✅ Maintenance: Auto-updates
✅ Cost: Free
✅ Complexity: Low
```

### With Telegram/WhatsApp
```
⚠️ Install: 30-60 minutes
⚠️ Setup: Bot tokens, API keys
⚠️ Dependencies: External services
⚠️ Offline: Messaging requires internet
⚠️ Maintenance: Monitor bot health
✅ Cost: Still free (mostly)
⚠️ Complexity: Medium
```

**Recommendation:** Start standalone, add messaging only if needed

---

## 🎓 Simplified Clawdbot Onboarding

### What's Different in "Liturgy Edition"

**Standard Clawdbot:**
- Full configuration options
- Multiple AI providers
- Complex routing
- Advanced features

**Liturgy Edition (Simplified):**
- Pre-configured for churches
- Single AI provider (built-in)
- Simple chat interface
- Church-specific knowledge

**Setup Required:**
- ✅ None (works out of box)
- ✅ No tokens needed
- ✅ No configuration files
- ✅ Just install and run

### What the Bot Knows

**Pre-trained on:**
- Armenian liturgy
- Church setup procedures
- Audio equipment
- Acoustic troubleshooting
- Page turning logic

**Can answer:**
- "How do I position the microphone?"
- "Why did page 23 not turn?"
- "What's my current accuracy?"
- "How do I upload a new PDF?"

**Local & Private:**
- All data stays on your computer
- No cloud AI calls (by default)
- Conversations saved locally
- Privacy respected

---

## ✅ Summary

### Core Architecture:
- ✅ Local-first (works offline)
- ✅ Self-contained (no external dependencies)
- ✅ Simple to install (Docker or npm)
- ✅ Easy to use (web interface)

### Optional Features:
- ⚙️ Telegram control
- ⚙️ WhatsApp control
- ⚙️ Cloud backup
- ⚙️ Remote access

### Philosophy:
- **Start simple** - Core features work immediately
- **Add complexity** - Only if you need it
- **Stay local** - Your data, your control
- **Easy maintenance** - Auto-updates, self-healing

---

*This architecture ensures new churches can get started in 20 minutes without any external accounts, API keys, or complexity. Add optional features later if desired.*

---

*Last Updated: 2026-02-15*  
*Status: Production-ready*  
*Deployment: Local-first, optional cloud*
