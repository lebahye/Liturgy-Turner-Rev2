# Installation Guide – Liturgy Audio Controller

## 1. Copy Files
```
cd ~/Liturgy-Turner-Rev2/agent/skills
mkdir -p liturgy-audio-controller
# place index.js, package.json, README.md, SKILL.md, test.js, data/... etc. into this directory
```

## 2. Install Dependencies
```
cd ~/Liturgy-Turner-Rev2/agent/skills/liturgy-audio-controller
npm install
```
This installs `mic`, `node-record-lpcm16`, `axios`, and `fuse.js` locally.

## 3. Configure Clawdbot
Edit `~/Liturgy-Turner-Rev2/agent/clawdbot.json5` and merge:
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
Adjust values for your environment.

## 4. Ensure OpenAI Credentials
Set `OPENAI_API_KEY` in the environment the embedded gateway runs under (e.g. export it before `npm run agent:start`). The skill reads `process.env.OPENAI_API_KEY` via the config; the example config references `${OPENAI_API_KEY}`.

## 5. Restart Embedded Gateway
Restart the project’s gateway (`npm run agent:start` or `npm run local:up`) so the new skill is loaded.

## 6. Verify
Run `node test.js` (see next section) and send bot commands such as `liturgy status` to confirm the skill responds.

## 7. Optional – Microphone Test
Before live use, confirm the mic works:
```
arecord -l
```
If no devices appear, configure audio access (especially under WSL).
