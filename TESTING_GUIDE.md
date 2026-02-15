# Testing Guide - Local Chat & Live Page Turning

## Quick Start Testing

### Option 1: Docker (Recommended)
```bash
cd /app/project
docker compose up
```

### Option 2: Local Development
```bash
cd /app/project
npm run dev
```

App will be available at: **http://localhost:5000**

---

## Test 1: Local Chat Interface

### Steps:
1. Navigate to: **http://localhost:5000/chat**
2. You should see:
   - Sidebar with "New Chat" button
   - Empty chat area with instructions
   - Message input box at bottom

3. **Test basic message:**
   - Type: "Hello, are you ready for church?"
   - Press Enter (or click Send)
   - Wait for bot response (~2-5 seconds)

4. **Test multiple conversations:**
   - Click "New Chat" button
   - Type another message
   - Switch between conversations in sidebar

### Expected Behavior:
- ✅ Messages appear immediately after sending
- ✅ Bot responses appear within 5 seconds
- ✅ Messages persist when switching conversations
- ✅ Timestamps show on each message
- ✅ User messages on right (blue), bot messages on left (gray)

### Troubleshooting:
- **Bot not responding?** 
  - Check if Clawdbot agent is running (should be in docker-compose)
  - Check logs: `docker compose logs agent`

- **"Sorry, I am currently unavailable"**
  - Agent might be starting up, wait 10 seconds and try again

---

## Test 2: Page Turning in Live Church

### Pre-Test Setup:
1. Navigate to: **http://localhost:5000/training**
2. Verify you have:
   - PDF uploaded (liturgy.pdf)
   - Audio training data
   - Fingerprints generated

### Live Test Steps:

#### A. Start Display (TV/Projector)
1. On the church TV/projector computer, open: **http://localhost:5000/display**
2. Should show page 1 of liturgy PDF
3. **Leave this window open full-screen**

#### B. Start Live Mode (Operator)
1. On your control device, navigate to: **http://localhost:5000/live**
2. Click "Start Live Mode"
3. Select your PDF from dropdown
4. Click "Begin Tracking"
5. Status should show: "🎤 Listening..."

#### C. Test During Church Service
1. **Manual verification first:**
   - When you know a page should turn, watch the display
   - Check if it turns automatically
   - Note the page number and time

2. **Monitor the dashboard:**
   - Watch confidence scores
   - Note any missed turns
   - Check false positives (turns that shouldn't happen)

3. **Emergency controls:**
   - Use Next/Prev buttons if auto-turn fails
   - These are backup manual controls

#### D. Post-Service Review
1. Go to: **http://localhost:5000/chat**
2. Ask the bot: "How did the page turning perform today?"
3. Ask: "Show me the log from today's service"
4. Review accuracy and timing

---

## Test 3: Audio Fingerprinting Accuracy

### During Service:
1. Note **3-5 specific moments** where pages should turn:
   - Example: "After 'Der Voghormya' on page 12"
   - Write down exact phrase and page number

### After Service:
1. Go to training data: `/app/project/training-data/`
2. Look for today's log files
3. Compare your notes with automated turns

### Success Criteria:
- ✅ 90%+ accuracy on page turns
- ✅ Less than 2 second latency
- ✅ No false positives during long prayers
- ✅ Handles speaker changes (priest vs. deacon)

---

## Test 4: Chat Commands

Try these commands in the chat:

```
"What page are we on?"
"Go to page 15"
"Next page"
"Previous page"
"Show me today's training data"
"How many pages in the liturgy?"
"What's the current confidence score?"
```

---

## Common Issues & Fixes

### Issue: Pages turn too early
**Fix:** Adjust fingerprint matching threshold
- Edit: `server/liturgy-tracker.ts`
- Increase `CONFIDENCE_THRESHOLD` value

### Issue: Pages don't turn at all
**Possible causes:**
1. Microphone not receiving audio
2. Audio quality too low
3. Background noise too high
4. Fingerprints not trained properly

**Debug steps:**
1. Check mic in browser: Settings → Privacy → Microphone
2. Test audio in `/live` mode - watch the waveform
3. Re-run training with clearer audio

### Issue: Bot doesn't respond in chat
1. Check agent is running: `docker compose ps`
2. Restart agent: `docker compose restart agent`
3. Check agent logs: `docker compose logs -f agent`

### Issue: Display not syncing
1. Refresh the display page: `http://localhost:5000/display`
2. Check network connection between devices
3. Verify they're on same WiFi/network

---

## Data Collection for Improvement

### What to Log:
1. **Successful page turns:**
   - Timestamp
   - Page number
   - Confidence score
   - What was being said

2. **Failed turns (should have turned but didn't):**
   - Expected page
   - Actual page
   - Audio snippet (if possible)

3. **False positives (turned when shouldn't):**
   - Page it jumped to
   - What caused the trigger

### How to Report:
Use the chat interface:
```
"Log: Page 8 to 9 turned perfectly at 'Der Voghormya', confidence 0.95"
"Error: Page 15 didn't turn, should have turned at 'Sourp Sourp'"
```

---

## Emergency Procedures

### If Page Turning Goes Wrong Mid-Service:
1. **Switch to Manual Mode:**
   - On `/live` page, click "Stop Tracking"
   - Use Next/Prev buttons to control manually

2. **If Display Freezes:**
   - Refresh the display window (F5)
   - It will reconnect automatically

3. **Complete Failure:**
   - Have a backup device with PDF open
   - Switch display input to backup
   - Take notes for post-service debugging

---

## Success Checklist

After testing, you should be able to answer YES to:

- [ ] Can send messages and get responses in chat
- [ ] Chat messages persist and load correctly
- [ ] Can create multiple conversations
- [ ] Display shows liturgy PDF correctly
- [ ] Live mode connects and starts listening
- [ ] Pages turn automatically during service (90%+ accuracy)
- [ ] Manual controls work as backup
- [ ] Can review performance logs after service
- [ ] System handles network hiccups gracefully
- [ ] Bot responds to commands in chat

---

## Next Steps After Successful Test

1. **Fine-tune thresholds** based on real church acoustics
2. **Train with more recordings** to improve accuracy
3. **Add custom commands** for common liturgy moments
4. **Set up automated backups** of training data
5. **Document specific church setup** (mic placement, etc.)

---

## Questions to Ask the Bot After Testing

```
"What did you learn from today's test?"
"What can we improve for next time?"
"Show me the accuracy statistics"
"Were there any patterns in the failures?"
"What's the best mic placement based on today's data?"
```

---

**Remember:** First live test is about data collection. 
Don't expect perfection - expect to learn! 📊🙏
