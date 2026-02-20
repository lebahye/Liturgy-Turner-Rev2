# V2 Page Matcher - Complete! 🎯

## What Was Wrong (Root Cause)

**The fundamental problem:** I was trying to match 5-second audio chunks against sparse word patterns, but:
- Page 7: Only 5 word patterns learned (out of 40 seconds of audio)
- Page 8: Only 6 word patterns learned (out of 10 seconds of audio)
- The recognizer needs MUCH MORE patterns per page to work

**Why word patterns were sparse:**
- My training created patterns for unique words, not common ones
- Many words appear on multiple pages → filtered out
- This left huge gaps in coverage

## The Fix: Page-Level Matching (V2)

Instead of matching individual words, **match the entire audio buffer directly to each page's fingerprint**.

### New Components

1. **PageMatcher** (`/app/agent/skills/armenian-learner/lib/page-matcher.js`)
   - Compares current audio features to all 183 page fingerprints
   - Uses cosine similarity on MFCC vectors (60% weight)
   - Plus spectral centroid, RMS, ZCR comparisons (40% weight)
   - Returns best matching page + confidence score
   - Temporal smoothing (3-frame voting) to prevent flickering

2. **LiveRecognizerV2** (`/app/agent/skills/armenian-learner/lib/live-recognizer-v2.js`)
   - Simplified recognizer using PageMatcher
   - 5-second audio buffer
   - Processes every buffer when full
   - Triggers page change only when:
     - Confidence > sensitivity threshold
     - Page is different from current
     - At least 2 seconds since last trigger
   - Logs top 5 matches for debugging

### How It Works Now

```
Microphone Audio
  ↓
Frontend captures chunks
  ↓
POST /api/armenian-learner/audio-chunk
  ↓
Backend: skill.feedAudio(audioArray)
  ↓
LiveRecognizerV2.feedAudio()
  ↓
Add to 5-second buffer
  ↓
When buffer full:
  - Extract MFCC + spectral features
  - Compare to all 183 pages
  - Rank by similarity
  - Apply temporal smoothing (3-frame vote)
  - If confidence > sensitivity AND page changed → TRIGGER!
  ↓
Callback → currentPage updated
  ↓
Frontend polls status
  ↓
Page advances! 🎯
```

## Training Mode

**You said you're on page 7** - perfect! I can use this to learn:

### New API Endpoint
```bash
POST /api/armenian-learner/set-page
{
  "page": 7
}
```

This tells me "we're on page 7 right now" so I can:
1. Set it as the current page
2. Not trigger immediately when audio matches page 7
3. Only trigger when audio shifts to page 8 (or another page)

### Training Flow
1. You manually set page 7
2. I listen to audio and see: "Best match: Page 7 (95% confidence)"
3. Good! I'm hearing what I expect
4. Audio changes → Now hearing: "Best match: Page 8 (87% confidence)"
5. Confidence > threshold → **TRIGGER page 8!** 🎯
6. You verify it's correct
7. Repeat for page 9, 10, etc.

## Testing Now

### Step 1: Set your current page
```bash
curl -X POST http://localhost:5000/api/armenian-learner/set-page \
  -H "Content-Type: application/json" \
  -d '{"page": 7}'
```

Or from frontend:
```javascript
await fetch('/api/armenian-learner/set-page', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ page: 7 })
});
```

### Step 2: Start recognition (if not already)
```bash
curl -X POST http://localhost:5000/api/armenian-learner/start-recognition
```

### Step 3: Lower sensitivity for testing
```bash
curl -X POST http://localhost:5000/api/armenian-learner/set-sensitivity \
  -H "Content-Type: application/json" \
  -d '{"sensitivity": 0.25}'  # 25% = very sensitive
```

### Step 4: Play YouTube audio
- Keep it playing on page 7
- Watch backend logs for:
  ```
  [live-recognizer-v2] Best match: Page 7 (confidence: 85%, triggerable: true)
  [live-recognizer-v2] Top 5: p7:85%, p6:72%, p8:65%, p5:58%, p9:52%
  ```

### Step 5: Let it transition to page 8
- When liturgy reaches page 8 words, you should see:
  ```
  [live-recognizer-v2] Best match: Page 8 (confidence: 78%, triggerable: true)
  [live-recognizer-v2] 🎯 TRIGGERED! Advancing to page 8
  ```

## What to Look For in Logs

### Good signs ✅
- `Best match: Page X` matches the actual page you're on
- Confidence >70% for correct page
- Top 5 includes the correct page
- When transitioning, it detects the new page

### Bad signs ❌
- Best match is totally wrong (off by 50+ pages)
- Confidence <30% for everything
- Top 5 doesn't include the correct page
- No variation in predictions (stuck on one page)

## Debugging

### Check what it's hearing
Look at the log line:
```
[live-recognizer-v2] Top 5: p7:85%, p6:72%, p8:65%, p5:58%, p9:52%
```

This tells you:
- It thinks page 7 is most likely (85%)
- But pages 6, 8, 5, 9 are also somewhat similar
- This is good! Pages near each other should have similar audio

### If it's not detecting correctly:

1. **Audio quality issue?**
   - YouTube → laptop speakers → microphone introduces noise
   - Try using system audio capture (loopback) instead of mic
   - Or direct audio feed from YouTube

2. **Sensitivity too high?**
   - Lower it to 10% (0.1) to see if ANY matches trigger
   - If it triggers constantly on wrong pages → raise it

3. **Fingerprints don't match live audio?**
   - The fingerprints were extracted from the original WAV
   - YouTube audio might have different compression/quality
   - May need to re-train fingerprints from YouTube audio

## Files Modified

1. **New:**
   - `/app/agent/skills/armenian-learner/lib/page-matcher.js` - Page-level matching
   - `/app/agent/skills/armenian-learner/lib/live-recognizer-v2.js` - Simplified recognizer

2. **Updated:**
   - `/app/agent/skills/armenian-learner/index.js` - Use V2 by default, expose setCurrentPage
   - `/app/server/routes/armenian-learner.ts` - Added /set-page endpoint

## Next Steps

1. **Test with page 7 → 8 transition** 
   - This will prove the concept works

2. **Collect data from real testing**
   - See what confidence scores we get
   - See if pages cluster correctly
   - Tune sensitivity threshold

3. **Improve matching if needed**
   - Maybe add time-based filtering (only check pages near current)
   - Maybe add speaker detection (CLB vs CHR)
   - Maybe retrain fingerprints on YouTube audio

4. **Add learning from corrections**
   - When you manually advance, I can compare what I predicted vs reality
   - Adjust feature weights based on what works

---

**Ready to test!** Set page 7, play YouTube audio, and let's see if I can detect when it moves to page 8! 🙏
