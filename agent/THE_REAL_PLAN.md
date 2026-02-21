# THE REAL PLAN - Learning to Read Like a Human

## The Correct Problem Statement

**GOAL:** Turn the page at the right moment

**HOW HUMANS DO IT:**
1. Listen to words being spoken/sung
2. Look at words on current page
3. When current page words end, turn to next page

**NOT:** Match acoustic patterns and make excuses about recording devices

## What I Have

### Armenian Learner Skill ✅
- **1,366 Armenian words learned** (Feb 17, 2026)
- Pattern database: 1.9MB (`learned-patterns.json`)
- Can recognize Armenian words from audio

### Liturgy Text ✅
- 183 pages of liturgy text
- Armenian + English + transliteration
- Structured by page and section

### Your Test Data ✅
- Feb 20 test session captured in database
- Pages 3-21 with timestamps and audio features
- Real page turns at real moments

## What I Need To Build

### 1. Speech-to-Text Pipeline

**Input:** Audio stream (5-10 second windows)
**Process:** 
- Extract audio features
- Use armenian-learner patterns to recognize words
- OR use Whisper with Armenian language model
**Output:** Armenian text being spoken

### 2. Text-to-Page Mapper

**Input:** Armenian text (e.g., "Սուրբ Աստուած")
**Process:**
- Search liturgy database for matching text
- Find page number(s) containing that text
**Output:** Page number(s)

### 3. Reading Position Tracker

**State:** 
- Current page: X
- Words heard so far on page X
- Confidence: "We're definitely on page X"

**Logic:**
- If we hear words from page X → confidence up
- If we hear words from page X+1 → time to turn page!
- If we hear words from page X-5 → something wrong, don't turn

### 4. Page Turn Decision

**When to turn:**
- Current page: X
- Hearing words from page: X+1
- Confidence: >80%
- **ACTION:** Turn to page X+1

**When NOT to turn:**
- Confidence too low
- Hearing random words (not sequential)
- Big jump (X → X+10) - probably error

## Tomorrow's Implementation

### Phase 1: Text Extraction (Your Video)
```bash
# You share video URL
# I extract audio
# I transcribe using Whisper (Armenian language)
# Result: Full text transcript with timestamps
```

### Phase 2: Build Text Index
```javascript
// For each page in liturgy
for (page = 1; page <= 183; page++) {
  // Get all Armenian text on this page
  const text = getLiturgyPageText(page);
  
  // Break into phrases/words
  const phrases = tokenizeArmenian(text);
  
  // Store: phrase → page number
  phrases.forEach(phrase => {
    textIndex.add(phrase, page);
  });
}
```

### Phase 3: Test on Your Captured Data
```javascript
// Load your Feb 20 test data
const markers = loadPageMarkers(); // pages 3-21

for (marker of markers) {
  // Get audio at this timestamp
  const audio = extractAudio(marker.timestamp_ms);
  
  // Transcribe to text
  const text = transcribe(audio);
  
  // Find which page this text is on
  const detectedPage = textIndex.search(text);
  
  // Compare to your actual page turn
  const actualPage = marker.page_number;
  
  if (detectedPage === actualPage) {
    console.log(`✅ Page ${actualPage}: Correct!`);
  } else {
    console.log(`❌ Page ${actualPage}: I thought ${detectedPage}`);
    console.log(`   Text heard: "${text}"`);
  }
}
```

### Phase 4: Measure REAL Accuracy

**Metric:** How many of your 19 page turns did I predict correctly by listening to the WORDS?

**Expected:** Much better than 0%!

## The Skills I Already Have

### liturgy-audio-controller ✅
- Has text database structure
- Currently only 15/183 pages populated
- **Need to:** Populate all 183 pages with text

### armenian-learner ✅
- Can recognize Armenian words
- Has 1,366 words learned
- **Need to:** Use this for transcription

## The Honest Timeline

### Tomorrow (Feb 21)

**Morning:**
- Get your video URL
- Extract audio
- Run Whisper transcription (2-3 hours for 87 minutes of audio)

**Afternoon:**
- Build complete text index (all 183 pages)
- Implement text-to-page search
- Test on sample pages

**Evening:**
- Test on your Feb 20 captured data
- Measure accuracy by WORD recognition
- Report real results

**Expected:** 60-80% accuracy (if text index is good)

### Day 2-3

- Improve text matching (fuzzy search, synonyms)
- Handle variations in pronunciation
- Add confidence scoring
- Test on new data you provide

**Expected:** 80-90% accuracy

### Week 2

- Live recognition mode
- Real-time page turning
- Manual override training
- Continuous learning from corrections

**Expected:** 90-95% accuracy

## The Difference

### Old Approach (WRONG)
```
Audio → MFCC features → Pattern match → Page number
Problem: Patterns are recording-specific
Result: 100% on one recording, 0% on others
```

### New Approach (CORRECT)
```
Audio → Speech recognition → Armenian text → Search liturgy → Page number
Benefit: Text is universal, works on any recording
Result: Works regardless of who's speaking or recording device
```

## What I Learned

**The liturgy is the SAME every Sunday.**
- Same words
- Same pages  
- Same order

**It doesn't matter:**
- Who is singing
- What microphone is used
- What the spectral rolloff is
- Whether it's YouTube or your phone

**What matters:**
- Are they saying "Սուրբ Աստուած"?
- That's page 8
- Did page 8 text finish?
- Turn to page 9

## My Commitment

**No more excuses about:**
- "Your audio is different"
- "Spectral features don't match"
- "Recording device characteristics"

**From now on:**
- Listen to the WORDS
- Match the CONTENT
- Turn at the right TEXT
- Learn from mistakes

## Status

**Understanding:** ✅ Finally correct
**Tools Available:** ✅ Armenian learner + text database
**Your Data:** ✅ Test session captured
**Next Step:** Get your video URL
**Expected:** Real progress on text-based recognition

---

*Reading = Understanding words, not memorizing sounds*
