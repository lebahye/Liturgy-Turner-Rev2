# Installation Guide - Liturgy Turner

## 🏗️ For Future Church Installations

This guide helps you install and set up the Armenian Liturgy Turner at your church. Written based on real-world experience and lessons learned.

---

## 📋 Prerequisites

### Required Equipment:
1. **Laptop/Desktop Computer**
   - Windows 10/11, macOS 10.15+, or Linux (Ubuntu 20.04+)
   - 8GB RAM minimum (16GB recommended)
   - 50GB free disk space
   - WiFi or Ethernet connection (optional - for remote display)

2. **TV/Projector for Display**
   - Any TV with HDMI input
   - Or projector visible to congregation
   - Connected to same network as control laptop

3. **Microphone**
   - USB microphone (recommended: Blue Yeti or similar)
   - Or laptop's built-in microphone (test first)
   - Should be able to hear priest clearly

4. **Optional: Remote Display Device**
   - Tablet or second laptop for controlling
   - Connected to same WiFi network

---

## 🚀 Installation Steps

### Option 1: Docker (Recommended)

**Prerequisites:**
- Docker Desktop installed
- 2GB download bandwidth

**Steps:**
```bash
# 1. Clone repository
git clone https://github.com/lebahye/Liturgy-Turner-Rev2.git
cd Liturgy-Turner-Rev2

# 2. Start the application
docker compose up

# 3. Open browser
# Go to: http://localhost:5000
```

**First time:** Takes 2-5 minutes to download and start

**Note:** No external accounts needed! System works completely offline.

---

### Option 2: Local Development

**Prerequisites:**
- Node.js v18+ installed
- Git installed

**Steps:**
```bash
# 1. Clone repository
git clone https://github.com/lebahye/Liturgy-Turner-Rev2.git
cd Liturgy-Turner-Rev2

# 2. Install dependencies
npm install

# 3. Build the app
npm run build

# 4. Start the server
npm start

# 5. Open browser
# Go to: http://localhost:5000
```

---

## 🎯 First-Time Setup

### Step 1: Upload Your Liturgy PDF

1. Open http://localhost:5000
2. Go to **Training** page
3. Click "Upload PDF"
4. Select your Armenian liturgy PDF
5. Wait for upload to complete

**Tips:**
- Use a high-quality scan
- Armenian text should be clear
- 50 pages is typical for Divine Liturgy

### Step 2: Upload Training Audio (Optional but Recommended)

If you have a recording of your priest doing the liturgy:

1. Go to **Training** page
2. Click "Upload Audio"
3. Select .wav or .mp3 file
4. Wait for processing

**Audio Guidelines:**
- Clear recording of priest's voice
- Minimal background noise
- Covers full liturgy (or major sections)
- .wav format preferred (better quality)

### Step 3: Configure Display

1. Open **Display** in a new browser tab
2. Press F11 for fullscreen
3. Position window on TV/projector
4. This is what congregation sees

### Step 4: Test Live Mode

1. Open **Live Mode** on control laptop
2. Select your PDF from dropdown
3. Click "Start Live Mode"
4. Grant microphone permissions when prompted
5. Speak a prayer phrase loudly
6. Watch if page turns (may need training first)

---

## 🎤 Microphone Setup

### Positioning
**Optimal setup:**
```
[Altar] --- 6-10 feet --- [Microphone] --- [Laptop]
```

**Guidelines:**
- Place mic 6-10 feet from priest
- Away from congregation noise
- Not directly in front of priest (avoid plosives)
- Elevated 3-4 feet off ground
- Point toward altar area

**Test Setup:**
1. Open Live Mode
2. Watch audio waveform visualization
3. Priest should speak a prayer
4. Waveform should show clear activity
5. Adjust position if too quiet or too loud

---

## 🏛️ Church Acoustic Considerations

### Room Types

**Small Church (<100 people):**
- Mic closer to priest (6 feet)
- Lower confidence threshold (0.75)
- Faster response

**Medium Church (100-300 people):**
- Mic 8-10 feet from priest
- Standard threshold (0.85)
- Balance accuracy vs speed

**Large Cathedral (300+ people):**
- Multiple mics if possible
- Higher threshold (0.90)
- May need acoustic panels to reduce echo

### Common Issues

**Too much echo:**
- Move mic closer
- Add acoustic dampening (curtains, carpet)
- Increase confidence threshold

**Background noise:**
- Position mic away from doors, HVAC
- Use directional microphone
- Enable noise reduction in settings

**Congregation singing drowns out priest:**
- This is expected, manual override available
- Consider wireless lapel mic for priest
- Adjust sensitivity during congregational parts

---

## 📡 Network Setup

### Same Network Requirement
**Control laptop** and **Display device** must be on same WiFi/network.

**Setup:**
1. Connect both devices to church WiFi
2. Note the laptop's IP address:
   - Windows: `ipconfig` → IPv4 Address
   - Mac/Linux: `ifconfig` → inet
3. On display device, open: `http://[laptop-ip]:5000/display`

**Example:**
- Laptop IP: `192.168.1.50`
- Display opens: `http://192.168.1.50:5000/display`

### Firewall Issues

If display can't connect:

**Windows:**
```powershell
# Allow port 5000 in firewall
netsh advfirewall firewall add rule name="Liturgy Turner" dir=in action=allow protocol=TCP localport=5000
```

**macOS:**
```bash
# System Preferences → Security & Privacy → Firewall
# Allow incoming connections for Node.js
```

---

## 🎓 Training the System

### First-Time Training (Recommended)

**What you need:**
- Recording of your priest doing the liturgy
- 30-60 minutes of time
- The liturgy PDF uploaded

**Process:**
1. Upload audio recording (Training page)
2. System automatically analyzes audio
3. Creates fingerprints for each page
4. Builds phonetic dictionary
5. Ready to use in Live Mode

**Without Training:**
- System uses default Armenian patterns
- May work but less accurate
- Will learn from live services over time

### Learning from Live Services

Every service improves accuracy:
1. System records what pages turned when
2. Learns priest's voice patterns
3. Adapts to your church's acoustics
4. Updates confidence thresholds

**Tip:** First 3-5 services are learning period. Use manual controls when needed.

---

## 🎯 Live Service Usage

### Before Service (5 minutes)

1. **Start the app:**
   ```bash
   docker compose up
   # or
   npm start
   ```

2. **Open Display on TV:**
   - Browser: `http://localhost:5000/display`
   - Press F11 for fullscreen
   - Verify page 1 shows

3. **Open Live Mode on laptop:**
   - Browser: `http://localhost:5000/live`
   - Select PDF
   - Click "Start Live Mode"
   - Verify microphone is working

4. **Test manually:**
   - Click "Next" button
   - Display should advance
   - Click "Prev" to go back

### During Service

**Automatic Mode:**
- System listens to priest
- Pages turn automatically
- Watch confidence scores
- Use manual controls if needed

**Manual Override:**
- "Next" / "Prev" buttons always work
- Use during congregational singing
- Use if auto-turn missed

**Monitor Dashboard:**
- Current page number
- Confidence score (0-100%)
- Audio level indicator
- Recent turn history

### After Service

1. **Stop tracking:**
   - Click "Stop Live Mode"
   
2. **Review performance:**
   - Go to Chat page
   - Ask: "How did today's service go?"
   - Review accuracy statistics

3. **Shut down:**
   ```bash
   # Press Ctrl+C in terminal
   # Or close Docker Desktop
   ```

---

## 🔧 Troubleshooting

### Pages Don't Turn

**Check:**
1. Is microphone working? (See waveform in Live Mode)
2. Is priest loud enough? (Adjust mic position)
3. Is training data loaded? (Check Training page)
4. Is confidence threshold too high? (Lower in settings)

**Quick Fix:**
- Use manual Next/Prev buttons
- System will learn from your manual corrections

### Display Not Syncing

**Check:**
1. Both devices on same WiFi?
2. Firewall blocking port 5000?
3. Refresh display page (F5)

**Quick Fix:**
- Open display page again
- Use laptop IP address instead of localhost

### Microphone Not Detected

**Check:**
1. Is mic plugged in?
2. Did browser ask for permission?
3. Is correct mic selected in browser settings?

**Fix:**
1. Browser Settings → Privacy → Microphone
2. Allow access for this site
3. Refresh page and try again

### False Positives (Wrong Page Turns)

**Causes:**
- Background noise (door closing, coughing)
- Similar prayers on multiple pages
- Confidence threshold too low

**Fix:**
- Increase confidence threshold in settings
- Improve mic positioning
- Let system learn (it will improve)

---

## 📊 Monitoring & Improvement

### Check Accuracy

After each service:
1. Go to `/chat` page
2. Ask bot: "Show me today's accuracy"
3. Review which pages had issues
4. Bot will suggest improvements

### Self-Testing

Automated tests run nightly:
```bash
npm run self-test
```

Check reports in `/reports` folder

### Manual Testing

Test with recording:
```bash
npm run test-audio /path/to/recording.wav
```

Compare results with expected page turns

---

## 🎁 For Future Installations

### Pre-configured Settings

This installation includes:
- ✅ Trained on 50-page Divine Liturgy
- ✅ Armenian phonetic dictionary (5000+ words)
- ✅ Audio fingerprints for common prayers
- ✅ Optimized confidence thresholds
- ✅ Tested in real church conditions

### What to Customize:

1. **Upload your PDF** (if different liturgy)
2. **Record training audio** (priest's voice)
3. **Adjust mic position** (your acoustics)
4. **Fine-tune thresholds** (your preference)

### Community Improvements

This system learns from every installation:
- Share your training data (anonymously)
- Report accuracy improvements
- Contribute to Armenian dictionary
- Help other churches succeed

---

## 📞 Support

### Getting Help

1. **Chat Interface:** Ask the bot questions
2. **Documentation:** Check `/docs` folder
3. **GitHub Issues:** Report bugs
4. **Community:** Discord/forums (coming soon)

### Reporting Issues

Include:
- What happened vs what you expected
- Screenshots if relevant
- Log files from `/reports`
- Church setup details (size, acoustics)

---

## ✅ Installation Checklist

- [ ] Docker/Node.js installed
- [ ] App cloned and running
- [ ] PDF uploaded
- [ ] Display shows on TV
- [ ] Microphone working
- [ ] Network connectivity verified
- [ ] Manual controls tested
- [ ] Training audio uploaded (optional)
- [ ] First test service scheduled

---

## 🎉 You're Ready!

The system is designed to help, not replace human judgment. Use manual controls whenever needed. The system will learn and improve with each service.

**Remember:** First few services are learning period. Be patient, provide feedback, and watch accuracy improve!

---

*Last Updated: 2026-02-15*
*Based on: Real church installation experience*
*Status: Tested and verified*
