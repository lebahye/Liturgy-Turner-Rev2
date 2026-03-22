# DIAGNOSIS.md — Liturgy Turner Live Page-Turn Failure
_Last updated: 2026-03-16_

---

## 1. What IS working

| Component | Status |
|---|---|
| Main app server (`node server.js`) | ✅ Running |
| SQLite DB (`data/liturgy-turner.db`) | ✅ Present, 1.3MB |
| word_dictionary | ✅ 6,403 entries |
| page_sections | ✅ 366 rows (183 pages × 2 PDFs) |
| aggregated_fingerprints | ✅ 34 pages (pages 3–36, from 2 training sessions) |
| training-data/ JSON files | ✅ Full set present (fingerprints.json: 183 pages, live-tracker-data.json: 183 pages, 107 transitions) |
| TypeScript build (`npm run check`) | ✅ Clean |
| Release gate (`verify-release-gate.sh`) | ✅ All checks pass |
| PDF files uploaded | ✅ 3 PDFs in uploads/, 183 pages each |

---

## 2. What is NOT working — the exact failure chain

### Blocker 1 (CRITICAL): Agent audio API is unreachable from the app server

- `node audio-api.mjs` IS running as a process (`agent/audio-api.mjs`)
- But it **does not appear to be binding to a reachable port** from the app server's perspective
- `POST /api/agent/feed-audio` → server proxies to `AGENT_AUDIO_URL` → **fetch failed / 500**
- `POST /api/agent/start-recognition` → **500 / "agent-unavailable"**
- `agent/run-gateway.sh` requires a **vendored Clawdbot build** at `vendor/clawdbot-main/dist/entry.js` — that directory **does not exist** on this Mac mini

**Result:** Every time a user clicks Start in Live mode, the agent path immediately fails. The client falls back to `postToLiturgyFallback()` — but that fallback sends raw audio Float32Array to `/api/liturgy/process`, which uses the server-side `LiturgyPageTracker` with Meyda. That path CAN work, but only if recognition actually fires.

### Blocker 2 (CRITICAL): App server is returning 403 on all endpoints when hit from localhost curl

- `GET http://127.0.0.1:5000/` → 403
- `GET http://127.0.0.1:5000/api/liturgy/status` → 403  
- The release-gate script passes, suggesting the app was responding earlier; this may indicate the app restarted and is now in a broken/auth-locked state, OR it's binding to a different interface/port right now
- **The app may not actually be serving the Live UI to a browser either**

### Blocker 3: PDF identity mismatch

- The **aggregated fingerprints** (the data Live mode loads for matching) are stored under:
  - `pdf_id = 74a84c401264aa46`
  - `pdf_path = /uploads/pdfs/30d97eb7de21236a69d303d77b88251d.pdf`
- The **uploaded files** in the DB are named:
  - `liturgy-1771152785458-253004397.pdf`
  - `liturgy-1771168790131-630473690.pdf`
  - All have `pdfId = 14d64d2ecbe5fa4f811bbccd255bd0f40cd1224347ab6bfedb8e41fffdcf933d`
- **The PDF the Live UI will auto-recover** (latest file) has a completely different pdfId than the one the fingerprints are stored under.
- When Live loads, it queries `/api/aggregated-fingerprints?pdfId=<current PDF id>` → returns 0 fingerprints → `fingerprintStatus = "none"` → fingerprint matching is disabled entirely.
- The coordinator then runs in `ngram_only_mode` — which requires the agent (Blocker 1) to produce transcripts.

### Blocker 4: 14% average confidence from audio API — is it enough?

- The audio API uses 1,366 MFCC acoustic patterns from the armenian-learner skill
- 0.14 average confidence is **too low to trigger page turns** — the threshold in `LiturgyPageTracker` is 0.75
- Even if the audio API were reachable, it would only fire a page turn on strong matches (confidence > 0.8 per `audio-api.mjs`), which the current pattern database rarely produces
- Root cause: patterns were trained on a different recording/environment, and there are only 34 pages of fingerprints covering pages 3–36 out of 183

---

## 3. Training status

| Data | Status |
|---|---|
| fingerprints.json (file-based) | 183 pages — from YouTube audio, old training run |
| aggregated_fingerprints (DB) | 34 pages (3–36) — from 2 in-app training sessions Feb 2026 |
| page_sections (DB) | 183 pages — text-based, looks complete |
| word_dictionary (DB) | 6,403 words — healthy |
| Active training process | None running |
| Training coverage for Live mode | **Partial** — only pages 3–36 in DB fingerprints; rest not captured via in-app training |

---

## 4. Local runtime requirements

- **No Docker required** — app runs natively as `node server.js`
- **Agent audio API** (`agent/audio-api.mjs`) needs to run separately and be reachable; currently broken
- **Vendored Clawdbot** (`vendor/clawdbot-main/`) is referenced by `agent/run-gateway.sh` but **does not exist** — the zip extraction (`script/setup-clawdbot-from-zip.sh`) was never run on this Mac mini
- **No PostgreSQL** — SQLite only, file at `data/liturgy-turner.db`

---

## 5. Single most impactful fix

**Fix the PDF identity mismatch so existing fingerprints are actually used.**

The 34 trained fingerprints are real and usable. The app just can't find them because the current PDF has a different `pdfId`. 

Fix: either
- (a) Re-link the current PDF's pdfId to `74a84c401264aa46` in the DB, **or**
- (b) Re-run the in-app training session with the currently-loaded PDF so fingerprints are stored under its pdfId

This alone would unlock fingerprint matching in Live mode without needing the agent at all — the coordinator falls back to fingerprint-only mode and would at least have real data to work with for pages 3–36.

The agent/audio-API path is a secondary fix (run `setup-clawdbot-from-zip.sh` or start `agent/audio-api.mjs` on a known port with the correct `AGENT_AUDIO_URL` env var set in the app).

---

## Summary

```
Pages not turning because:
1. App may be in 403 state (restart needed)
2. Agent audio API unreachable → fallback fires but confidence too low
3. Fingerprints loaded for wrong pdfId → fingerprint matching disabled
4. Only 34/183 pages have trained fingerprints regardless

Fix order:
1. Restart app (node server.js / npm run dev)
2. Fix pdfId mismatch → fingerprints become active for pages 3–36
3. Add more training sessions to cover pages 37–183
4. Fix agent audio API (setup-clawdbot-from-zip.sh)
```
