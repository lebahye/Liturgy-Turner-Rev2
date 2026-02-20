# 🎯 START HERE - Quick Integration Guide

**Status:** V2 Page Matcher is ready. Just needs to be wired to your frontend.

---

## The Situation

✅ **What works:**
- Page matching algorithm (tested and validated)
- Audio processing
- Page detection
- All the brain logic

❌ **What's missing:**
- Your Express server doesn't have the API routes yet
- Frontend isn't sending audio to the API

---

## Quick Fix (5 Minutes)

### Step 1: Add to your Express server

Find your server file (probably `server.js` or `backend/index.js`) and add this:

**At the top:**
```javascript
import skill from './agent/skills/armenian-learner/index.js';
global.armenianLearnerSkill = skill.default;
```

**After `const app = express()`:**
```javascript
// Armenian Learner API
app.post('/api/armenian-learner/start-recognition', async (req, res) => {
  const result = await global.armenianLearnerSkill.tools.start_armenian_recognition.execute({});
  res.json(result);
});

app.post('/api/armenian-learner/audio-chunk', async (req, res) => {
  const { audioData, sensitivity } = req.body;
  
  if (sensitivity) {
    global.armenianLearnerSkill.setSensitivity(sensitivity);
  }
  
  const buffer = Buffer.from(audioData, 'base64');
  const audioArray = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
  
  global.armenianLearnerSkill.feedAudio(audioArray);
  
  res.json({ success: true });
});

app.post('/api/armenian-learner/set-page', async (req, res) => {
  const { page } = req.body;
  global.armenianLearnerSkill.setCurrentPage(page);
  res.json({ success: true, page });
});

app.get('/api/armenian-learner/status', async (req, res) => {
  const status = global.armenianLearnerSkill.tools.get_armenian_status.execute();
  res.json(status);
});

app.get('/api/armenian-learner/diagnostics', async (req, res) => {
  const diag = global.armenianLearnerSkill.getDiagnostics();
  res.json(diag);
});
```

### Step 2: Restart your server

### Step 3: Test it

```bash
curl http://localhost:5000/api/armenian-learner/status
```

You should see JSON like:
```json
{
  "mode": "idle",
  "ready": true,
  "totalPatterns": 1366,
  "version": "v2-page-matcher"
}
```

✅ **If this works, the backend is connected!**

❌ **If 404 error, the routes aren't loaded properly.**

---

## Next: Check if Audio is Flowing

### When Live Mode is running:

```bash
curl http://localhost:5000/api/armenian-learner/diagnostics
```

Should show:
```json
{
  "chunksReceived": 45,
  "totalDurationSeconds": 22.5,
  "lastChunkSecondsAgo": "0.8",
  "isReceivingAudio": true
}
```

- ✅ `isReceivingAudio: true` → Audio is flowing, algorithm is running
- ❌ `chunksReceived: 0` → Audio not reaching the API, check frontend

See **`DIAGNOSTICS_GUIDE.md`** for full troubleshooting.

---

## What You'll See When It Works

1. **Backend logs:**
```
[armenian-learner] Initialized (with V2 page matcher + diagnostics)
[page-matcher] Loaded 183 page fingerprints
[live-recognizer-v2] Started, listening for audio...
[live-recognizer-v2] Buffer: 50% full
[live-recognizer-v2] Buffer: 100% full
[live-recognizer-v2] Best match: Page 7 (confidence: 85%, triggerable: true)
[live-recognizer-v2] Top 5: p7:85%, p6:72%, p8:68%, p36:65%, p20:62%
```

2. **When page changes:**
```
[live-recognizer-v2] Best match: Page 8 (confidence: 78%, triggerable: true)
[live-recognizer-v2] 🎯 TRIGGERED! Advancing to page 8
```

3. **Frontend should advance to page 8!**

---

## Tuning

Start with **sensitivity at 40-50%**:
```bash
curl -X POST http://localhost:5000/api/armenian-learner/set-sensitivity \
  -H "Content-Type: application/json" \
  -d '{"sensitivity": 0.4}'
```

- Too many false advances? → Raise sensitivity (0.6-0.7)
- Missing pages? → Lower sensitivity (0.3-0.4)

---

## Full Documentation

- **`INTEGRATION_CHECKLIST.md`** - Complete wiring guide
- **`DIAGNOSTICS_GUIDE.md`** - Troubleshooting audio flow
- **`V2_PAGE_MATCHER_COMPLETE.md`** - Technical architecture
- **`STATUS_REPORT.md`** - What I tested and validated

---

## I'm Here to Help!

If something doesn't work:
1. Check `DIAGNOSTICS_GUIDE.md` first
2. Run the diagnostic endpoint
3. Tell me what you see and I'll help debug

**The hard part is done. This is just wiring! 🔌**
