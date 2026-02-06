# Liturgy Audio Controller – Skill Reference

## Purpose
Real-time liturgy monitoring: transcribe Armenian/English speech, match against a phrase database, and command the Liturgy Turner app to update the displayed page.

## Entry Point
- `index.js` exports the Clawdbot skill definition.
- Requires the Clawdbot runtime to provide `context.openai` (with audio transcription access) and `context.skillConfig` (merged from `clawdbot.json5`).

## Tool Surface
| Tool | Description | Notes |
| --- | --- | --- |
| `start_liturgy_listening` | Start microphone capture and transcription loop | Creates a `LiturgyAudioController` instance (cached on `context`). Requires OpenAI Whisper access. |
| `stop_liturgy_listening` | Stop microphone capture | Safe to call even if already stopped. |
| `set_liturgy_page` | Manually set the liturgy page | Uses the same `setPage` helper, confidence forced to `1.0`. |
| `get_liturgy_status` | Inspect current state | Returns listening status, current page, config, DB entry count, and stored training samples. |
| `save_liturgy_training` | Persist training samples to `data/` | Writes `training-<timestamp>.json`, resets in-memory buffer. |

## Configuration Keys
| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `apiEndpoint` | string | `http://localhost:5000` | Base URL for Liturgy Turner control API. |
| `confidenceThreshold` | number | `0.85` | Minimum confidence (0–1) required to auto-turn. |
| `language` | string | `armenian` | Whisper language (`armenian` → `hy`, `english` → `en`). |
| `sampleRate` | number | `16000` | Microphone sample rate (Hz). |
| `bufferDuration` | number | `3000` | Buffer duration in milliseconds before running transcription. |
| `trainingMode` | boolean | `false` | When true, store audio+transcription snippets for later analysis. |

## Data Files
- `data/liturgy-database.json` – List of phrase entries to match against.
- Training exports are written to `data/training-<timestamp>.json`.

### Liturgy Entry Structure
```json
{
  "page": 24,
  "section": "Anaphora",
  "armenian": "…",
  "transliteration": "…",
  "text": "…",
  "keywords": ["…"]
}
```
Adding more entries improves matching coverage.

## External Dependencies
Installed via `package.json` in this folder:
- `mic` – microphone capture.
- `node-record-lpcm16` – (implicit dependency of `mic` for raw PCM access).
- `axios` – HTTP client for Liturgy Turner API.
- `fuse.js` – fuzzy matching of transcribed text.

## Runtime Expectations
- OpenAI API configured in the embedded agent (Whisper endpoints accessible).
- Microphone device available to the host OS.
- Liturgy Turner backend running and reachable at `apiEndpoint`.

## Testing
- `node test.js` (see file for specifics) – basic smoke tests for database load + API connectivity. Extend as needed.

## Logging
- Logs prefixed with `[liturgy-audio]` are emitted via `console`. Review embedded gateway logs for live diagnostics.

## Notes
- Buffer sizing currently uses `audioBuffer.length` vs. `(sampleRate * bufferDuration) / 1000`, which is approximate because `mic` delivers arbitrary chunk sizes. Adjust if required.
- `trainingMode` stores raw audio buffers in memory; long sessions will grow usage. Call `save_liturgy_training` periodically.
