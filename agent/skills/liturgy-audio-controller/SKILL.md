---
name: liturgy-audio-controller
description: Real-time audio processing for automatic liturgy page turning with audio quality validation
---
# Liturgy Audio Controller – Skill Reference (Enhanced)

## Purpose
Real-time liturgy monitoring: transcribe Armenian/English speech, match against a phrase database, and command the Liturgy Turner app to update the displayed page. When training mode is enabled, manual overrides reinforce or add new phrases so the matcher improves automatically.

**New in Enhanced Version:**
- Audio quality validation before training
- Sequential page logic with confidence boosting
- Impossible jump detection
- Enhanced confidence scoring

## Entry Point
- `index.js` exports the Clawdbot skill definition.
- Requires the Clawdbot runtime to provide `context.openai` (with audio transcription access) and `context.skillConfig` (merged from `clawdbot.json5`).

## Tool Surface
| Tool | Description | Notes |
| --- | --- | --- |
| `validate_audio_quality` | **NEW** Validate audio file quality before training | Checks sample rate, duration, bitrate, codec, file size. Returns quality rating and recommendations. |
| `start_liturgy_listening` | Start microphone capture and transcription loop | Creates a `LiturgyAudioController` instance (cached on `context`). Requires OpenAI Whisper access. |
| `stop_liturgy_listening` | Stop microphone capture | Safe to call even if already stopped. |
| `set_liturgy_page` | Manually set the liturgy page | Uses the same `setPage` helper, confidence forced to `1.0`. While training mode is on, the most recent transcription is labeled with this page and persisted for future matching. |
| `get_liturgy_status` | Inspect current state | Returns listening status, current page, config, buffer usage, DB entry count, and stored training samples. |
| `save_liturgy_training` | Persist training samples to `data/` | Writes `training-<timestamp>.json`, resets in-memory buffer. |

## NEW: Audio Quality Validation

### Usage
```javascript
validate_audio_quality({
  audioFile: "/path/to/recording.wav"
})
```

### Output
```json
{
  "success": true,
  "quality": "EXCELLENT" | "GOOD" | "POOR" | "UNUSABLE",
  "recommendation": "Proceed with training",
  "filePath": "/path/to/recording.wav",
  "fileSize": 479000000,
  "fileSizeMB": "456.81",
  "sampleRate": 44100,
  "channels": 2,
  "bitDepth": 16,
  "duration": 5400.5,
  "durationMinutes": "90.01",
  "bitrate": 1411200,
  "codec": "pcm_s16le",
  "checks": [
    {
      "check": "Sample Rate",
      "status": "EXCELLENT",
      "value": 44100,
      "message": "High quality sample rate"
    },
    {
      "check": "Duration",
      "status": "GOOD",
      "value": "90.01 min",
      "message": "Duration within expected range (30-120 min)"
    }
  ],
  "issues": []
}
```

### Quality Ratings
- **EXCELLENT**: High quality audio, ideal for training
- **GOOD**: Acceptable quality, may have minor issues
- **POOR**: Low quality, training may be affected
- **UNUSABLE**: Critical issues, cannot be used

### Checks Performed
1. **Sample Rate**: Minimum 16kHz recommended, 44.1kHz+ excellent
2. **Duration**: Expected range 30-120 minutes for full liturgy
3. **Channels**: Mono ideal, stereo acceptable
4. **Bitrate**: Minimum 64kbps, 128kbps+ excellent
5. **File Size**: Validates consistency with duration and quality

## Enhanced Confidence Scoring

### Sequential Logic
The system now adjusts confidence based on page sequence:

**Boosts (increases confidence):**
- Next page (+1): +10% boost (configurable via `sequentialBoost`)
- Page +2: +5% boost

**Penalties (decreases confidence):**
- Backwards jump: -90% (pages don't go backwards)
- Large forward jump (>5 pages): -70% (likely error)
- Medium jump (3-5 pages): -10-30% (possible but unusual)

### Configuration
```json
{
  "confidenceThreshold": 0.85,
  "sequentialBoost": 0.10,
  "maxPageJump": 5
}
```

### Example
```
Current page: 5
Detected: Page 6
Fuzzy match: 0.80

Sequential logic: +0.10 (next page)
Final confidence: 0.90 ✅ TURN PAGE

---

Current page: 5
Detected: Page 50
Fuzzy match: 0.85

Sequential logic: -0.60 (impossible jump)
Final confidence: 0.26 ❌ DON'T TURN
```

## Signal Flow
```
Mic → PCM buffer (3 s chunks) → WAV wrapper → Whisper transcription →
Fuse.js fuzzy match → Sequential confidence adjustment → Confidence gate →
POST /api/control/page/set
                                                 ↘ (training) DB upsert
```

## Configuration Keys
| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `apiEndpoint` | string | `http://localhost:5000` | Base URL for Liturgy Turner control API. |
| `confidenceThreshold` | number | `0.85` | Minimum confidence (0–1) required to auto-turn. |
| `sequentialBoost` | number | `0.10` | Confidence boost for sequential page (page+1). |
| `maxPageJump` | number | `5` | Maximum allowed page jump without major penalty. |
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
- `fluent-ffmpeg` – audio quality analysis (NEW).
- `openai` (peer dependency) – Whisper transcription API.

## Runtime Expectations
- OpenAI API key provided via environment variable (`OPENAI_API_KEY`), so the embedded agent has access to Whisper.
- Microphone device available to the OS, producing 16-bit PCM.
- Liturgy Turner backend running and reachable at `apiEndpoint`.
- ffmpeg binary installed on system (for audio quality validation).

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
- Enhanced logging now includes confidence reasoning (base score + adjustments).

## Notes
- Audio chunks are wrapped in a WAV header before Whisper calls to avoid format errors.
- `trainingMode` stores audio snippets in memory as base64; call `save_liturgy_training` periodically if long sessions run.
- Buffer sizing is computed by byte length, ensuring transcription windows are consistent regardless of chunking from `mic`.
- Sequential logic prevents impossible page jumps (page 5 → 50) and boosts confidence for expected transitions (page 5 → 6).
- Audio quality validation helps prevent poor training data from degrading system performance.

## Changelog

### Version 2.0 (2026-02-20)
- **Added:** `validate_audio_quality` tool for pre-training audio validation
- **Added:** Sequential page logic with confidence boosting
- **Added:** Impossible jump detection (backwards, large forward jumps)
- **Added:** Enhanced confidence scoring with detailed reasoning
- **Added:** Configuration options for `sequentialBoost` and `maxPageJump`
- **Improved:** Logging now includes confidence reasoning details
