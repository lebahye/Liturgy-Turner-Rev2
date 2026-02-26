
## ⛔ CRITICAL: NO WHISPER POLICY (2026-02-21)

**PERMANENT DECISION:** This project does NOT use OpenAI Whisper or any general-purpose STT API.

### Why:
- Whisper is trained on modern Armenian, NOT liturgical Old Western Armenian
- General STT expects conversational speech, NOT chanted prayers
- We built a custom pattern matching system (1,366 learned patterns) that is MORE accurate
- Privacy: church audio stays local
- Cost: $0 vs Whisper's per-minute charges

### What We Use Instead:
- **armenian-learner skill** (1,366 MFCC acoustic patterns)
- **Custom pattern matching** (supervised learning from liturgy recordings)
- **100% local processing** (no external APIs)

### Removed (2026-02-21):
- ❌ /api/transcribe endpoint
- ❌ /api/transcribe-training endpoint
- ❌ All OpenAI audio transcription calls
- ❌ "Whisper" references in UI

### If Anyone Suggests Whisper:
**Read NO_WHISPER_POLICY.md first. This is non-negotiable.**

Liturgical Armenian requires specialized acoustic matching, not general AI transcription.


## 🎯 Planned Next Skills (Captured 2026-02-25)

### Liturgy project follow-up skills (high priority)
1. `liturgy-debugger` — one command: start → stream sample audio → report page progression + confidence stats
2. `deploy-verify` — cross-environment checks (Windows dev + Docker prod) with pass/fail output
3. `tracker-tuner` — sweep threshold/lookahead/cooldown and output recommended prod settings
4. `agent-bootstrap-check` — validate gateway/auth/API key/profile so agent chat-assist is always ready

### Global bot skills to develop (active roadmap)
1. `incident-commander`
2. `release-manager`
3. `environment-doctor`
4. `project-executor`
5. `memory-curator`


## 2026-02-25 System Review Findings
- Core tracker API is healthy; agent path remains optional but currently causes live-path fragility when unhealthy.
- Windows Docker host proxy can return empty responses while container-internal API is healthy.
- Critical UI/API contract mismatch found: Home upload uses `/api/upload-pdf` but server exposes `/api/upload/pdf`; response shape mismatch too.
- Added architecture visualization doc and systematic review report.
- Added offline script `discover-new-words-from-recordings.mjs` to infer missing Armenian words from two recordings using timestamp-aligned page text.
- Generated `NEW_WORDS_FROM_RECORDINGS.{md,json}` for dictionary expansion priorities.

- Added Live-mode agent fallback path: if `/api/agent/feed-audio` fails, client decodes chunk and calls local `/api/liturgy/process` so service can continue.
- Added release gate script `verify-release-gate.ps1` for end-to-end startup checks including UI root, liturgy APIs, and control state.
