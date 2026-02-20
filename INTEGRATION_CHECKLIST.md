# Integration Checklist - What Needs to Happen

## Status: V2 Page Matcher ✅ READY, Integration ❌ NOT CONNECTED

The skill is built and validated. Now we need to wire it up to the frontend.

---

## The Missing Piece: Server Integration

**Problem:** The routes I created at `/app/server/routes/armenian-learner.ts` exist in the Docker container, but your **real Express server** (running on your laptop) doesn't know about them.

### Where is your server code?

The server is likely at one of these locations (ON YOUR LAPTOP, not in Docker):
- `~/liturgy-turner/server/index.js` or
- `~/liturgy-turner/backend/server.js` or  
- `~/liturgy-turner/src/server.ts`

---

## What Needs to Happen

### Option 1: Copy routes to your real server (RECOMMENDED)

1. **Find your server code** on your laptop
2. **Copy** `/app/server/routes/armenian-learner.ts` to your server's routes folder
3. **Load the skill** in your server:
   ```javascript
   // At the top of your server file
   import skill from '/app/agent/skills/armenian-learner/index.js';
   
   // Make it globally accessible
   global.armenianLearnerSkill = skill.default;
   ```

4. **Import and use the routes:**
   ```javascript
   import armenianLearnerRoutes from './routes/armenian-learner.ts';
   app.use('/api/armenian-learner', armenianLearnerRoutes);
   ```

5. **Restart your server**

### Option 2: Inline the API in your existing server

If you don't want a separate routes file, add this to your server:

```javascript
// At top
import skill from '/app/agent/skills/armenian-learner/index.js';
const armenianLearner = skill.default;

// API routes
app.get('/api/armenian-learner/status', async (req, res) => {
  const status = armenianLearner.tools.get_armenian_status.execute();
  res.json(status);
});

app.post('/api/armenian-learner/start-recognition', async (req, res) => {
  const result = await armenianLearner.tools.start_armenian_recognition.execute({
    onPageDetected: (page, confidence) => {
      // Broadcast to frontend via WebSocket or store in state
      console.log(`Page detected: ${page} (${confidence})`);
    }
  });
  res.json(result);
});

app.post('/api/armenian-learner/audio-chunk', async (req, res) => {
  const { audioData, sensitivity } = req.body;
  
  // Update sensitivity if provided
  if (sensitivity !== undefined) {
    armenianLearner.setSensitivity(sensitivity);
  }
  
  // Decode base64 audio
  const buffer = Buffer.from(audioData, 'base64');
  const audioArray = new Float32Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength / Float32Array.BYTES_PER_ELEMENT
  );
  
  // Feed to skill
  armenianLearner.feedAudio(audioArray);
  
  // Get current page detection
  const status = armenianLearner.tools.get_armenian_status.execute();
  
  res.json({
    success: true,
    currentPage: status.currentPage,
    confidence: status.confidence
  });
});

app.post('/api/armenian-learner/set-page', async (req, res) => {
  const { page } = req.body;
  const result = armenianLearner.setCurrentPage(page);
  res.json(result);
});

app.post('/api/armenian-learner/stop', async (req, res) => {
  const result = await armenianLearner.tools.stop_armenian.execute();
  res.json(result);
});
```

**Pro tip:** Add a diagnostics endpoint to check if audio is reaching the skill:

```javascript
app.get('/api/armenian-learner/diagnostics', async (req, res) => {
  const report = armenianLearner.getDiagnostics();
  res.json(report);
});
```

Then test: `curl http://localhost:5000/api/armenian-learner/diagnostics`

See `DIAGNOSTICS_GUIDE.md` for how to interpret the results!

---

## Frontend Changes Needed

### 1. Start Recognition on Live Mode

```javascript
async function startLiveMode() {
  // Start recognition
  await fetch('/api/armenian-learner/start-recognition', {
    method: 'POST'
  });
  
  // Start capturing audio
  startAudioCapture();
}
```

### 2. Send Audio Chunks

```javascript
async function sendAudioChunk(audioBuffer) {
  // Convert Float32Array to base64
  const bytes = new Uint8Array(audioBuffer.buffer);
  const base64 = btoa(String.fromCharCode(...bytes));
  
  // Get current sensitivity from slider
  const sensitivity = sensitivitySlider.value / 100; // 0-1
  
  // Send to API
  const response = await fetch('/api/armenian-learner/audio-chunk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audioData: base64,
      sampleRate: 44100,
      sensitivity
    })
  });
  
  const result = await response.json();
  
  // If page detected, advance!
  if (result.currentPage && result.currentPage !== getCurrentPage()) {
    advanceToPage(result.currentPage);
  }
}
```

### 3. Set Current Page Manually

When user manually changes pages, tell the skill:

```javascript
function onPageChange(newPage) {
  // Update UI
  setCurrentPage(newPage);
  
  // Tell the skill
  fetch('/api/armenian-learner/set-page', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page: newPage })
  });
}
```

---

## Testing the Integration

### 1. Check if API is loaded

In browser console:
```javascript
fetch('/api/armenian-learner/status')
  .then(r => r.json())
  .then(console.log);
```

Expected response:
```json
{
  "mode": "idle",
  "ready": true,
  "totalPatterns": 1366,
  "version": "v2-page-matcher"
}
```

### 2. Start recognition

```javascript
fetch('/api/armenian-learner/start-recognition', { method: 'POST' })
  .then(r => r.json())
  .then(console.log);
```

Expected:
```json
{
  "success": true,
  "message": "Recognition started (V2 page matcher)",
  "usingV2": true
}
```

### 3. Check backend logs

Look for:
```
[armenian-learner-api] Skill loaded
[armenian-learner] Initialized (with V2 page matcher)
[page-matcher] Loaded 183 page fingerprints
```

### 4. Test with audio

- Set page manually: `curl -X POST http://localhost:5000/api/armenian-learner/set-page -H "Content-Type: application/json" -d '{"page": 7}'`
- Play YouTube audio on page 7
- Watch for `[live-recognizer-v2] Best match: Page 7 (85%)`
- When transitioning to page 8, should see: `[live-recognizer-v2] 🎯 TRIGGERED! Advancing to page 8`

---

## What I've Validated

✅ V2 Page Matcher works correctly  
✅ Pages match themselves at 100%  
✅ Handles 30% noise  
✅ 33.4% score spread (good differentiation)  
✅ Temporal smoothing prevents flickering  
✅ Page transitions detected  

## What's Not Working Yet

❌ Frontend not sending audio to API  
❌ API routes not loaded by real server  
❌ No live testing with YouTube audio  

---

## Next Steps

1. **Find your server code** (on your laptop)
2. **Add the API routes** (Option 1 or Option 2 above)
3. **Update frontend** to send audio chunks
4. **Test with YouTube** audio
5. **Tune sensitivity** based on real results (start at 30-50%)
6. **Profit!** 🎯

Let me know when you're ready and I'll help with whichever piece you need!
