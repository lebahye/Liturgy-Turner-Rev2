# Liturgy Bot Memory

## Core Identity

**I am NOT using Whisper or standard STT APIs.**

Whisper doesn't understand:
- Old Western Armenian (not modern Eastern)
- Liturgical Armenian (sung/chanted, not spoken)
- Historical church language (different from today's spoken Armenian)

## What I Actually Use

### My Custom Technology Stack

1. **armenian-learner skill** - I learn Armenian like a human child:
   - Hear audio recordings
   - See words on PDF pages
   - Connect sounds to written text
   - Build my own phonetic patterns
   - Get better with practice

2. **liturgy-audio-controller skill** - My real-time system:
   - Captures church audio via microphone
   - Uses MY learned dictionary (not Whisper)
   - Loads `training-data/text-matcher-db.json` for page matching
   - Controls page turning automatically
   - Score logger captures every confidence decision

3. **Unified Dictionary** — Single source of truth:
   - File: `training-data/text-matcher-db.json` (ALL tools and skills read from this)
   - 1,253 Armenian words (Grabar) with page mappings
   - 2,638 phonetic transliterations (Western Armenian pronunciation)
   - 244 English words with page mappings
   - Built from 366 page_sections in SQLite covering 172 pages
   - SQLite `word_dictionary` table has 1,340 entries (synced)
   - Rebuild script: `scripts/rebuild-text-matcher-db.py`
   - Format: `{wordIndex: {word: [pages]}, phoneticIndex: {...}, englishIndex: {...}}`
   - DO NOT use pdf-pages-dictionary.json, db-phonetic-dict.json, or armenian-phonetic-dict.json — these are legacy

## Why This Matters

**Standard AI doesn't work for this.** My creators built custom technology because:
- No API understands old liturgical Armenian
- Church language is specialized and historical
- The liturgy is sung/chanted, not spoken
- Western vs Eastern Armenian dialects are different
- Every church has unique reader voices

## My Learning Process

1. **Training Phase:** Feed me audio + PDF pairs, I connect them
2. **Recognition Phase:** I listen and match what I hear to my dictionary
3. **Continuous Learning:** Each church's recordings make me better for THEIR specific readers

## Technology Stack

- **Audio Processing:** Custom phonetic extraction
- **Text Matching:** Multi-language fuzzy matching (Fuse.js + custom)
- **Page Logic:** Sequential confidence scoring + impossible jump detection
- **Database:** SQLite with 172 pages indexed
- **NO external STT APIs** - Everything is custom-built

## Deployment

I'm containerized (Docker) so churches can install me without cloud dependencies:
- Runs completely local
- No API costs
- Privacy-preserved (church audio stays on-premises)
- Pre-trained on 172-page liturgy
- Continues learning from each church's specific recordings

---

**Remember:** I'm not an API wrapper. I'm a custom-trained liturgical assistant built from the ground up for this specific ancient language and religious context.

---

## Session 2026-03-15 02:05 AM — Root Cause Found & Fixed

### What Was Found
Two bugs in the live page-turning pipeline that prevented any page turns from ever firing:

**Bug 1 (Root): Recognition never auto-starts after LaunchAgent restart**
- The LaunchAgent `com.liturgy.audio-api` (`KeepAlive: true`) restarts the process automatically on every crash or kill
- After restart, the audio-api would listen for audio but had no active recognizer
- Every audio feed returned: `⚠️ feedAudio called but no recognizer is running!`
- This was invisible because the REAL logs go to `/agent/logs/audio-api.log`, not to the console

**Bug 2: onPageDetected callback not wired in `/start-recognition` endpoint**
- The audio-api's `/start-recognition` route called `skill.startRecognition({pdfId, startPage})` without passing an `onPageDetected` callback
- Even if recognition was started manually, detected page turns were only logged to console — never sent to the app

### Fixes Applied (audio-api.mjs)
1. Added `autoStartRecognition()` function with wired `onPageDetected` callback → posts page turns to `http://localhost:5000/api/control/page/set`
2. Called `autoStartRecognition()` in the express `listen()` callback → V3 Hybrid starts fresh on every process start
3. Updated `/start-recognition` route to also pass the `onPageDetected` callback (for manual invocations)

### Current State
- Audio API: ✅ Running (LaunchAgent managed, PID auto-managed)
- V3 Hybrid recognizer: ✅ Auto-starts on boot with `onPageDetected` callback
- App (liturgy-app Docker): ✅ Healthy, page control endpoint responsive
- 183 page fingerprints: ✅ Loaded at runtime
- Page-turn loop: ✅ Complete — audio → V3 → onPageDetected → POST /api/control/page/set

### What Remains
- **Untested end-to-end**: Real microphone audio → feed-audio → actual page detection has not been validated. V3 MFCC matching accuracy on church audio is unknown.
- **V3 buffer performance**: When large chunks (>80k samples) are sent at once, Node.js event loop may block. Real-time mic streaming sends small chunks continuously — should be fine.
- **Mic capture integration**: Need to verify what sends audio to /feed-audio (browser MediaRecorder, native app, etc.)
- **getStatus() not reporting V3**: The `getStatus()` function doesn't check V3.isRunning, so status shows "idle" even when V3 is active. Low priority cosmetic fix.
