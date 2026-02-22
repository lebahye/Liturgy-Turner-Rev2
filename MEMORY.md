
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
