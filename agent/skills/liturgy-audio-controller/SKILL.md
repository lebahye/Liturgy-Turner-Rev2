# Liturgy Audio Controller – Skill Reference

## Purpose
Real-time liturgy monitoring: transcribe Armenian/English speech, match against a phrase database, and command the Liturgy Turner app to update the displayed page. When training mode is enabled, manual overrides reinforce or add new phrases so the matcher improves automatically.

## Entry Point
- `index.js` exports the Clawdbot skill definition.
- Requires the Clawdbot runtime to provide `context.openai` (with audio transcription access) and `context.skillConfig` (merged from `clawdbot.json5`).

## Tool Surface
| Tool | Description | Notes |
| --- | --- | --- |
| `start_liturgy_listening` | Start microphone capture and transcription loop | Creates a `LiturgyAudioController` instance (cached on `context`). Requires OpenAI Whisper access. |
| `stop_liturgy_listening` | Stop microphone capture | Safe to call even if already stopped. |
| `set_liturgy_page` | Manually set the liturgy page | Uses the same `setPage` helper, confidence forced to `1.0`. While training mode is on, the most recent transcription is labeled with this page and persisted for future matching. |
| `get_liturgy_status` | Inspect current state | Returns listening status, current page, config, buffer usage, DB entry count, and stored training samples. |
| `save_liturgy_training` | Persist training samples to `data/` | Writes `training-<timestamp>.json`, resets in-memory buffer. |

## Signal Flow
```
Mic → PCM buffer (3 s chunks) → WAV wrapper → Whisper transcription →
Fuse.js fuzzy match → Confidence gate → POST /api/control/page/set
                                                 ↘ (training) DB upsert
```

## Configuration Keys
| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `apiEndpoint` | string | `http://localhost:5000` | Base URL for Liturgy Turner control API. |
| `confidenceThreshold` | number | `0.85` | Minimum confidence (0–1) required to auto-turn. |
| `language` | string | `armenian` | Whisper language (`armenian` → `hy`, `english` → `en`). |
| `sampleRate` | number | `16000` | Microphone sample rate (Hz). |
| `bufferDuration` | number | `3000` | Buffer duration in milliseconds before running transcription. |
| `trainingMode` | boolean | `false` | When true, store audio+transcription snippets and promote overrides into the liturgy database. |

## Data Files
- `data/liturgy-database.json` – Phrase entries used for matching. Entries created via training mode include `"source": "training"` and timestamps.
- Training exports (`save_liturgy_training`) are written to `data/training-<timestamp>.json`.

### Liturgy Entry Structure
```json
{
  "page": 24,
  "section": "Anaphora",
  "armenian": "…",
  "transliteration": "…",
  "text": "…",
  "keywords": ["…"],
  "source": "training",
  "createdAt": "2026-02-06T19:21:00.000Z"
}
```
Adding or reinforcing entries triggers an immediate rewrite of `liturgy-database.json` and the fuzzy matcher is refreshed in memory.

## External Dependencies
- `mic` – microphone capture (raw PCM).
- `axios` – HTTP client for Liturgy Turner API.
- `fuse.js` – fuzzy text matching.
- `node-record-lpcm16` – bundled for completeness but the skill currently uses `mic` directly.
- `openai` (peer dependency) – Whisper transcription API.

## Runtime Expectations
- OpenAI API key provided via environment variable (`OPENAI_API_KEY`), so the embedded agent has access to Whisper.
- Microphone device available to the OS, producing 16-bit PCM.
- Liturgy Turner backend running and reachable at `apiEndpoint`.

## Training & Reinforcement
- Enable training mode (`trainingMode: true` or `start training`).
- When the bot guesses incorrectly, issue a manual override (tool `set_liturgy_page`).
- The most recent transcription chunk is immediately labeled with that page and either added as a new DB entry or merged into existing keywords.
- The phrase database grows over time; no restart required.

## Testing
- `node test.js` (see file for specifics) – basic smoke tests for database load + API connectivity. Extend as needed.
- Consider adding an integration test that boots the embedded gateway and exercises the skill end-to-end.

## Logging
- Logs prefixed with `[liturgy-audio]` are emitted via `console`. Review embedded gateway logs for live diagnostics.

## Notes
- Audio chunks are wrapped in a WAV header before Whisper calls to avoid format errors.
- `trainingMode` stores audio snippets in memory as base64; call `save_liturgy_training` periodically if long sessions run.
- Buffer sizing is computed by byte length, ensuring transcription windows are consistent regardless of chunking from `mic`.
