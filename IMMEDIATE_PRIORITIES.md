# Immediate Priorities - Next 2 Weeks

**Goal:** Get the liturgy bot to 90% accuracy and production-ready  
**Created:** 2026-02-20  
**Target Completion:** 2026-03-06

---

## 🎯 Critical Path

### Week 1: Build Missing Tools

#### 1. Audio Quality Validator (Priority: HIGH)
**Owner:** You  
**Status:** Not started  
**Estimate:** 4-6 hours  

**What to build:**
Add to `liturgy-audio-controller` skill:
```javascript
// New tool
tool: "validate_audio_quality"
input: { audioFile: "path/to/recording.wav" }
output: {
  quality: "EXCELLENT" | "GOOD" | "POOR" | "UNUSABLE",
  snr: 42.5,              // Signal-to-noise ratio (dB)
  clippingDetected: false, // Audio clipping check
  silencePeriods: 3,       // Number of extended silence gaps
  duration: 83.5,          // Minutes
  sampleRate: 44100,
  bitDepth: 16,
  channels: 2,
  recommendation: "Proceed with training" | "Re-record recommended",
  issues: ["Background noise detected at 15:23", "Clipping at 42:17"]
}
```

**Implementation notes:**
- Use `ffmpeg` for audio analysis (already available)
- Check SNR (target: >25dB)
- Detect clipping (bad recording levels)
- Find silence gaps (recording stopped?)
- Validate duration (60-90 min typical)

**Test with:**
- `full_service.wav` (should pass)
- Intentionally bad audio (should fail)

---

#### 2. Enhanced Confidence Scoring (Priority: HIGH)
**Owner:** You  
**Status:** Not started  
**Estimate:** 6-8 hours  

**What to add to `LiturgyAudioController`:**

```javascript
// In processAudio method, enhance confidence calculation:

evaluateConfidence(detectedPage, fuzzyScore, currentPage) {
  let confidence = fuzzyScore;
  
  // Sequential boost
  if (detectedPage === currentPage + 1) {
    confidence = Math.min(1.0, confidence + 0.10); // +10% if next page
  } else if (detectedPage === currentPage + 2) {
    confidence = Math.min(1.0, confidence + 0.05); // +5% if page after next
  }
  
  // Impossible jump penalty
  const pageGap = Math.abs(detectedPage - currentPage);
  if (pageGap > 5) {
    confidence = confidence * 0.3; // Massive penalty for jumps
  }
  
  // Backwards penalty (pages don't go backwards)
  if (detectedPage < currentPage) {
    confidence = confidence * 0.1;
  }
  
  return {
    confidence,
    reason: this.explainConfidence(detectedPage, currentPage, fuzzyScore)
  };
}

explainConfidence(detectedPage, currentPage, rawScore) {
  // Return human-readable explanation
  if (detectedPage === currentPage + 1) {
    return `High confidence: Sequential match (${rawScore.toFixed(2)} base + 0.10 sequential bonus)`;
  }
  // ... other cases
}
```

**Test scenarios:**
- Page 5 → 6 (sequential, should boost confidence)
- Page 5 → 7 (close, small boost)
- Page 5 → 50 (impossible jump, should reject)
- Page 10 → 8 (backwards, should reject)

---

#### 3. Validation Scripts (Priority: MEDIUM)
**Owner:** You  
**Status:** Not started  
**Estimate:** 3-4 hours  

**Create these npm scripts:**

**`scripts/validate-dictionary.js`**
```javascript
// Checks liturgy-database.json
// - How many pages have entries?
// - Are there keyword conflicts?
// - Coverage gaps?
// Output: report of missing/weak pages
```

**`scripts/test-full-service.js`**
```javascript
// Simulates a full service
// Input: audio file + ground truth timestamps
// Output: accuracy report, false positives, latency
// This is your automated accuracy test
```

**Add to package.json:**
```json
"scripts": {
  "validate-dictionary": "node scripts/validate-dictionary.js",
  "test-service": "node scripts/test-full-service.js --audio full_service.wav --ground-truth ground-truth.json",
  "analyze-accuracy": "node scripts/analyze-accuracy.js"
}
```

**Ground truth format:**
```json
{
  "audioFile": "full_service.wav",
  "pageTurns": [
    {"page": 1, "timestampMs": 0, "trigger": "Opening prayer"},
    {"page": 2, "timestampMs": 45000, "trigger": "Տէր ողորմեա"},
    {"page": 3, "timestampMs": 120000, "trigger": "Gospel reading"}
  ]
}
```

---

#### 4. Metrics Dashboard (Priority: MEDIUM)
**Owner:** You  
**Status:** Not started  
**Estimate:** 6-8 hours  

**New React page: `/metrics`**

**What to show:**
```
┌─────────────────────────────────────────┐
│        Liturgy Turner Metrics           │
├─────────────────────────────────────────┤
│  Overall Accuracy: 87%                  │
│  Services Tracked: 5                    │
│  Total Pages Turned: 915                │
│  False Positives: 12 (1.3%)            │
├─────────────────────────────────────────┤
│  [Accuracy Chart Over Time]             │
│   Service 1: 72% ████████               │
│   Service 2: 81% █████████              │
│   Service 3: 85% █████████▌             │
│   Service 4: 89% █████████▊             │
│   Service 5: 87% █████████▋             │
├─────────────────────────────────────────┤
│  Problem Pages (most failures):         │
│   Page 23: 5 failures                   │
│   Page 45: 4 failures                   │
│   Page 63: 3 failures                   │
├─────────────────────────────────────────┤
│  Dictionary Status:                     │
│   Total entries: 3,755                  │
│   Armenian words: 230                   │
│   Phonetic variants: 3,525              │
│   Coverage: 47/50 pages (94%)          │
└─────────────────────────────────────────┘
```

**Data source:**
Query existing database tables:
- `training_sessions`
- `page_transitions`
- `corrections`

---

### Week 2: Testing & Documentation

#### 5. Ground Truth Data Collection (Priority: CRITICAL)
**Owner:** You + Church  
**Status:** Not started  
**Estimate:** 2-3 hours per recording  

**What you need:**
- Record a full service
- Manually note when each page should turn
- Create ground truth JSON file
- Use this to test automated system

**Process:**
1. Record service with good audio
2. Play back recording, note timestamps:
   - "At 2:15, page should turn to page 5"
   - "At 3:47, page should turn to page 6"
3. Create `ground-truth.json`
4. Run `npm run test-service` to measure accuracy

**Target:** At least 2 full service recordings with ground truth.

---

#### 6. Live Service Testing (Priority: CRITICAL)
**Owner:** You + Church  
**Status:** Scheduled?  
**Estimate:** 90 minutes (during service)  

**Setup:**
- Display: TV showing `/display`
- Control: Laptop with `/live`
- Microphone: Positioned near priest
- Operator: Someone monitoring with manual controls

**What to track:**
- Which pages turned correctly
- Which pages were missed
- Any false positives
- Operator interventions needed
- Audio quality issues
- Latency observations

**After service:**
- Download logs
- Calculate accuracy
- Identify failure patterns
- Update training data

---

#### 7. Documentation Updates (Priority: LOW)
**Owner:** You  
**Status:** Ongoing  
**Estimate:** 2-3 hours  

**Update these docs based on learnings:**
- `INSTALLATION_GUIDE.md` - Any new steps discovered
- `TROUBLESHOOTING.md` - New issues encountered
- `TESTING_GUIDE.md` - Refined testing procedures
- `CONTINUOUS_LEARNING.md` - Actual learning outcomes

---

## 📊 Success Metrics

### By End of Week 1
- [ ] Audio quality validator working
- [ ] Enhanced confidence scoring implemented
- [ ] Validation scripts functional
- [ ] Metrics dashboard deployed

### By End of Week 2
- [ ] 2+ ground truth recordings created
- [ ] Full service simulation tests passing
- [ ] Live service test completed
- [ ] Accuracy measured (target: 85%+)
- [ ] Known issues documented
- [ ] Improvement plan drafted

---

## 🚧 Blockers & Dependencies

### Known Blockers
- **Ground truth data:** Need church access to record/annotate
- **Live testing:** Need to schedule with church
- **Audio equipment:** Need good microphone setup

### Dependencies
- Clawdbot agent must be running (for audio processing)
- Docker setup must be working
- Database migrations must be applied

---

## 🎯 Daily Standup Questions

Ask yourself each day:
1. What did I complete yesterday?
2. What am I working on today?
3. Any blockers?
4. Am I on track for the 2-week goal?

---

## 📝 Decision Log

**2026-02-20:**
- ✅ Decided to defer SAAS features until after production validation
- ✅ Prioritized audio quality validation and confidence scoring
- ✅ Committed to 2-week sprint for core improvements

---

## 🔄 Weekly Review

**End of Week 1 (2026-02-27):**
- Review progress on tools
- Adjust priorities if needed
- Plan Week 2 testing

**End of Week 2 (2026-03-06):**
- Review live test results
- Calculate actual accuracy
- Decide: Ready for production or need another iteration?

---

## 💡 Notes

- **Don't let perfect be the enemy of good** - Get something working, then iterate
- **Test with real data** - Simulations only get you so far
- **Document as you go** - Future you will thank you
- **Ask for help** - The liturgy bot can assist with implementation details

---

**Focus:** Build the tools. Test with real data. Get to 90%. Everything else can wait.
