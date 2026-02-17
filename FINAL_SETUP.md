# Final Setup - Clean Architecture

**Date:** 2026-02-17  
**Status:** Simplified and Working

---

## ✅ What Changed

### **REMOVED:**
- ❌ `/chat` page from app (not needed)
- ❌ Web chat API endpoints
- ❌ Complex integration attempts

### **KEPT:**
- ✅ Telegram (primary communication)
- ✅ Port :29789 (Clawdbot Control UI)
- ✅ WhatsApp option (can enable later)

---

## 🏗️ Architecture

```
┌──────────────────────────────────────┐
│      LITURGY TURNER APP              │
│                                      │
│  - Display liturgy pages             │
│  - Upload audio/PDF                  │
│  - Training interface                │
│  - Manual page controls              │
│  - Live mode                         │
│                                      │
│  (NO chat - use Telegram/Bot UI)    │
└──────────────────────────────────────┘
              ↓ API calls
┌──────────────────────────────────────┐
│       CLAWDBOT AGENT                 │
│                                      │
│  Communication:                      │
│  - Telegram (:29789)                 │
│  - Bot Control UI (:29789)           │
│  - WhatsApp (optional)               │
│                                      │
│  Capabilities:                       │
│  - Process audio                     │
│  - Build dictionary                  │
│  - Control page turns (via API)      │
│  - Train on recordings               │
│  - Access all data                   │
└──────────────────────────────────────┘
```

---

## 🚀 How to Use

### **Start System:**
```bash
cd ~/clawd/projects/Liturgy-Turner-Rev2
docker compose up -d
```

### **Access Points:**
- **App:** http://localhost:5000
- **Bot Control:** http://localhost:29789
- **Telegram:** Your existing bot

### **Chat with Bot:**

**Option 1: Telegram** (Recommended)
- Open Telegram
- Message your bot
- Get instant responses

**Option 2: Bot Control UI**
- Go to http://localhost:29789
- Use built-in chat interface
- See sessions, logs, status

**Option 3: WhatsApp** (Optional)
- Enable in `agent/clawdbot.json5`
- Scan QR code
- Message via WhatsApp

---

## 🎯 Bot Capabilities

### **Via Telegram/Control UI, you can:**

**Training:**
- "Process the audio file I just uploaded"
- "How many words in the dictionary?"
- "Show me training progress"

**Page Control:**
- "Turn to page 42"
- "Next page"
- "Previous page"

**Status:**
- "What's your current status?"
- "How accurate is the dictionary?"
- "Show me recent page turns"

**Audio Processing:**
- "Analyze the audio fingerprints"
- "What confidence do you have on page 15?"

---

## 📊 Bot Access to Data

### **Full Access Via Docker Volumes:**

```
/app/data/               # Database
/app/uploads/            # Audio + PDFs
/app/training-data/      # Dictionary
/app/agent/              # Bot workspace
  ├── AGENTS.md
  ├── SOUL.md
  ├── MEMORY.md
  ├── HEARTBEAT.md
  ├── PROJECT_ACCESS.md
  └── skills/
```

**Bot can:**
- ✅ Read/write database
- ✅ Process uploaded audio
- ✅ Update dictionary
- ✅ Control page turns via API
- ✅ Monitor training

---

## 🔧 Configuration

### **Telegram (Already Working):**
`agent/clawdbot.json5:`
```json5
{
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "YOUR_TOKEN",
      "allowFrom": ["tg:YOUR_ID"]
    }
  }
}
```

### **WhatsApp (Optional):**
`agent/clawdbot.json5:`
```json5
{
  "channels": {
    "whatsapp": {
      "enabled": true,
      // Follow setup prompts
    }
  }
}
```

### **Bot Skills:**
`agent/skills/` contains:
- `liturgy-controller/` - Page turn control
- `liturgy-audio-controller/` - Audio processing
- (Add more as needed)

---

## 📝 Training Workflow

### **1. Upload Audio**
```bash
# Via app UI:
http://localhost:5000/training

# Or directly:
docker cp recording.wav liturgy-agent:/app/uploads/audio/
```

### **2. Tell Bot to Process**
Via Telegram:
> "Process the new audio file"

Or via :29789:
> "Train on recording.wav"

### **3. Check Progress**
> "How many words learned?"
> "What's the dictionary size?"
> "Show training status"

### **4. Test Accuracy**
```bash
# Test page turning
curl -X POST http://localhost:5000/api/control/page/set \
  -H "Content-Type: application/json" \
  -d '{"page":42}'
```

---

## 🐛 Troubleshooting

### **Bot not responding on Telegram:**
```bash
docker compose logs agent | grep telegram
# Check for errors
```

### **Can't access :29789:**
```bash
curl http://localhost:29789/status
# Should return HTML

docker compose ps
# Agent should be healthy
```

### **Bot can't see uploaded files:**
```bash
docker compose exec agent ls -la /app/uploads/audio/
# Should list files
```

### **Database issues:**
```bash
docker compose exec agent sqlite3 /app/data/liturgy-turner.db ".tables"
# Should show tables
```

---

## 📦 Shipping to New Laptop

### **Package:**
```bash
# Commit everything
git add .
git commit -m "Ready for deployment"
git push
```

### **Install on New Laptop:**
```bash
# 1. Clone
git clone YOUR_REPO
cd Liturgy-Turner-Rev2

# 2. Configure
cp .env.example .env
# Edit .env - add ANTHROPIC_API_KEY

# 3. Start
docker compose up -d

# 4. Setup Telegram
# Bot auto-starts with configured token

# DONE - System running
```

---

## ✅ Success Criteria

### **System Working When:**
- [ ] App loads at :5000
- [ ] Bot responds on Telegram
- [ ] :29789 Control UI accessible
- [ ] Can upload audio files
- [ ] Bot can process audio
- [ ] Dictionary updates
- [ ] Page turns work via API

---

## 🎓 Next Steps

**Now that communication works:**

1. **Focus on training**
   - Upload multiple service recordings
   - Process each one
   - Build dictionary to 5,000+ words

2. **Test page turning**
   - Live mode during practice
   - Verify accuracy
   - Tune confidence thresholds

3. **Prepare for church**
   - Test on TV/projector
   - Practice with deacon
   - Have backup plan

4. **Ship when ready**
   - Package Docker
   - Transfer to church laptop
   - Run during actual service

---

**Simple. Clean. Working.**

*Bot communication: Telegram + :29789*  
*App focus: Liturgy display + training*  
*Clean separation. Professional deployment.*
