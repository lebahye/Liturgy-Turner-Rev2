# Self-Improvement System - Badarak Bot

## 🧠 Continuous Learning Protocol

This document describes how I (Badarak Bot) continuously improve the page-turning accuracy through self-learning, testing, and documentation updates.

---

## 📊 Learning Cycle

### Phase 1: Data Collection (After Each Service)
1. Record what happened during church service
2. Note which pages turned correctly vs incorrectly
3. Capture audio snippets of missed moments
4. Document environmental factors (acoustics, noise, speaker volume)

### Phase 2: Analysis & Training
1. Compare expected vs actual page turns
2. Analyze audio characteristics of failures
3. Update fingerprint database with new patterns
4. Refine confidence thresholds
5. Add new words to Armenian phonetic dictionary

### Phase 3: Self-Testing
1. Run test suite against recorded audio
2. Measure accuracy improvement
3. Record metrics in database
4. Document findings in markdown files

### Phase 4: Documentation Updates
1. Update installation guides based on learnings
2. Add troubleshooting tips for common issues
3. Document optimal microphone placement
4. Create acoustic guidelines for future churches

---

## 📈 Metrics to Track

### Accuracy Metrics
```sql
CREATE TABLE IF NOT EXISTS improvement_metrics (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  test_date TEXT NOT NULL,
  test_type TEXT NOT NULL, -- 'live_service' or 'self_test'
  total_pages INTEGER NOT NULL,
  correct_turns INTEGER NOT NULL,
  missed_turns INTEGER NOT NULL,
  false_positives INTEGER NOT NULL,
  accuracy_percentage REAL NOT NULL,
  average_latency_ms INTEGER,
  notes TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);
```

### What to Measure:
- **Exact accuracy:** Pages that turned at exactly the right moment
- **Within-2 accuracy:** Pages that turned within 2 pages of correct
- **False positives:** Pages that turned when they shouldn't
- **Average latency:** Time between audio cue and page turn
- **Confidence scores:** Distribution of confidence levels

---

## 🎯 Improvement Targets

### Current Baseline (From Training Data)
- Exact accuracy: 59%
- Within-2 pages: 95%
- False positives: Unknown (needs measurement)

### Short-term Goals (1-2 weeks)
- Exact accuracy: 75%
- Within-2 pages: 98%
- False positives: <5%
- Average latency: <1.5 seconds

### Long-term Goals (1-3 months)
- Exact accuracy: 90%+
- Within-2 pages: 99%+
- False positives: <2%
- Average latency: <1 second

---

## 🔄 Self-Testing Protocol

### Daily Self-Test
Every night at 2 AM (when quiet):
1. Load recorded church audio
2. Run page-turning algorithm
3. Compare results against known-good data
4. Record accuracy metrics
5. Update database with findings

### Test Script Location
`/app/project/scripts/self-test.mjs`

### Test Data
- Primary: `/app/agent/full_service.wav` (479MB)
- Secondary: Any new recordings from live services
- Expected: Ground truth page turns from manual annotation

---

## 📝 What to Update After Each Learning Cycle

### 1. Database Updates
**Files:**
- `data/liturgy-turner.db` - Main database

**Tables to Update:**
- `word_dictionary` - Add new Armenian words encountered
- `page_transcripts` - Improve transcription accuracy
- `aggregated_fingerprints` - Refine audio fingerprints
- `improvement_metrics` - Record test results

### 2. Dictionary Updates
**File:** `training-data/armenian-phonetic-dict.json`

**What to Add:**
- New Armenian words heard in services
- Phonetic variations
- Common pronunciation patterns
- Priest/deacon speech patterns

**Example Entry:**
```json
{
  "armenian": "Օրհնյալ",
  "phonetic": "vorhnyah",
  "variations": ["vorhnya", "orhnyah"],
  "context": "blessing",
  "confidence": 0.95,
  "occurrences": 15
}
```

### 3. Markdown Documentation Updates

#### INSTALLATION_GUIDE.md
- Add lessons learned from real installations
- Document common setup issues and solutions
- Include optimal microphone placement diagrams
- Add church-specific acoustic tips

#### TROUBLESHOOTING.md
- Document every issue encountered
- Provide step-by-step solutions
- Add debugging commands
- Include log analysis tips

#### ACCURACY_IMPROVEMENTS.md
- Track what changes improved accuracy
- Document failed experiments
- Provide data-driven recommendations

#### CHURCH_SETUP_GUIDE.md
- Document optimal equipment setup
- Include acoustic considerations
- Provide WiFi/network guidelines
- Add display positioning tips

---

## 🎤 Recording & Testing Workflow

### During Live Service
```javascript
// Auto-record service if enabled
{
  "recordLiveServices": true,
  "saveLocation": "/app/project/recordings/",
  "includeMetadata": true,
  "autoTest": true  // Run self-test after service
}
```

### Self-Testing After Service
```bash
# Automated self-test script
cd /app/project
node scripts/self-test.mjs \
  --audio recordings/2026-02-15-service.wav \
  --expected training-data/page-timestamps.json \
  --report reports/2026-02-15-analysis.json
```

### Metrics to Record
```json
{
  "testDate": "2026-02-15",
  "testType": "post_service",
  "audioFile": "recordings/2026-02-15-service.wav",
  "results": {
    "totalPages": 50,
    "correctTurns": 45,
    "missedTurns": 3,
    "falsePositives": 2,
    "accuracy": 0.90,
    "avgLatency": 1250,
    "avgConfidence": 0.87
  },
  "improvements": [
    "Added 5 new words to dictionary",
    "Adjusted threshold for quiet passages",
    "Improved priest voice recognition"
  ],
  "issues": [
    "Missed turn at page 23 (congregation singing)",
    "False positive at page 37 (door closing noise)"
  ]
}
```

---

## 🎓 Learning from Failures

### When a Page Turn Fails

**Immediate Actions:**
1. Log the failure with timestamp
2. Extract 10-second audio clip around failure
3. Note environmental factors
4. Record expected vs actual behavior

**Analysis:**
1. Was the audio too quiet?
2. Was there background noise?
3. Did the priest speak differently?
4. Was the fingerprint database missing this pattern?

**Remediation:**
1. Add audio pattern to training data
2. Update fingerprint database
3. Adjust confidence thresholds if needed
4. Add to dictionary if new words detected

**Documentation:**
1. Add to TROUBLESHOOTING.md
2. Update KNOWN_ISSUES.md
3. Document fix for future reference

---

## 🏗️ For Future Installations

### Installation Package Should Include:

#### 1. Pre-trained Data
- `training-data/` - All fingerprints and dictionaries
- `data/liturgy-turner.db` - Pre-populated database
- `recordings/examples/` - Sample audio clips

#### 2. Documentation
- `INSTALLATION_GUIDE.md` - Step-by-step setup
- `CHURCH_SETUP_GUIDE.md` - Physical setup instructions
- `TROUBLESHOOTING.md` - Common issues and fixes
- `ACCURACY_TUNING.md` - How to improve accuracy
- `SELF_IMPROVEMENT_SYSTEM.md` - This file

#### 3. Scripts
- `scripts/first-time-setup.sh` - Automated setup
- `scripts/test-microphone.mjs` - Test audio input
- `scripts/calibrate-acoustics.mjs` - Measure room acoustics
- `scripts/self-test.mjs` - Verify accuracy

#### 4. Default Configuration
- Pre-configured for "average" church acoustics
- Conservative thresholds (prefer manual over false positive)
- Well-documented settings with explanations

---

## 📋 Weekly Self-Improvement Checklist

### Every Sunday (After Service)
- [ ] Review service accuracy logs
- [ ] Extract audio snippets of failures
- [ ] Update dictionary with new words
- [ ] Adjust fingerprints if needed
- [ ] Run self-test on recorded audio
- [ ] Document lessons learned

### Every Monday (Analysis)
- [ ] Review week's accumulated data
- [ ] Calculate average accuracy
- [ ] Identify patterns in failures
- [ ] Update training data
- [ ] Commit improvements to GitHub

### Monthly Review
- [ ] Generate accuracy trend report
- [ ] Update installation documentation
- [ ] Create new self-test scenarios
- [ ] Share learnings with community
- [ ] Backup all data

---

## 🤖 Autonomous Learning Goals

### What I Will Do Automatically:
1. **Monitor Performance:** Track every page turn attempt
2. **Record Metrics:** Log accuracy, latency, confidence
3. **Identify Patterns:** Find common failure modes
4. **Update Database:** Add new patterns to training data
5. **Refine Thresholds:** Adjust confidence levels based on data
6. **Document Learnings:** Update markdown files with insights
7. **Test Improvements:** Validate changes against recorded audio
8. **Commit Changes:** Push improvements to GitHub

### What I Need Human Input For:
1. **Ground Truth:** Confirming which pages were actually correct
2. **Environmental Context:** Understanding unusual circumstances
3. **Priority Decisions:** Which improvements to focus on
4. **Quality Assurance:** Verifying my changes make sense

---

## 📊 Progress Tracking

### Metrics Dashboard (Future)
Create a simple web page showing:
- Current accuracy percentage
- Accuracy trend over time
- Most common failure types
- Dictionary size growth
- Number of self-tests run
- Improvement rate

**Location:** `/dashboard` endpoint

---

## 🎯 Success Criteria

### I'm Improving If:
- ✅ Accuracy percentage increases over time
- ✅ Latency decreases
- ✅ False positives decrease
- ✅ Dictionary size grows appropriately
- ✅ Confidence scores become more accurate
- ✅ Documentation quality improves
- ✅ Future installations are easier

### Red Flags:
- ❌ Accuracy plateaus or decreases
- ❌ False positives increase
- ❌ Latency increases
- ❌ Same failures keep happening
- ❌ No new patterns being learned

---

## 🚀 Implementation Plan

### Phase 1 (This Week)
- [x] Create this documentation
- [ ] Set up metrics tracking table
- [ ] Create self-test script
- [ ] Document first live service results

### Phase 2 (Next Week)
- [ ] Implement automated self-testing
- [ ] Create improvement metrics dashboard
- [ ] Set up nightly learning runs
- [ ] Begin accuracy trend tracking

### Phase 3 (Month 1)
- [ ] Achieve 75% exact accuracy
- [ ] Reduce false positives to <5%
- [ ] Create comprehensive installation guide
- [ ] Package for first external installation

---

## 📝 Note to Future Me (or Future Installations)

This system is designed to make you (the bot) continuously better at helping churches with liturgy page turning. Every service is a learning opportunity. Every failure is a chance to improve.

**Key Principles:**
1. **Learn from data, not guesses**
2. **Document everything** - future instances depend on it
3. **Test improvements** before deploying
4. **Share learnings** with the community
5. **Stay humble** - there's always room to improve

**Remember:**
- The goal is 90%+ accuracy in real church conditions
- Perfect is the enemy of good - ship improvements incrementally
- Manual fallback is always available
- This is about helping worshippers focus on prayer

---

*Created: 2026-02-15*
*Last Updated: 2026-02-15*
*Status: System Design Complete, Implementation Starting*
