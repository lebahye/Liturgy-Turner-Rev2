# Armenian Learner - Improvement Plan

## Problem Statement

**Current accuracy:** Page-level matching scores all pages at 95-99% similarity (only 4% spread)

**Why:** Liturgical audio is naturally homogeneous:
- Same voices (celebrant, choir, deacon)
- Same equipment and room acoustics
- Similar melodic and rhythmic patterns
- Consistent recording quality

**Result:** Hard to distinguish pages using audio features alone

---

## Current Assets

### 1. Page-Level Fingerprints (V2 System)
**File:** `/app/training-data/fingerprints.json`
- 183 page fingerprints
- Features: MFCC (13 dims), spectral centroid, spectral rolloff, RMS, ZCR
- Coverage: Full liturgy (87 minutes)
- **Strength:** Fast matching (compare 5s audio to all 183 pages)
- **Weakness:** Low discrimination (95-99% similarity)

### 2. Word-Level Patterns (V1 System)
**File:** `/app/agent/skills/armenian-learner/data/learned-patterns.json`
- 1,366 unique Armenian words learned
- Features per word: phonemes, MFCC, spectral fingerprint, duration
- **Strength:** Precise word recognition
- **Weakness:** Sparse coverage (~7 words per page)
- **Status:** NOT being used by current live recognizer!

### 3. Text Content Database
**File:** `/app/training-data/text-matcher-db.json`
- Text content for all 183 pages
- Armenian liturgical text
- **Strength:** Ground truth for each page
- **Weakness:** Need speech recognition to use it

### 4. Page Timing Data
**File:** `/app/training-data/page-timestamps-mapped.json`
- Start/end times for each page
- Page durations (5s to 570s)
- Speaker transitions
- **Strength:** Temporal context
- **Weakness:** Not used in current matcher

---

## Solution: Hybrid Multi-Stage Matching

### Architecture

```
Live Audio Stream (5s buffer)
  ↓
STAGE 1: Page-Level Broad Match
  → Compare MFCC to all 183 pages
  → Get top 10 candidates (e.g., pages 5-14)
  ↓
STAGE 2: Word Recognition
  → Scan buffer for known Armenian words
  → Match words to text-matcher-db
  → Find pages containing those words
  ↓
STAGE 3: Temporal Context
  → We just left page 7
  → Next page should be 8, 9, or nearby
  → Penalize jumps >10 pages (unless reset)
  ↓
STAGE 4: Weighted Fusion
  → Page-level score: 30%
  → Word recognition: 50%
  → Temporal context: 20%
  ↓
STAGE 5: Confidence Threshold
  → If confidence >threshold: TRIGGER page change
  → Else: Stay on current page
```

---

## Implementation Plan

### Phase 1: Enable Word Recognition in Live Mode ⏳

**Current problem:** LiveRecognizerV2 only uses page-level matching, ignores the 1,366 words I learned!

**Fix:**
1. Modify `LiveRecognizerV2.processBuffer()`
2. After page-level match, scan buffer for known words
3. Use PatternDatabase to recognize words
4. Match recognized words to page text content
5. Combine scores

**File to edit:** `/app/agent/skills/armenian-learner/lib/live-recognizer-v2.js`

**New method:**
```javascript
/**
 * Recognize words in audio buffer
 * Returns: [{ word: "ԱՍՏՈՒԱԾ", confidence: 0.85, position: 2.3 }, ...]
 */
recognizeWords(audioBuffer) {
  const words = [];
  const stepSize = 0.5; // scan every 0.5 seconds
  
  for (let t = 0; t < this.bufferDuration; t += stepSize) {
    const start = Math.floor(t * this.sampleRate);
    const end = Math.floor((t + 1.0) * this.sampleRate); // 1s window
    const segment = audioBuffer.slice(start, end);
    
    // Extract features
    const features = this.audioExtractor.extractSignature(segment, this.sampleRate);
    
    // Match against word patterns
    const match = this.patternDb.matchPattern(features);
    
    if (match && match.confidence > 0.5) {
      words.push({
        word: match.word,
        confidence: match.confidence,
        position: t
      });
    }
  }
  
  return words;
}
```

---

### Phase 2: Text Content Matching ⏳

**Goal:** Use recognized words to find matching pages

**Algorithm:**
```javascript
/**
 * Find pages containing recognized words
 * Returns: [{ page: 7, wordMatches: 3, confidence: 0.78 }, ...]
 */
matchWordsToPages(recognizedWords, textDb) {
  const pageScores = {};
  
  recognizedWords.forEach(({word, confidence}) => {
    // Find pages containing this word
    const pages = textDb.findPagesWithWord(word);
    
    pages.forEach(page => {
      if (!pageScores[page]) {
        pageScores[page] = { matches: 0, totalConfidence: 0 };
      }
      pageScores[page].matches++;
      pageScores[page].totalConfidence += confidence;
    });
  });
  
  // Convert to array and sort
  return Object.entries(pageScores)
    .map(([page, {matches, totalConfidence}]) => ({
      page: parseInt(page),
      wordMatches: matches,
      confidence: totalConfidence / matches
    }))
    .sort((a, b) => b.confidence - a.confidence);
}
```

---

### Phase 3: Temporal Context ⏳

**Goal:** Use previous page to constrain predictions

**Rules:**
1. If we were on page 7, next page is likely 8, 9, or maybe 6
2. Unlikely to jump from page 7 to page 150 (unless user reset)
3. Page sequence usually goes forward (7→8→9), rarely backward

**Implementation:**
```javascript
/**
 * Apply temporal bias to page scores
 */
applyTemporalContext(candidates, currentPage) {
  if (!currentPage) return candidates; // No context yet
  
  return candidates.map(candidate => {
    const distance = Math.abs(candidate.page - currentPage);
    
    let temporalScore = 1.0;
    if (distance === 1) temporalScore = 1.0;        // Adjacent page: no penalty
    else if (distance <= 3) temporalScore = 0.9;    // Nearby: slight penalty
    else if (distance <= 10) temporalScore = 0.7;   // Medium: moderate penalty
    else temporalScore = 0.3;                       // Far: strong penalty
    
    return {
      ...candidate,
      temporalScore,
      adjustedConfidence: candidate.confidence * temporalScore
    };
  });
}
```

---

### Phase 4: Fusion & Decision ⏳

**Goal:** Combine all signals into final confidence score

**Weights:**
- Page-level audio: 30% (broad categorization)
- Word recognition: 50% (precise identification)
- Temporal context: 20% (sequence constraint)

**Formula:**
```javascript
finalScore = (
  pageLevelScore * 0.30 +
  wordRecognitionScore * 0.50 +
  temporalScore * 0.20
)

if (finalScore > sensitivity && page !== currentPage) {
  TRIGGER page change!
}
```

---

## Testing Strategy

### Test 1: Word Recognition Accuracy
**Input:** 1-second audio clips of known words
**Expected:** Recognize >80% of words correctly

### Test 2: Page Identification with Words
**Input:** 5-second clip from page 7 (contains 2-3 words)
**Expected:** Identify page 7 with >90% confidence

### Test 3: Temporal Constraint
**Scenario:** Currently on page 7, audio is from page 8
**Expected:** High confidence for page 8, low for page 150

### Test 4: End-to-End
**Input:** Live audio stream, starting at page 1
**Expected:** Correctly advance through pages 1→2→3... with <2% error rate

---

## Performance Targets

### Current (Page-Level Only)
- Coverage: 183 pages
- Features: 5 per page (MFCC, spectral, RMS, ZCR, rolloff)
- Discrimination: 4% spread (95-99% similarity)
- Estimated accuracy: 60-70%

### Target (Hybrid System)
- Coverage: 183 pages + 1,366 words
- Features: Page audio + word patterns + temporal context + text content
- Discrimination: 30%+ spread (confident matches >90%, wrong pages <60%)
- Target accuracy: 95%+

---

## Timeline

### Week 1: Enable Word Recognition
- Day 1-2: Integrate word recognition into LiveRecognizerV2
- Day 3: Test word recognition accuracy
- Day 4-5: Debug and tune

### Week 2: Text Matching + Temporal Context
- Day 1-2: Add text content matching
- Day 3-4: Add temporal context
- Day 5: Integrate fusion scoring

### Week 3: Testing & Tuning
- Day 1-3: End-to-end testing with YouTube audio
- Day 4-5: Parameter tuning (weights, thresholds)

### Week 4: Live Church Test
- Test with real liturgy in church
- Collect error data
- Iterate and improve

---

## Next Actions

1. ✅ Understand current state (DONE)
2. ⏳ Modify LiveRecognizerV2 to use word patterns
3. ⏳ Load text-matcher-db.json for text content
4. ⏳ Implement hybrid scoring
5. ⏳ Test with YouTube audio

---

## Success Metrics

**Milestone 1: Word Recognition Working**
- Can recognize Armenian words in live audio
- >80% word recognition accuracy

**Milestone 2: Hybrid Matching Working**
- Page + word + temporal scores combine correctly
- Clear discrimination between correct and wrong pages

**Milestone 3: Live Testing**
- Test with YouTube audio
- >90% page detection accuracy

**Milestone 4: Production Ready**
- Test in church
- >95% accuracy
- <2% false positives

---

*Status: Planning complete, ready to implement Phase 1*
*Next: Modify LiveRecognizerV2.js to enable word recognition*
