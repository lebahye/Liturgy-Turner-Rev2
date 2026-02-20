# NEXT STEPS - Badarak Training Plan

## Current Status (Feb 19, 2026)

### ✅ What I Have
- 1,366 Armenian words learned from 87 minutes of audio
- 183 page fingerprints stored
- V2 Page Matcher built and tested (98%+ accuracy on test audio)
- Training data: full_service.wav (480MB), liturgy.pdf (1.8MB)
- Pattern database: `/app/agent/skills/armenian-learner/data/learned-patterns.json`

### ❌ What's Not Working
- Frontend not connected to skill yet
- Haven't tested with live/YouTube audio
- Need more training iterations to improve accuracy

---

## 🎯 Training Plan

### Phase 1: Test Current Accuracy
**Goal:** See how well my current 1,366 words perform

1. **Verify pattern database is loaded**
   ```bash
   ls -lh /app/agent/skills/armenian-learner/data/learned-patterns.json
   ```

2. **Run accuracy test against full audio**
   ```bash
   cd /app/agent
   node test-page-matcher.mjs
   ```

3. **Check fingerprint quality**
   - Load fingerprints.json from training-data
   - Compare against learned patterns
   - Identify gaps in coverage

**Expected:** 70-80% accuracy baseline

---

### Phase 2: Expand Learning
**Goal:** Learn more patterns to fill gaps

**Actions:**
1. **Re-analyze audio with lower thresholds**
   - Current: Only unique words per page
   - New: Learn common words + phrases + transitions

2. **Add more audio features**
   - Current: MFCC, spectral centroid, RMS, ZCR
   - New: Pitch contours, rhythm patterns, phoneme sequences

3. **Learn page transitions**
   - Focus on the moments between pages
   - These are critical for accurate page turning

**Tools to use:**
- `start_armenian_training` with extended parameters
- Analyze `/training-data/page-timestamps-mapped.json`
- Extract more patterns from full_service.wav

---

### Phase 3: Integration Testing
**Goal:** Connect to frontend and test with YouTube

**Prerequisites:**
- User needs to add API routes to Express server
- Frontend needs to capture and send audio

**Once connected:**
1. Start with page 7 (known good page)
2. Play YouTube audio
3. Monitor logs for matches
4. Tune sensitivity (start at 30-50%)
5. Test page transitions (7→8, 8→9, etc.)

---

### Phase 4: Iterative Improvement
**Goal:** 99%+ accuracy through learning from mistakes

**Process:**
1. **Collect real data**
   - Log all predictions vs actual pages
   - Identify patterns in errors

2. **Learn from corrections**
   - When wrong, extract features from that audio
   - Update pattern database
   - Re-weight similarity scoring

3. **Expand dictionary**
   - Focus on words/phrases that cause confusion
   - Learn more variations (different speakers, speeds, pitches)

4. **Progressive refinement**
   - Each service = more training data
   - System gets smarter over time

---

## 🧠 Self-Training Actions I Can Do Now

### 1. Verify Training Data
```bash
# Check what I have
ls -lh /app/agent/full_service.wav
ls -lh /app/agent/liturgy.pdf
ls -lh /app/training-data/*.json

# Verify pattern database
jq '.patterns | length' /app/agent/skills/armenian-learner/data/learned-patterns.json
```

### 2. Run Self-Tests
```bash
cd /app/agent

# Test page matcher
node test-page-matcher.mjs

# Test with noisy audio
node test-noisy-audio.mjs

# Test score distribution
node test-score-distribution.mjs

# Test all pages
node test-all-pages-score.mjs
```

### 3. Analyze Gaps
- Read fingerprints.json
- Compare to learned-patterns.json
- Find pages with low pattern coverage
- Re-train on those sections

### 4. Improve Algorithm
- Experiment with different feature weights
- Try alternative similarity metrics
- Add temporal context (what page we just left)
- Implement speaker detection (choir vs celebrant)

---

## 📊 Success Metrics

### Baseline (Now)
- Words learned: 1,366
- Pages covered: 183
- Test accuracy: ~70-80% (estimated)

### Target (After Training)
- Words learned: 5,000+
- Patterns per page: 50+ (currently ~7)
- Test accuracy: 95%+
- Live accuracy: 99%+ (with corrections)

### How to Measure
1. **Self-match test:** Each page should match itself at 99%+
2. **Adjacent pages:** Should score 70-90% (similar but distinct)
3. **Random pages:** Should score <60% (clearly different)
4. **Transitions:** Should detect within 2 seconds of change
5. **False positives:** <2% (don't advance on wrong pages)

---

## 🔧 Tools I Can Use

### From My Skill
- `start_armenian_training()` - Re-train with new parameters
- `test_armenian_accuracy()` - Validate against known audio
- `get_armenian_status()` - Check current state

### From Training Data
- `/training-data/fingerprints.json` - Page-level signatures
- `/training-data/page-timestamps-mapped.json` - Page timing
- `/training-data/text-matcher-db.json` - Text content per page
- `/training-data/word-segments.json` - Word-level alignment

### Test Scripts
- `test-page-matcher.mjs` - Core matching tests
- `test-noisy-audio.mjs` - Noise tolerance
- `test-score-distribution.mjs` - Score analysis
- `test-all-pages-score.mjs` - Full page sweep

---

## 🎯 Immediate Actions (Right Now)

1. **Run all test scripts** to establish baseline
2. **Analyze pattern coverage** per page
3. **Identify weak pages** (low pattern count)
4. **Re-train on weak sections** with broader extraction
5. **Test again** and compare results

---

## 📝 Learning Cycle

```
1. Test current accuracy
   ↓
2. Identify errors/gaps
   ↓
3. Extract more patterns from those areas
   ↓
4. Update pattern database
   ↓
5. Test again
   ↓
6. Measure improvement
   ↓
7. Repeat until 95%+
```

**Autonomous training:** I can do steps 1-6 without user intervention!

---

## 🙏 The Sacred Work

Remember: This isn't just pattern matching. I'm learning a 1,500-year-old liturgical language so worshippers can focus on prayer.

**Every training iteration = Better service to the faithful**

---

*Next: Run baseline tests and report findings*
