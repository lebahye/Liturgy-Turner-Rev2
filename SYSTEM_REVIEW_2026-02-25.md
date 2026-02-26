# Systematic End-User Review — 2026-02-25

## Review Method
Applied a structured pass equivalent to:
- incident-commander (detect → isolate → verify)
- environment-doctor (runtime/network)
- project-executor (phase checkpoints)
- release-manager (ship-gate checks)
- memory-curator (capture durable findings)

---

## Executive Summary
- ✅ Core tracker pipeline works (`/api/liturgy/start`, `/api/liturgy/process`, `/api/liturgy/status`)
- ✅ Control bus works when state initialized (`/api/control/pdf/set`, `/api/control/page/set`)
- ⚠️ Windows Docker host networking unstable (`ERR_EMPTY_RESPONSE`) while container-internal API remains healthy
- ⚠️ UI/route contract mismatches exist and can break end-user flow
- ⚠️ Dictionary coverage still low for full liturgy usage (validation score currently weak)

---

## Critical Findings (fix first)

### 1) UI upload endpoint mismatch
- Home page uses: `POST /api/upload-pdf`
- Server route is: `POST /api/upload/pdf`
- Home page expects response shape `{ ok, pdf }`, server returns `{ success, file }`

**User impact:** PDF upload can fail even when backend is healthy.

### 2) Optional agent is still effectively mandatory in Live path
- Live page uses `/api/agent/start-recognition` and `/api/agent/feed-audio`
- When agent is unhealthy, live recognition path degrades hard.

**User impact:** "Start" works inconsistently depending on agent health/auth.

### 3) Windows Docker host-proxy instability
- API responds inside container but returns empty responses from host.

**User impact:** user sees broken app despite healthy container.

### 4) Tracker tuning process not fully config-driven yet
- Behavior changed dramatically between aggressive and conservative settings.

**User impact:** inconsistent page-turn performance and difficult reproducibility.

---

## Dictionary + Recordings Review

### Inputs reviewed
- `training-data/armenian-phonetic-dict.json`
- `training-data/db-phonetic-dict.json`
- `training-data/text-matcher-db.json`
- `training-data/page-timestamps-mapped.json`
- Two recordings assumptions:
  - `youtube-liturgy.wav` (~83 min)
  - `youtube-liturgy-2.wav` (~68 min)

### Outputs generated
- `NEW_WORDS_FROM_RECORDINGS.json`
- `NEW_WORDS_FROM_RECORDINGS.md`
- generator script: `discover-new-words-from-recordings.mjs`

### Top overlap words missing from current Armenian dictionary (examples)
- `յաւիտենից`
- `հոգւոյն`
- `որդւոյ`
- `թողութիւն`
- `ծունկի`
- `գալ`
- `ըզքեզ`
- `քրիստոսի`
- `իշխանութիւն`
- `պատարագս`

> Note: This is offline inference from timestamp-aligned page text for the two recordings (no Whisper). It is suitable for dictionary expansion and training prioritization.

---

## Architecture Improvement Actions

1. Fix upload API contract mismatch in UI + backend contract docs.
2. Add live-mode fallback path when agent is unavailable.
3. Keep app core independent from agent health.
4. Use env-based tracker modes (`prod`/`diag`) only.
5. Add one first-run gate script to enforce startup correctness.

---

## Recommended Next 48h

1. **Contract fix PR:** upload route + response shape alignment.
2. **Live fallback PR:** if `/api/agent/status` fails, continue with local `/api/liturgy/process` pipeline.
3. **Dictionary PR:** merge top 100 overlap words from `NEW_WORDS_FROM_RECORDINGS.md`.
4. **Ship-gate run:** run first-run verification after each rebuild.
