# Liturgy Audio Controller

Real-time audio processing for automatic liturgy page turning. This Clawdbot skill listens to the deacon/priest during Armenian liturgy, transcribes what is spoken, matches it against a liturgy phrase database, and calls your Liturgy Turner API to flip the on-screen page automatically. When training mode is enabled, manual corrections teach the bot new phrases so it improves over time.

## Quick Start

1. **Copy the skill**
   ```bash
   cd ~/Liturgy-Turner-Rev2/agent/skills
   mkdir -p liturgy-audio-controller
   # copy these files into the folder
   cd liturgy-audio-controller
   npm install
   ```

2. **Enable the skill**
   Edit `~/Liturgy-Turner-Rev2/agent/clawdbot.json5` and add:
   ```json5
   {
     "skills": {
       "liturgy-audio-controller": {
         "enabled": true,
         "config": {
           "apiEndpoint": "http://localhost:5000",
           "confidenceThreshold": 0.85,
           "language": "armenian",
           "sampleRate": 16000,
           "bufferDuration": 3000,
           "trainingMode": false
         }
       }
     }
   }
   ```

3. **Run the test script**
   ```bash
   node test.js
   ```
   Verifies the database loads and your API endpoint responds.

4. **Restart your embedded gateway** so the skill is picked up.

5. **Use the bot** (Telegram or embedded web chat) to run commands such as:
   ```
   start listening
   liturgy status
   next page
   ```

## Bot Commands

| Command | Description |
| --- | --- |
| `start listening` | Begin microphone capture and transcription |
| `stop listening` | Halt audio monitoring |
| `liturgy status` | Show current page, config, buffer stats, and training info |
| `next page` / `previous page` | Manual page control |
| `go to page 42` | Jump directly to a page |
| `start training` | Enable learning mode (stores audio/transcript pairs and allows reinforcement) |
| `this is page 10` | (Handled by upstream command router) ultimately invokes `set page 10` |
| `set page 15` | Manual override; while training mode is enabled, the most recent transcription is tagged with page 15 and saved to the phrase database |
| `save training data` | Export collected training samples |

## Configuration Options

| Option | Default | Notes |
| --- | --- | --- |
| `apiEndpoint` | `http://localhost:5000` | Liturgy Turner API base URL |
| `confidenceThreshold` | `0.85` | Require this confidence to auto-turn |
| `language` | `armenian` | Whisper language (`armenian` or `english`) |
| `sampleRate` | `16000` | Microphone sample rate (Hz) |
| `bufferDuration` | `3000` | Process audio every N ms |
| `trainingMode` | `false` | Collect correction data while true |

## Self-Learning Workflow

1. Enable training mode with `start training`.
2. Let the bot listen; when it guesses wrong, issue a manual override (e.g., `set page 24`).
3. The most recent transcription chunk is tagged with that page. If it’s new, it’s appended to `data/liturgy-database.json`; if it matches an existing entry, its keywords are reinforced.
4. The updated database is persisted immediately and the fuzzy matcher is reloaded, so subsequent matches take the correction into account.
5. Periodically run `save training data` to archive recent audio/transcript samples (optional).

## Liturgy Database

Editable at `data/liturgy-database.json`. Each entry contains:
```json
{
  "page": 25,
  "section": "Anaphora",
  "armenian": "...",
  "transliteration": "...",
  "text": "...",
  "keywords": ["..."]
}
```
Add as many entries as necessary for your liturgy book and phrases your clergy use often. Entries created via training mode are annotated with `"source": "training"` and timestamp metadata.

## Requirements

- Microphone access on the machine running Clawdbot (WSL users may prefer a USB mic passed through).
- OpenAI API key provided via environment variable (`OPENAI_API_KEY`) so the skill can call Whisper.
- Liturgy Turner web app running locally on port 5000.

## Testing Strategy

1. **Manual control** — Use `set page` and `next page` commands to ensure API calls succeed.
2. **Recorded audio** — Feed a sample liturgy recording through `start listening` to validate transcription + matching.
3. **Live training** — Enable `start training` during real services to collect corrections.
4. **Autonomous** — When confident, leave training off and let the bot turn pages automatically.

## Troubleshooting

- **No audio detected**: confirm `mic` can access your device; test with `arecord -l`.
- **Low accuracy**: add more entries, lower `confidenceThreshold`, or collect training data.
- **Slow response**: adjust `bufferDuration` smaller or ensure API responds within 5s.
- **Whisper rejects audio**: verify the microphone produces 16-bit PCM; the skill wraps chunks in WAV headers before sending.

For deeper details see `SKILL.md` and `INSTALL.md` in this folder.
