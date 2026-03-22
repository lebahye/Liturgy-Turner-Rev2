# STATUS.md - Current State

**Last Updated:** 2026-03-14 06:07 UTC

## 🎯 Current Status: AUDIO PIPELINE CONNECTED ✅

### What Was Fixed (2026-03-14 nightly)
- **Root blocker identified:** `docker-compose.simple.yml` was missing `AGENT_AUDIO_API_URL`
- App was falling back to `http://agent:29788` (dead Docker container)
- **Fix:** Added `AGENT_AUDIO_API_URL=http://host.docker.internal:29788` 
- Container recreated — end-to-end pipeline verified:
  - `GET http://localhost:5000/api/agent/status` → returns live audio API data ✅
  - Audio API has 1366 patterns, 183 page fingerprints, 2984 words loaded ✅
  - App → audio API path: `liturgy-app container → host.docker.internal:29788` ✅

### System State
| Component | Status |
|-----------|--------|
| liturgy-app (Docker :5000) | ✅ healthy, 183 pages loaded |
| liturgy-postgres (Docker :5432) | ✅ healthy |
| audio-api (native :29788) | ✅ running, 1366 patterns, 183 fingerprints |
| Browser → App → Audio API | ✅ connected end-to-end |

## 📋 Remaining Work

### Immediate Next Step
**Test live audio recognition end-to-end:**
1. Open http://localhost:5000 in browser
2. Enable microphone capture in the app
3. Play the Badarak recording (or speak/play audio near mic)
4. Observe if page turns trigger

### Known Gaps
1. **Confidence too low (avg 0.143)** — threshold for page turn is 0.8
   - Pattern confidence will stay low until real-time audio is processed through the system
   - Need actual audio fed through `/feed-audio` to see if recognition fires
2. **Audio format:** Browser sends WebM/Opus; audio-api converts assuming 16-bit PCM
   - May need format conversion (ffmpeg) in the feed-audio handler
3. **No manual training session done yet** — George needs to run `manual-training-mode.mjs`
   while playing the recording to build timestamp-aligned fingerprints

### Git
- Latest commit: `0c15a90` - fix: wire AGENT_AUDIO_API_URL
