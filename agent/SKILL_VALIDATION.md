# Armenian Learner Skill - Pre-Build Validation

## 🎯 Mission
Validate that learning Armenian from audio+text is FEASIBLE before building the skill.

## ❓ Critical Questions to Answer

### 1. Can we extract meaningful phonemes from liturgical CHANTING?
- **Challenge:** This is SUNG, not spoken - different acoustic properties
- **Test:** Extract audio features from sample segments, see if they're distinguishable
- **Success criteria:** Different words have different acoustic signatures

### 2. Is the PDF text parseable and usable?
- **Challenge:** Old Western Armenian, special characters
- **Test:** Extract text programmatically, verify encoding, parse words
- **Success criteria:** Clean Armenian text extraction

### 3. Is our alignment data accurate enough?
- **Challenge:** We have 152 transitions detected, but are they trustworthy?
- **Test:** Verify timestamps match actual page transitions in audio
- **Success criteria:** >90% of transitions are correctly timed

### 4. Can we distinguish repeated phrases?
- **Challenge:** "Սուրբ Աստուած" appears many times - how to tell which page?
- **Test:** Identify repeated phrases, see if context helps
- **Success criteria:** Context (previous words, timing) disambiguates

### 5. What's REALLY causing the 59% → 99% gap?
- **Challenge:** Is it language understanding, or something else?
- **Test:** Analyze the 41% of failures - what went wrong?
- **Success criteria:** Root cause identified

---

## 🧪 Validation Tests (Run Before Building)

### Test 1: Audio Feature Extraction
**File:** `validation/test-audio-features.mjs`
**Purpose:** Prove different Armenian words have different audio signatures
**Input:** Short audio segments of known words
**Output:** MFCC, spectral features - are they distinguishable?

### Test 2: PDF Text Extraction
**File:** `validation/test-pdf-parser.mjs`
**Purpose:** Prove we can extract clean Armenian text
**Input:** liturgy.pdf
**Output:** Armenian text per page, word counts, encoding validation

### Test 3: Timestamp Validation
**File:** `validation/test-alignment-accuracy.mjs`
**Purpose:** Prove our 152 transitions are accurate
**Input:** Audio + timestamps + manual verification of 20 samples
**Output:** Accuracy percentage

### Test 4: Phrase Repetition Analysis
**File:** `validation/test-phrase-contexts.mjs`
**Purpose:** Prove context can disambiguate repeated phrases
**Input:** Text database, identify duplicates
**Output:** How often phrases repeat, can timing/context distinguish?

### Test 5: Failure Analysis
**File:** `validation/analyze-59percent-failures.mjs`
**Purpose:** Understand WHY we're at 59% not 99%
**Input:** test-results-v2.json (our 59% accuracy test)
**Output:** Root cause breakdown

---

## 📊 Validation Checklist

Before building the skill, ALL must pass:

- [ ] Test 1: Audio features distinguishable (>80% separation)
- [ ] Test 2: PDF text cleanly extracted (>95% accuracy)
- [ ] Test 3: Timestamps accurate (>90% correct)
- [ ] Test 4: Context helps with repetition (>70% disambiguation)
- [ ] Test 5: Root cause identified and addressable

---

## 🚦 Go/No-Go Decision

### ✅ GREEN LIGHT (Build the skill) IF:
- All 5 tests pass
- Approach is proven feasible
- Root cause is addressable by language learning
- Realistic path to 95%+ accuracy

### 🟡 YELLOW LIGHT (Refine approach) IF:
- Some tests fail
- Alternative approach might be better
- Need hybrid solution

### 🔴 RED LIGHT (Don't build) IF:
- Fundamental blockers found
- Audio quality insufficient
- Alignment impossible
- Better solution exists

---

## 🎯 Expected Timeline

- Validation tests: 2-4 hours
- Analysis and decision: 1 hour
- **Total: 3-5 hours before writing any skill code**

---

**Status:** Not started
**Next:** Run validation tests
**Decision:** Pending test results
