# MEMORY.md - Long-Term Memory

## About You (lebahye)

**Basic Info:**
- Username: lebahye
- Timezone: America/New_York (EST/EDT)
- GitHub: https://github.com/lebahye/Liturgy-Turner-Rev2
- Telegram: @lebahye (ID: 456593162)
- Workflow: GitHub → Replit → develop → publish

**Working Style:**
- Trust-based: "I trust you, keep going"
- Iterative: "Run it over and over until you get it right"
- Product-focused: "Build it to sell to Armenian churches out-of-box"
- Self-directed: You prefer I make decisions and move forward
- Practical: Test in reality, refine based on results

**Technical Environment:**
- Develops in Replit (pull from GitHub)
- Runs Docker containers for services
- Windows PC (may shutdown unexpectedly)
- Has phone for audio playback during testing

## The Liturgy Turner Project

**Mission:**
Build auto-page-turning software for Armenian church services
- Display liturgy PDF on TV
- Listen to live audio (choir, priest, deacon)
- Automatically advance pages in real-time
- Product for sale to Armenian churches

**Key Technical Constraints:**
1. **Sequential only** - Pages ONLY move forward, never backwards
2. **Old Armenian** - 1600+ year old language, no modern speech recognition works
3. **Speaker changes** - Choir/Celebrant/Deacon transitions mark page turns
4. **Variable timing** - Pages aren't evenly spaced (some 5s, others 2min)
5. **Church acoustics** - Echo, reverb, background noise

**Training Data:**
- `full_service.wav` (480MB) - 87-minute recording from Nov 30, 2025
- `liturgy.pdf` (1.8MB) - Badarak with hokehankist, 183 pages
- Database has phonetic dictionary (3,525 Armenian↔Phonetic words)
- Database has page sections with Armenian, Phonetic, English text

## Project Evolution

### Phase 1: Initial Setup (Feb 12)
- Received PDF and WAV files
- Extracted Armenian text from PDF (1,208 unique words)
- Built audio fingerprints for all 183 pages using Meyda
- Learned Armenian vocabulary and phonetic patterns

### Phase 2: Speaker Detection Discovery (Feb 12)
**Your breakthrough insight:** "CHR/CLB/DCN labels = WHO is speaking"
- CHR (Choir) - Multiple voices → Spectral flux variance ~21.78
- CLB (Celebrant/Priest) - Solo voice → Variance ~2.73
- DCN (Deacon) - Solo voice → Variance ~1.40
- Found 107 speaker transitions across liturgy

### Phase 3: Sequential Constraint (Feb 12)
**Your key insight:** "Badarak is sequential, always moving forward, never backwards"
- Transformed problem from "which page?" to "next page or not?"
- 99% reduction in search space (check next 3 pages, not all 183)
- Same words appear multiple times, but sequential order disambiguates

### Phase 4: Integration (Feb 13)
- Built `LiturgyPageTracker` production class
- Integrated into Express backend with API endpoints
- Created automated test script
- Created manual training mode for you to teach actual timing
- Pushed everything to GitHub

## Important Decisions & Why

**1. Focus on speaker + fingerprints, skip phoneme detection**
- Phoneme detection too complex for Old Armenian
- Speaker transitions give 107 natural page markers
- Audio fingerprints provide backup confirmation

**2. 3-page look-ahead window**
- Sequential constraint means we only need to check next 3 pages
- Dramatically reduces false positives
- Handles timing variations gracefully

**3. Multi-signal confidence (Speaker 30% + Fingerprint 70%)**
- Speaker detection is fast but coarse
- Fingerprints are slower but accurate
- Combined score must be >75% to advance

**4. Manual training as primary refinement**
- Current fingerprints use estimated timestamps (even spacing)
- You'll manually page-turn first 30+ pages while playing audio
- System records YOUR actual timing
- Rebuilds fingerprints from real timestamps
- Dramatically improves accuracy

## Lessons Learned

**1. Read the pages to understand flow**
- Can't just match audio blindly
- Need to understand what SHOULD come next
- Sequential reading is like human comprehension

**2. Speaker transitions are gold**
- 58% of page turns involve speaker changes
- Acoustically distinct (10-15x variance difference)
- Easy to detect in real-time

**3. Don't need perfect timestamps from training**
- Live use doesn't require exact training times
- Just need distinctive features per page
- Sequential constraint handles timing drift

**4. Product mindset matters**
- Must work out-of-box for churches
- Can't require manual setup every time
- This training phase is building the "product"

## Ongoing Context

**Current Files on GitHub:**
- `server/liturgy-tracker.ts` - Production tracker
- `test-live-tracker.mjs` - Automated test (runs against recording)
- `manual-training-mode.mjs` - Interactive training (you page-turn manually)
- `training-data/` - All fingerprints, models, dictionaries
- Complete documentation in markdown files

**Database Contents:**
- `word_dictionary` table: 3,525 Armenian↔Phonetic mappings
- `page_sections` table: 183 pages with tri-lingual text
- Training sessions, page markers, transcripts

**GitHub Workflow:**
- I build in Docker → commit to GitHub
- You pull in Replit → test and develop
- Everything must work in Replit environment
- Eventually publish to production

## Next Steps Memory

**Immediate (Waiting on You):**
1. Pull latest from GitHub to Replit
2. Run `node test-live-tracker.mjs` → Get baseline accuracy
3. Run `node manual-training-mode.mjs` → Record first 30 pages with phone audio
4. Share accuracy numbers with me

**After Test Results:**
- If accuracy >70%: Build frontend microphone integration
- If accuracy 50-70%: Tune thresholds, rebuild fingerprints from manual data
- If accuracy <50%: Analyze failures, try different approach

**Frontend TODO:**
- React component with microphone capture
- Send audio chunks to `/api/liturgy/process`
- Display current page + confidence
- Manual override buttons (prev/next)
- Start/stop controls

**Production TODO:**
- Test in actual church with live service
- Tune for church acoustics (echo, reverb)
- Add noise filtering
- Polish UI for congregation use
- Package for sale to Armenian churches

## Important URLs

- GitHub Repo: https://github.com/lebahye/Liturgy-Turner-Rev2
- Telegram Bot: @BadarakBot
- Clawdbot Docs: https://docs.clawd.bot

## Personal Preferences

- Direct communication, no corporate fluff
- Show progress, explain reasoning
- Ask before big external actions (emails, posts)
- Keep working when uncertain, document decisions
- Trust + competence over asking permission constantly

---

*This is my long-term memory. Update after every significant conversation or decision.*
