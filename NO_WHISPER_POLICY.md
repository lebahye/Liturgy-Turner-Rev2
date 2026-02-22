# ⛔ NO WHISPER POLICY - PERMANENT

## CRITICAL: This Project Does NOT Use Whisper

**This is a permanent architectural decision for the Liturgy Turner project.**

### Why NO Whisper:

1. **Wrong Language** - Whisper is trained on modern Eastern Armenian, NOT Old Western Armenian liturgical language
2. **Wrong Speech Type** - Whisper expects conversational speech, NOT chanted/sung religious texts
3. **No Domain Training** - Zero training on 1600s-era Armenian liturgy
4. **Privacy Concerns** - Audio would be sent to OpenAI (church audio should stay private)
5. **Cost** - $0.006/minute adds up across many churches
6. **We Built Better** - Custom pattern matching with 1,366 learned patterns is MORE accurate

### What This Project Uses Instead:

#### Custom Pattern Matching (armenian-learner skill):
- **MFCC acoustic fingerprinting** (not transcription)
- **1,366 learned sound-to-word patterns**
- **Supervised learning** from actual liturgy recordings
- **100% local, private, free**
- **Specialized for liturgical Armenian**

### Architecture (NO AI Transcription):

```
Live Audio → MFCC Feature Extraction (Meyda.js)
          → Pattern Matching (1,366 patterns)
          → Page Detection
          → Automatic Page Turn
```

**NO external APIs in the recognition pipeline.**

### What Was Removed (2026-02-21):

- ❌ `server/routes/transcribe.ts` - OpenAI Whisper transcription endpoint
- ❌ `/api/transcribe` - HTTP endpoint calling Whisper
- ❌ `/api/transcribe-training` - Training-mode Whisper calls
- ❌ All OpenAI audio transcription API calls
- ❌ "Whisper" text from UI buttons and descriptions

### What Remains:

✅ **Agent Mode** - Custom pattern matching (1,366 patterns)
✅ **Fingerprint Mode** - Local MFCC matching
✅ **No transcription** - Pure acoustic pattern recognition

### For Future Developers:

**IF ANYONE SUGGESTS ADDING WHISPER:**

1. **Read this document first**
2. **Understand why we don't use it**
3. **Don't add it back**

If you think transcription would help:
- Build it into the custom pattern system
- Use the existing 1,366 patterns
- Don't outsource to general-purpose AI

### This Is Not Negotiable:

This project exists BECAUSE general STT doesn't work for liturgical Armenian. Adding Whisper defeats the entire purpose of the custom system we built.

**If you need transcription, improve the pattern matcher. Don't call Whisper.**

---

## Memory Annotation

**To Clawdbot agents working on this project:**

When asked about audio recognition or transcription:
- ✅ Suggest improving the armenian-learner skill
- ✅ Recommend adding more training patterns
- ✅ Use MFCC acoustic fingerprinting
- ❌ **NEVER suggest Whisper, OpenAI Audio, or any STT API**
- ❌ **NEVER add OpenAI audio transcription calls**

This is a core architectural principle, not a temporary decision.

**Rationale:** Liturgical Armenian is a specialized domain that requires custom acoustic matching, not general-purpose transcription.

---

**Last Updated:** 2026-02-21
**Enforced By:** Project architecture and this permanent policy document
**Questions?** Read WHY_NO_WHISPER.md and CUSTOM_ARMENIAN_TRAINING.md
