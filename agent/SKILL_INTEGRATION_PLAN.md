# Armenian Learner Skill - Integration Plan

## 🏗️ Where It Lives

```
/app/agent/skills/armenian-learner/
├── SKILL.md                      # Documentation
├── index.js                      # Clawdbot skill entry point
├── package.json
├── lib/
│   ├── audio-phoneme-extractor.js    # Extract sound patterns
│   ├── text-word-parser.js           # Parse Armenian text
│   ├── alignment-engine.js           # Connect audio ↔ text
│   ├── pattern-database.js           # Store learned patterns
│   └── live-recognizer.js            # Real-time recognition
├── data/
│   ├── learned-patterns.json     # The "brain" - grows over time
│   ├── training-progress.json    # Progress tracking
│   └── accuracy-history.json     # Self-test results
└── api/
    └── http-bridge.js            # Express routes for frontend
```

## 🔌 How It Connects to Your App

### 1. Backend Integration (Express Routes)

**New file:** `/app/server/routes/armenian-learner.ts`

```typescript
// Add to server/index.ts
import armenianLearnerRoutes from './routes/armenian-learner';
app.use('/api/armenian-learner', armenianLearnerRoutes);
```

**Routes provided:**
```
GET  /api/armenian-learner/status
  → Returns: learning progress, words learned, accuracy

POST /api/armenian-learner/start-training
  → Input: { audioFile, pdfFile, timestamps }
  → Starts learning process
  → Returns: training job ID

GET  /api/armenian-learner/training-progress/:jobId
  → Returns: % complete, words processed, ETA

POST /api/armenian-learner/start-live-recognition
  → Starts listening to audio and predicting pages
  → Returns: recognition session ID

GET  /api/armenian-learner/recognition-status
  → Returns: current page prediction, confidence, state

POST /api/armenian-learner/stop
  → Stops training or recognition
```

### 2. Frontend Integration (React UI)

**Option A: New Page** (Recommended)

Add new route: `/armenian-learner`

**File:** `/app/client/src/pages/ArmenianLearner.tsx`

**What it shows:**
```
┌─────────────────────────────────────────┐
│  Armenian Learner - Training            │
├─────────────────────────────────────────┤
│                                         │
│  📚 Learning Progress                   │
│  ━━━━━━━━━━━━━━━━━━━━━━ 67%          │
│                                         │
│  Words Learned: 1,245 / ~2,000         │
│  Patterns Stored: 3,847                │
│  Current Accuracy: 78.3%               │
│  Training Time: 2h 15m                 │
│                                         │
│  [Start Training] [Stop] [Test]        │
│                                         │
│  📊 Recent Activity                     │
│  • Processing page 42...               │
│  • Learned "Աստուած" (confidence 0.92)│
│  • Aligned 15 words from page 43       │
│                                         │
│  ✅ Status: Training active            │
└─────────────────────────────────────────┘
```

**Option B: Add to Training Page**

Enhance existing `/training` page with new tab:

```
[Manual Training] [Auto Training] [Armenian Learner] ← NEW
```

### 3. How You Access It

**From the main app:**

1. Navigate to http://localhost:5000/armenian-learner
   OR
2. Click "Armenian Learner" in the sidebar
   OR  
3. Use existing Training page → "Armenian Learner" tab

### 4. How You Know It's Working

**Visual Indicators:**

#### During Training:
```
🟢 Status: Learning in progress
📊 Progress: 1,245 / ~2,000 words (62%)
⏱️  Time: 2h 15m elapsed, ~1h 30m remaining
📝 Current: Processing page 42
🧠 Brain: 3,847 patterns stored
```

#### When Idle:
```
🔵 Status: Ready
📚 Words Known: 1,245
🎯 Accuracy: 78.3% (last test)
⏰ Last Training: 2 hours ago
```

#### During Live Recognition:
```
🟢 Status: Listening
📄 Predicted Page: 15
💪 Confidence: 87%
🎵 Hearing: "Սուրբ Աստուած..."
```

**Console Logs:**
```bash
[armenian-learner] Training started
[armenian-learner] Processing audio segment 0:00-0:05
[armenian-learner] Extracted phoneme: "ah-s-too-ats"
[armenian-learner] Aligned to word: Աստուած (page 8)
[armenian-learner] Pattern stored with confidence 0.89
[armenian-learner] Progress: 245/2000 words (12%)
```

**Database Updates:**

You can query the learning progress:
```bash
# Check learned words count
curl http://localhost:5000/api/armenian-learner/status

# Response:
{
  "status": "training",
  "wordsLearned": 1245,
  "patternsStored": 3847,
  "accuracy": 0.783,
  "trainingTime": "2h 15m",
  "progress": 0.62,
  "currentActivity": "Processing page 42"
}
```

## 🧪 How to Test It Works

### Test 1: Installation Check
```bash
# In project root
cd /app/agent/skills/armenian-learner
npm install
npm test

# Should output:
# ✓ Audio extractor loads
# ✓ Text parser loads
# ✓ Alignment engine loads
# ✓ Pattern database initialized
```

### Test 2: Backend Connection
```bash
# Start the app
npm run dev:lan

# Test the API
curl http://localhost:5000/api/armenian-learner/status

# Should return JSON with status
```

### Test 3: Start Training (Small Test)
```bash
# Via API
curl -X POST http://localhost:5000/api/armenian-learner/start-training \
  -H "Content-Type: application/json" \
  -d '{
    "audioFile": "/app/agent/full_service.wav",
    "testMode": true,
    "maxPages": 10
  }'

# Watch console logs for activity
# Check status endpoint for progress
```

### Test 4: Frontend UI
```
1. Open http://localhost:5000/armenian-learner
2. Click "Start Training"
3. Watch progress bar fill up
4. See words learned count increase
5. Check console for logs
```

### Test 5: Verify Learning
```bash
# After training completes
curl http://localhost:5000/api/armenian-learner/status

# Should show:
# - wordsLearned > 0
# - patternsStored > 0
# - accuracy > 0

# Check data file
cat /app/agent/skills/armenian-learner/data/learned-patterns.json
# Should contain entries
```

## 🎯 Success Criteria

**You know it's working when:**

✅ Status endpoint returns valid data  
✅ Training progress increases over time  
✅ Console logs show phoneme extraction  
✅ Pattern database file grows  
✅ Frontend shows real-time progress  
✅ Words learned count increases  
✅ Accuracy improves with more data  

**You know it's NOT working when:**

❌ Status endpoint returns error  
❌ Progress stuck at 0%  
❌ No console logs appear  
❌ Pattern file stays empty  
❌ Frontend shows "disconnected"  
❌ Errors in browser console  

## 📊 Monitoring Dashboard (Bonus)

**File:** `/app/client/src/pages/ArmenianLearnerDashboard.tsx`

```
┌─────────────────────────────────────────┐
│  Armenian Learner Dashboard             │
├─────────────────────────────────────────┤
│                                         │
│  📈 Learning Progress                   │
│  [Chart: Words learned over time]      │
│                                         │
│  🎯 Accuracy Trend                      │
│  [Chart: Accuracy improvements]        │
│                                         │
│  🧠 Top Learned Words                   │
│  1. Աստուած (92% confidence, 47x)    │
│  2. Սուրբ (89% confidence, 38x)       │
│  3. Տէր (87% confidence, 42x)         │
│                                         │
│  ⚠️ Problem Words (Low Confidence)      │
│  1. անսկիզբն (42% confidence)         │
│  2. գերապանծ (38% confidence)         │
│                                         │
└─────────────────────────────────────────┘
```

## 🔗 Integration Checklist

Before building:
- [x] Location decided: /app/agent/skills/armenian-learner/
- [ ] Backend routes planned: /api/armenian-learner/*
- [ ] Frontend page designed: /armenian-learner
- [ ] Status indicators defined
- [ ] Test procedures written
- [ ] Success criteria clear

After building:
- [ ] Backend routes working
- [ ] Frontend page accessible
- [ ] Training starts successfully
- [ ] Progress visible in UI
- [ ] Status endpoint returns data
- [ ] Console logs show activity
- [ ] Pattern file grows
- [ ] Accuracy measurable

## 🚀 Build Order

1. **Skill Core** (2-3 hours)
   - Basic structure
   - Stub functions
   - Pattern database

2. **Backend API** (1 hour)
   - Express routes
   - Status endpoint
   - Training control

3. **Frontend UI** (1-2 hours)
   - New page component
   - Progress indicators
   - Control buttons

4. **Integration** (1 hour)
   - Connect frontend ↔ backend
   - Test end-to-end
   - Fix issues

5. **Testing** (1 hour)
   - Verify all indicators work
   - Check data persistence
   - Validate accuracy

**Total: 6-8 hours**

---

**Ready to build with this integration plan?**
