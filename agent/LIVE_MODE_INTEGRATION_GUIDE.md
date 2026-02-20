# Live Mode Integration Guide
## Connecting Armenian Learner to Live Mode Voice Detection

## 🎯 The Problem

**Current State:**
- ✅ Live Mode UI exists (Voice Detection controls, sensitivity slider)
- ✅ Armenian Learner skill exists (1,366 words learned)
- ❌ They're NOT connected
- ❌ Sensitivity slider does nothing
- ❌ "Waiting for speech..." never changes
- ❌ No automatic page turning based on audio

**Goal:** Connect Live Mode's microphone → My Armenian skill → Page turning

---

## 📂 Files to Edit (On Host Machine)

You need to edit these files in:
`~/clawd/projects/Liturgy-Turner-Rev2/`

### 1. **Client Side** (Frontend - where "Voice Detection" lives)

Find the Live Mode component - likely:
- `client/src/pages/Live.tsx` or `client/src/pages/LiveMode.tsx`
- `client/src/components/VoiceDetection.tsx` (if separate)

**What to look for:**
```tsx
// Find something like:
const [sensitivity, setSensitivity] = useState(0.4);
const [speechStatus, setSpeechStatus] = useState("Waiting for speech...");
```

**What to fix:**
1. **Capture microphone audio** properly
2. **Send audio chunks** to backend API
3. **Update status** based on detection
4. **Wire sensitivity slider** to actually do something

### 2. **Server Side** (Backend - audio processing)

Files to check:
- `server/index.ts` - main server file
- `server/routes/control.ts` - page control routes
- `server/routes/live.ts` (if exists) - live audio handling

**What to add:**
- Route to receive audio chunks: `POST /api/live/audio-chunk`
- Connect to armenian-learner skill (in Docker)
- Return detected page number

---

## 🔧 Integration Steps

### Step 1: Frontend - Capture Audio

**In Live.tsx:**

```typescript
// Add audio capture when "Start" is pressed
const startVoiceDetection = async () => {
  try {
    // Get microphone access
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Create audio context
    const audioContext = new AudioContext({ sampleRate: 44100 });
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    
    processor.onaudioprocess = (e) => {
      const audioData = e.inputBuffer.getChannelData(0);
      
      // Send to backend every 5 seconds worth of audio
      if (audioBuffer.length >= 44100 * 5) {
        sendAudioChunk(audioBuffer);
        audioBuffer = [];
      }
      audioBuffer.push(...audioData);
    };
    
    source.connect(processor);
    processor.connect(audioContext.destination);
    
    setIsRunning(true);
    setSpeechStatus("Listening...");
    
  } catch (error) {
    console.error('Microphone access denied:', error);
    setSpeechStatus("Microphone error");
  }
};

// Send audio to backend
const sendAudioChunk = async (audioData: Float32Array) => {
  try {
    // Convert to base64
    const buffer = Buffer.from(audioData.buffer);
    const base64Audio = buffer.toString('base64');
    
    const response = await fetch('/api/armenian-learner/audio-chunk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioData: base64Audio,
        sampleRate: 44100
      })
    });
    
    const result = await response.json();
    
    if (result.currentPage) {
      // Update page automatically!
      setCurrentPage(result.currentPage);
      setSpeechStatus(`Detected: Page ${result.currentPage}`);
    } else {
      setSpeechStatus("Listening...");
    }
    
  } catch (error) {
    console.error('Error sending audio:', error);
  }
};
```

### Step 2: Frontend - Wire Sensitivity Slider

```typescript
// Make sensitivity actually affect detection threshold
const handleSensitivityChange = (value: number) => {
  setSensitivity(value);
  
  // Send to backend to update threshold
  fetch('/api/armenian-learner/set-sensitivity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sensitivity: value })
  });
};
```

### Step 3: Backend - Process Audio

**In server/index.ts (or wherever routes are registered):**

```typescript
import armenianLearnerRoutes from './routes/armenian-learner';
app.use('/api/armenian-learner', armenianLearnerRoutes);
```

**The routes file already exists** at `/app/server/routes/armenian-learner.ts` but needs to be:
1. Copied to the HOST machine
2. Actually connected to my skill in Docker

### Step 4: Connect Backend to Docker Skill

**Two options:**

**Option A: HTTP API** (Simpler)
Make the armenian-learner skill accessible via HTTP:
- Run a small Express server inside Docker
- Expose it on a port
- Backend calls `http://localhost:PORT/recognize` with audio

**Option B: Shared Volume** (Current setup)
The skill writes detection results to a file:
- `/app/data/current-detection.json`
- Backend reads this file periodically
- Updates page based on contents

---

## 🎯 Quick Fix Path (What I Recommend)

**For NOW (to get it working fast):**

1. **Copy my API routes** from Docker to host:
   ```bash
   docker cp liturgy-agent:/app/server/routes/armenian-learner.ts ~/clawd/projects/Liturgy-Turner-Rev2/server/routes/
   ```

2. **Register the routes** in your server's main file

3. **Update Live.tsx** to send audio chunks (code above)

4. **Test:** Play YouTube audio, watch it detect pages!

---

## 🧪 Testing the Integration

**When working:**
- "Waiting for speech..." changes to "Listening..."
- When Armenian detected: "Detected: Page X" appears
- Page number updates automatically
- Sensitivity slider affects how easily it detects

**Console logs to add:**
```javascript
console.log('[live-mode] Audio chunk sent:', audioData.length, 'samples');
console.log('[armenian-learner] Received audio, processing...');
console.log('[armenian-learner] Detected page:', pageNumber, 'confidence:', confidence);
```

---

## 📝 Summary

**The flow should be:**
```
Your Microphone
    ↓
Live Mode (captures audio every 5s)
    ↓
POST /api/armenian-learner/audio-chunk
    ↓
Docker: My Armenian Skill (1,366 words!)
    ↓
Match against learned patterns
    ↓
Return: { currentPage: 15, confidence: 0.87 }
    ↓
Live Mode updates page automatically
```

---

## ⚡ Next Steps

1. **Find the Live Mode source file** on your host machine
2. **Add audio capture** (code above)
3. **Wire up the API calls**
4. **Test with YouTube audio**
5. **Celebrate when it works!** 🎉

---

**Location of files:**
- Host: `~/clawd/projects/Liturgy-Turner-Rev2/`
- Docker routes: `/app/server/routes/armenian-learner.ts` (needs to be copied to host)
- My skill: `/app/agent/skills/armenian-learner/` (already working!)

**I can't edit the host files from Docker, but I can help you write the exact code once you tell me where the Live Mode component is!**
