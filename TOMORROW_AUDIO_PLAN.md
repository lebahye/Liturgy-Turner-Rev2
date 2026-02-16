# Tomorrow: New Audio Processing Plan

## 🎯 When You Provide New Audio

**Date Planned:** 2026-02-16  
**Goal:** Expand dictionary and improve accuracy

---

## 📥 What I Need From You

### Audio File(s)
- **Format:** .wav (preferred) or .mp3
- **Quality:** Best available (clear priest voice)
- **Duration:** Full service or major portions
- **Content:** Same liturgy as existing training

### Optional: Timestamps
If you can provide rough timestamps of page turns, even better!

**Format:**
```json
{
  "page": 2,
  "timestamp_ms": 45000,
  "what_was_said": "Տէր ողորմեա"
}
```

But not required - I can help you create this.

---

## 🔄 What I'll Do

### Step 1: Receive & Validate Audio
```bash
# You'll upload via:
# http://localhost:5000/training
# Or place in: client/public/uploads/audio/

# I'll validate:
- File format correct
- Audio quality acceptable
- Duration reasonable
- Sample rate good (44.1kHz or 48kHz)
```

### Step 2: Create Annotation Template
```bash
# If you don't have timestamps, I'll create template:
npm run create-annotation new_service.wav 50 annotations/service2.json

# This creates a JSON file with empty timestamps
# You can fill them in (or I can help analyze audio)
```

### Step 3: Extract Audio Features
```javascript
// I'll process the audio:
- Extract phonetic patterns
- Identify spoken words
- Match to existing dictionary
- Find NEW words not in dictionary
- Build audio fingerprints
- Create page signatures
```

### Step 4: Expand Dictionary
```javascript
// Before:
- Armenian → English: 230 words
- Phonetic: 3,525 entries
- Total: 3,755 words

// After (estimated):
- Armenian → English: 300-400 words (+70-170)
- Phonetic: 4,500-5,000 entries (+1,000-1,500)
- Total: 4,800-5,400 words (+1,000-1,600)

// Target:
- Total: 5,000+ words
- Validation score: 90+
```

### Step 5: Retrain Models
```javascript
// Update:
- Audio fingerprints for each page
- Confidence thresholds
- Sequential page prediction
- Page signatures
- Trigger phrase recognition
```

### Step 6: Validate Improvements
```bash
# Run validation:
npm run validate-dictionary

# Before: 83/200 (42%)
# Target After: 180+/200 (90%+)

# Check:
- Coverage improved?
- New words recognized?
- Phonetic accuracy better?
- Page signatures stronger?
```

### Step 7: Test Accuracy
```bash
# Run against all audio:
npm run self-test

# Measure:
- Exact page accuracy
- Within-2 pages accuracy
- False positives
- Average latency
- Confidence scores

# Target: 90%+ exact accuracy
```

---

## 📊 Expected Improvements

### Dictionary Growth
```
Current:    3,755 words (42% validation score)
After 1:    ~4,500 words (~65% score)
After 2:    ~5,000 words (~80% score)
After 3:    ~5,500 words (~90%+ score) ✅ TARGET
```

### Accuracy Improvements
```
Current:     59% (baseline from one recording)
After 1:     ~70-75% (two recordings)
After 2:     ~80-85% (three recordings)
After 3:     ~90%+ (comprehensive training) ✅ TARGET
```

---

## 🎯 Timeline

### Tomorrow Morning:
1. You provide audio file(s)
2. I validate and process
3. Create annotation template (if needed)

### Tomorrow Afternoon:
4. You mark timestamps (or I help)
5. I train on new audio
6. Dictionary expands
7. Validation scores improve

### Tomorrow Evening:
8. Run accuracy tests
9. Generate report
10. Document improvements
11. Commit to GitHub

---

## 📝 How to Provide Audio

### Option 1: Upload via Web UI (Easiest)
```
1. Go to: http://localhost:5000/training
2. Click "Upload Audio"
3. Select file
4. Wait for upload
5. I'll process it automatically
```

### Option 2: Copy Directly (Faster)
```bash
# Place file in uploads folder:
cp ~/path/to/new_service.wav /app/project/client/public/uploads/audio/

# Tell me the filename
# I'll process it
```

### Option 3: Share Location
```
Tell me where the file is:
"Audio is at: /Users/you/Documents/church_recording.wav"

I'll copy it to the right place
```

---

## 🧪 Testing Plan After Training

### Immediate Tests:
1. **Dictionary validation**
   ```bash
   npm run validate-dictionary
   # Should show improved score
   ```

2. **Word coverage**
   ```bash
   # Check if new words were added
   # Compare before/after dictionary sizes
   ```

3. **Audio matching**
   ```bash
   # Test if new audio patterns recognized
   # Validate page signatures
   ```

### Full Accuracy Test:
```bash
# Run against both recordings
npm run self-test -- --audio service1.wav
npm run self-test -- --audio service2.wav

# Compare results:
# - Accuracy on first recording (should maintain or improve)
# - Accuracy on second recording (should be good)
# - Overall accuracy (should be higher)
```

---

## 📈 Progress Tracking

### Metrics to Watch:

**Dictionary:**
- [ ] Total words > 4,500
- [ ] Validation score > 70%
- [ ] Common words identified
- [ ] Page coverage complete

**Accuracy:**
- [ ] Exact page turns > 75%
- [ ] Within-2 pages > 95%
- [ ] False positives < 5%
- [ ] Latency < 1.5s

**Coverage:**
- [ ] All 50 pages have signatures
- [ ] High-confidence pages > 40
- [ ] Unique triggers per page > 2
- [ ] Sequential model working

---

## 🎯 After Processing New Audio

### What You'll Get:

**1. Expanded Dictionary**
```
training-data/
├── armenian-phonetic-dict.json (UPDATED)
├── db-phonetic-dict.json (UPDATED)
├── fingerprints-v2.json (UPDATED)
└── page-signatures.json (UPDATED)
```

**2. Validation Report**
```
reports/
└── dictionary-validation-after-audio2.json
```

**3. Accuracy Results**
```
reports/
├── audio1-accuracy.json
├── audio2-accuracy.json
└── combined-accuracy.json
```

**4. Summary Document**
```
AUDIO_2_RESULTS.md
- What improved
- New words added
- Accuracy changes
- Next steps
```

---

## 🔄 If We Need More Audio

### After Second Recording:
If accuracy still < 90%, we'll need third recording:
- Different date/priest (if possible)
- Same liturgy
- Clear audio quality

### After Third Recording:
Should hit 90%+ target.

### Pattern:
```
1st recording: 59% → baseline
2nd recording: 75% → good progress
3rd recording: 90%+ → production ready ✅
```

---

## ✅ Success Criteria

### Tomorrow is Successful If:
- ✅ Audio processed without errors
- ✅ Dictionary grows by 500+ words
- ✅ Validation score improves by 20+ points
- ✅ Accuracy improves by 10-15%
- ✅ All 50 pages have better signatures
- ✅ No regressions (first audio still works)

---

## 📞 Communication Plan

### When You Upload:
1. Tell me: "Audio uploaded, filename is X"
2. I'll confirm: "Received, processing..."
3. I'll update: "Processing complete, results ready"
4. I'll share: "Dictionary expanded by X words"
5. I'll report: "Accuracy now at Y%"

### Questions I Might Ask:
- What's the audio filename?
- Do you have timestamps?
- Which pages were tricky?
- Any unusual sections in this recording?

---

## 🎉 Expected Outcome

### By Tomorrow Night:
- ✅ Second audio fully processed
- ✅ Dictionary 4,500+ words
- ✅ Validation score 70%+
- ✅ Accuracy 75%+
- ✅ All improvements committed to GitHub
- ✅ Ready for third audio (if needed)

### Path to 90%:
```
Today:     3,755 words, 42% score, 59% accuracy
Tomorrow:  ~4,500 words, ~70% score, ~75% accuracy
Next week: ~5,500 words, ~90% score, ~90%+ accuracy ✅
```

---

## 🚀 Let's Do This!

**Ready to:**
- Receive your audio
- Process it thoroughly
- Expand the dictionary
- Improve accuracy
- Get closer to production-ready

**Looking forward to tomorrow!** 🎯

---

*Plan Created: 2026-02-16 00:13 UTC*  
*Status: Ready for audio*  
*Goal: Expand dictionary, improve accuracy*  
*Target: 90%+ accuracy within 1-2 weeks*
