# Audio Diagnostics Guide

## Problem: "Is audio actually reaching the skill?"

When things aren't working, the first question is: **Is audio data even getting to my code?**

I added diagnostics to answer this definitively.

---

## How to Use

### Option 1: Check via API endpoint

Add this to your server:
```javascript
app.get('/api/armenian-learner/diagnostics', async (req, res) => {
  const report = global.armenianLearnerSkill.getDiagnostics();
  res.json(report);
});
```

Then check:
```bash
curl http://localhost:5000/api/armenian-learner/diagnostics
```

### Option 2: It's already in the status

Diagnostics are automatically included when you call:
```bash
curl http://localhost:5000/api/armenian-learner/status
```

---

## What the Report Shows

```json
{
  "chunksReceived": 45,
  "totalSamples": 992250,
  "totalDurationSeconds": 22.5,
  "lastChunkSecondsAgo": "0.8",
  "avgChunkSize": 22050,
  "isReceivingAudio": true,
  "recentChunkSizes": [22050, 22050, 22050, 22050, 22050]
}
```

### Fields Explained:

- **`chunksReceived`** - How many audio chunks we've received total
  - ✅ Should increase every ~1 second
  - ❌ If 0 → Audio not reaching the API at all

- **`totalSamples`** - Total audio samples processed
  - At 44100 samples/second, this grows fast
  - Useful to see if we're processing audio

- **`totalDurationSeconds`** - How many seconds of audio we've processed
  - ✅ Should match roughly how long you've been playing audio
  - ❌ If 0 → No audio being processed

- **`lastChunkSecondsAgo`** - How long since last chunk arrived
  - ✅ Should be <2 seconds if audio is playing
  - ⚠️ 2-5 seconds → Chunks arriving slowly
  - ❌ >5 seconds or "never" → Audio stream stopped/broken

- **`avgChunkSize`** - Average chunk size (samples)
  - Should be consistent (typically ~22050 for 0.5s chunks)
  - ⚠️ Varies wildly → Frontend sending irregular chunks

- **`isReceivingAudio`** - Boolean health check
  - ✅ `true` → All good, audio flowing
  - ❌ `false` → Problem somewhere

- **`recentChunkSizes`** - Last 10 chunk sizes
  - Should be consistent
  - Useful for debugging irregular chunk delivery

---

## Interpreting Results

### ✅ Healthy Audio Stream

```json
{
  "chunksReceived": 45,
  "totalDurationSeconds": 22.5,
  "lastChunkSecondsAgo": "0.8",
  "isReceivingAudio": true
}
```

**Diagnosis:** Audio is flowing correctly. If pages aren't advancing, problem is likely:
- Sensitivity too high (lower it to 30-40%)
- Audio quality doesn't match fingerprints (YouTube compression)
- Wrong page set (set current page with `/set-page`)

---

### ❌ No Audio Reaching Skill

```json
{
  "chunksReceived": 0,
  "totalDurationSeconds": 0,
  "lastChunkSecondsAgo": "never",
  "isReceivingAudio": false
}
```

**Diagnosis:** Audio is not reaching the skill at all.

**Check:**
1. Is frontend calling `/api/armenian-learner/audio-chunk`?
   - Open browser DevTools → Network tab
   - Look for POST requests to that endpoint
   
2. Are the POST requests succeeding?
   - Check for 200 status codes
   - If 404 → Server doesn't have the routes
   - If 500 → Check server logs for errors

3. Is the audio data correctly encoded?
   - Should be base64 string in POST body
   - Check POST payload in DevTools

---

### ⚠️ Audio Stream Interrupted

```json
{
  "chunksReceived": 120,
  "totalDurationSeconds": 60.0,
  "lastChunkSecondsAgo": "15.3",
  "isReceivingAudio": false
}
```

**Diagnosis:** Audio WAS flowing but stopped 15 seconds ago.

**Check:**
1. Did the YouTube video pause/stop?
2. Did the microphone access get revoked?
3. Did the frontend encounter an error?
4. Check browser console for errors

---

## Using for Debugging

### 1. Before starting Live Mode
```bash
curl http://localhost:5000/api/armenian-learner/diagnostics
```

Should show:
```json
{
  "chunksReceived": 0,
  "totalDurationSeconds": 0,
  "lastChunkSecondsAgo": "never",
  "isReceivingAudio": false
}
```

### 2. Start Live Mode and play audio

Wait 5 seconds, then check again:
```bash
curl http://localhost:5000/api/armenian-learner/diagnostics
```

Should show:
```json
{
  "chunksReceived": 5-10,
  "totalDurationSeconds": 2.5-5.0,
  "lastChunkSecondsAgo": "0.5-1.0",
  "isReceivingAudio": true
}
```

### 3. If it's still at 0

**Problem is in frontend or server routing.**

Check in order:
1. Server has the routes loaded?
2. Frontend is capturing audio?
3. Frontend is POSTing to API?
4. Server is calling `skill.feedAudio()`?

---

## Frontend Integration Checklist

Use diagnostics to verify each step:

### Step 1: Start recognition
```javascript
await fetch('/api/armenian-learner/start-recognition', { method: 'POST' });
```

### Step 2: Check status
```javascript
const status = await fetch('/api/armenian-learner/status').then(r => r.json());
console.log('Status:', status);
// Should show: { mode: 'recognizing', isReceivingAudio: false }
```

### Step 3: Send test audio chunk
```javascript
// Create fake audio (1 second of silence)
const fakeAudio = new Float32Array(44100);
const buffer = new Uint8Array(fakeAudio.buffer);
const base64 = btoa(String.fromCharCode(...buffer));

await fetch('/api/armenian-learner/audio-chunk', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ audioData: base64 })
});
```

### Step 4: Check diagnostics again
```javascript
const diag = await fetch('/api/armenian-learner/diagnostics').then(r => r.json());
console.log('Diagnostics:', diag);
// Should show: { chunksReceived: 1, isReceivingAudio: true }
```

If this works, your integration is correct! Just need to send real audio instead of silence.

---

## Quick Troubleshooting

| Symptom | Diagnosis | Fix |
|---------|-----------|-----|
| `chunksReceived: 0` | Audio not reaching skill | Check frontend → server connection |
| `lastChunkSecondsAgo: "never"` | Same as above | Check API routes loaded |
| `isReceivingAudio: false` | No recent audio | Check if audio capture is active |
| `avgChunkSize` varies wildly | Irregular chunks | Fix frontend audio capture timing |
| `chunksReceived` high but pages not advancing | Audio processed but not matched | Lower sensitivity or check page fingerprints |

---

## Bottom Line

**These diagnostics remove all ambiguity.**

Before: "Nothing is happening" (could be 10 different problems)
After: "Audio chunks: 0" (problem is clearly in the connection, not the algorithm)

Use this to pinpoint exactly where the chain breaks! 🔍
