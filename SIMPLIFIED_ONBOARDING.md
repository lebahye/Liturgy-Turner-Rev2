# Simplified Onboarding - Liturgy Turner

## 🎯 Get Started in 20 Minutes

This guide gets your church up and running with **zero configuration**. No accounts, no API keys, no complexity.

---

## ✅ What You Get Out of the Box

- ✅ Web interface for control
- ✅ Automatic page turning
- ✅ Local chat with AI assistant
- ✅ Display view for TV/projector
- ✅ Training interface
- ✅ Works completely offline

**No Telegram, WhatsApp, or internet required!**

---

## 🚀 Quick Start (3 Steps)

### Step 1: Install (5 minutes)

**Option A: Docker (Recommended)**
```bash
# 1. Download
git clone https://github.com/lebahye/Liturgy-Turner-Rev2.git
cd Liturgy-Turner-Rev2

# 2. Start
docker compose up

# Done! Go to: http://localhost:5000
```

**Option B: Local Install**
```bash
# 1. Download
git clone https://github.com/lebahye/Liturgy-Turner-Rev2.git
cd Liturgy-Turner-Rev2

# 2. Install
npm install

# 3. Start
npm run dev

# Done! Go to: http://localhost:5000
```

---

### Step 2: Upload Your Liturgy (2 minutes)

1. Open http://localhost:5000
2. Click **"Training"** in menu
3. Click **"Upload PDF"**
4. Select your liturgy PDF
5. Wait for upload (~ 30 seconds)

✅ Done!

---

### Step 3: Test It (5 minutes)

**Set up Display:**
1. Open http://localhost:5000/display in browser
2. Press F11 for fullscreen
3. Position on TV/projector

**Test Controls:**
1. Open http://localhost:5000/live
2. Select your PDF
3. Click "Start Live Mode"
4. Try "Next" and "Prev" buttons
5. Display should change pages

✅ Working!

---

## 💬 Talk to Your AI Assistant

### Built-in Chat (No Setup Required)

1. Go to http://localhost:5000/chat
2. Click "New Chat"
3. Type your question

**Try asking:**
- "How do I position the microphone?"
- "Help me upload audio training"
- "What should my confidence threshold be?"
- "Explain how page turning works"

**Your assistant knows:**
- Armenian liturgy
- Church setup
- Audio equipment
- Troubleshooting
- Everything about this system

**Best part:** All conversations stay on your computer. Private and offline.

---

## 📡 Network Setup (Optional)

### If You Want Remote Display:

**Scenario:** Control from laptop, display on TV across the room

**Setup:**
1. Connect laptop and display device to same WiFi
2. Find laptop's IP address:
   - Windows: `ipconfig` → IPv4 Address
   - Mac: System Preferences → Network → IP Address
   - Linux: `hostname -I`
3. On display device, open: `http://[laptop-ip]:5000/display`
4. Press F11 for fullscreen

**Example:**
- Laptop IP: `192.168.1.100`
- Display URL: `http://192.168.1.100:5000/display`

**Troubleshooting:**
- Can't connect? Check firewall
- Windows: Allow port 5000 in firewall settings
- Mac: System Preferences → Security → Firewall → Allow connections

---

## 🎤 First Service Test

### Before Service (5 minutes):

**1. Start the app:**
```bash
docker compose up
# or
npm run dev
```

**2. Open three browser tabs:**
- Tab 1: http://localhost:5000/live (your control)
- Tab 2: http://localhost:5000/display (on TV - fullscreen)
- Tab 3: http://localhost:5000/chat (for help if needed)

**3. Test microphone:**
- In Live Mode, grant microphone permission
- Speak loudly
- Watch audio waveform (should show activity)

**4. Manual test:**
- Click "Next" button
- TV should advance to page 2
- Click "Prev" button
- TV should go back to page 1

✅ Ready for service!

---

### During Service:

**Automatic Mode:**
- Just let it run
- Pages will turn automatically
- Use manual controls if needed

**Manual Override:**
- "Next" / "Prev" buttons always work
- Use during singing or if auto-turn missed

**If Something Goes Wrong:**
- Switch to manual mode
- Use Next/Prev buttons only
- System will learn from your corrections

---

## 🎓 Training the System (Optional but Recommended)

### Upload Audio Recording:

**If you have a recording of your priest:**

1. Go to **Training** page
2. Click **"Upload Audio"**
3. Select your .wav or .mp3 file
4. Wait for processing (5-10 minutes)
5. System learns your priest's voice patterns

**What this does:**
- Creates audio fingerprints
- Learns your priest's voice
- Adapts to your church acoustics
- Improves accuracy significantly

**Without training:**
- System uses default Armenian patterns
- Will work but less accurately
- Will learn from live services over time

---

## 📊 Check Your Progress

### After Each Service:

**1. Go to Chat:**
```
http://localhost:5000/chat
```

**2. Ask:**
- "How accurate was I today?"
- "What pages did I miss?"
- "Show me improvement over time"
- "Any recommendations?"

**3. System learns:**
- Updates dictionary with new words
- Refines audio fingerprints
- Adjusts confidence thresholds
- Gets better automatically

---

## ⚙️ Optional Add-ons (Later)

### If You Want Telegram Control:

**When to add:**
- Multiple people need to control
- Want phone notifications
- Remote monitoring needed

**Setup time:** 30 minutes  
**Guide:** See `TELEGRAM_SETUP.md` (coming soon)

**Benefits:**
- Control from phone
- Get notifications
- Multiple users
- Remote testing

---

### If You Want WhatsApp Control:

**When to add:**
- Congregation uses WhatsApp
- Want familiar interface
- Group coordination

**Setup time:** 1 hour  
**Guide:** See `WHATSAPP_SETUP.md` (coming soon)

**Benefits:**
- Familiar interface
- Voice messages
- Media sharing
- Group chat

---

## 🔧 Common Questions

### Q: Do I need internet?
**A:** No! Works completely offline. Internet only needed for:
- Initial installation (downloading app)
- Optional updates
- Optional Telegram/WhatsApp (if you add them)

### Q: Do I need accounts or API keys?
**A:** No! Everything works out of the box. No sign-ups, no tokens, no complexity.

### Q: Where is my data stored?
**A:** Everything stays on your computer:
- Database: `data/liturgy-turner.db`
- PDFs: `client/public/uploads/pdfs/`
- Training: `training-data/`
- Chat history: In database

### Q: How do I backup?
**A:** Copy these folders:
```bash
cp -r data/ backups/data-$(date +%Y%m%d)/
cp -r training-data/ backups/training-$(date +%Y%m%d)/
```

Or just backup the entire `/app/project` folder.

### Q: Can multiple churches use this?
**A:** Yes! Each church installs their own copy. No shared data unless you choose to share anonymized training data with community.

### Q: What if I need help?
**A:** 
1. Ask the built-in AI assistant (Chat page)
2. Check documentation files
3. GitHub issues: https://github.com/lebahye/Liturgy-Turner-Rev2/issues

### Q: How do I update?
**A:**
```bash
cd /app/project
git pull origin main
npm install
npm run build
# Restart app
```

---

## ✨ Success Checklist

After setup, you should be able to:

- [ ] Open http://localhost:5000 and see the dashboard
- [ ] Upload a PDF successfully
- [ ] See display on TV (fullscreen)
- [ ] Control pages with Next/Prev buttons
- [ ] Display updates when you click buttons
- [ ] Chat with AI assistant
- [ ] Microphone shows audio waveform
- [ ] Manual page turns work perfectly

**If all checked: You're ready for church! 🎉**

---

## 🎯 Next Steps

### After First Service:
1. Chat with assistant about accuracy
2. Review which pages had issues
3. Consider uploading training audio
4. Let system learn and improve

### After 5 Services:
1. Check accuracy trends
2. Review self-improvement metrics
3. Fine-tune if needed
4. Share experience with community

### Long-term:
1. System gets smarter automatically
2. Accuracy improves to 90%+
3. Less manual intervention needed
4. Consider helping other churches

---

## 📞 Support

**Built-in Help:**
- Chat with AI assistant (knows everything)
- Check `TROUBLESHOOTING.md`
- Read `INSTALLATION_GUIDE.md`

**Community:**
- GitHub: https://github.com/lebahye/Liturgy-Turner-Rev2
- Issues: Report bugs or ask questions
- Discussions: Share tips with other churches

---

## 🎉 You're Ready!

**Remember:**
- Start simple (no external services needed)
- Use manual controls when needed
- System learns and improves automatically
- Add optional features later if wanted

**The goal:** Help worshippers focus on prayer, not page management.

**You've got this! 🙏📖**

---

*Last Updated: 2026-02-15*  
*Setup Time: ~20 minutes*  
*Accounts Required: ZERO*  
*Complexity: LOW*  
*Works Offline: YES ✅*
