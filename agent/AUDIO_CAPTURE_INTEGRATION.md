# Audio Capture Integration Guide

## ✅ I Created the Audio Capture Module

**File:** `/app/agent/ArmenianLearnerAudioCapture.ts`

This is a **ready-to-use, copy-paste module** for your frontend.

---

## 🚀 How to Add It to Your App (3 Steps)

### Step 1: Copy the File

**On your laptop terminal:**
```bash
# Copy from Docker to your frontend
docker cp <container-name>:/app/agent/ArmenianLearnerAudioCapture.ts ./frontend/src/utils/

# Or if you're in the project directory:
cp /app/agent/ArmenianLearnerAudioCapture.ts ./src/utils/
```

### Step 2: Add to Your Live Mode Component

**Find your Live Mode component** (probably `LiveMode.tsx` or similar), and add:

```typescript
import { useEffect, useRef, useState } from 'react';
import { ArmenianLearnerAudioCapture } from '../utils/ArmenianLearnerAudioCapture';

function LiveMode() {
  const audioCapture = useRef<ArmenianLearnerAudioCapture | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [diagnostics, setDiagnostics] = useState<any>(null);

  // Initialize
  useEffect(() => {
    audioCapture.current = new ArmenianLearnerAudioCapture();
    
    // Set callback for page detection
    audioCapture.current.onPageDetected = (page, confidence) => {
      console.log(`🎯 Page ${page} detected (${(confidence * 100).toFixed(1)}%)`);
      // TODO: Call your page advance function here
      // Example: setCurrentPage(page);
    };

    return () => audioCapture.current?.stop();
  }, []);

  // Toggle listening
  const toggleListening = async () => {
    if (!audioCapture.current) return;

    if (isListening) {
      audioCapture.current.stop();
      setIsListening(false);
    } else {
      const result = await audioCapture.current.start();
      if (result.success) {
        setIsListening(true);
        
        // Poll diagnostics
        const interval = setInterval(async () => {
          const diag = await audioCapture.current?.getDiagnostics();
          setDiagnostics(diag);
          console.log('Diagnostics:', diag);
        }, 2000);
        
        return () => clearInterval(interval);
      }
    }
  };

  return (
    <div>
      {/* Add this button to your UI */}
      <button onClick={toggleListening}>
        {isListening ? '⏸️ Stop' : '🎤 Start Listening'}
      </button>

      {/* Show diagnostics */}
      {diagnostics && (
        <div style={{ padding: '10px', background: '#f0f0f0', margin: '10px 0' }}>
          <strong>Audio Status:</strong>
          <div>Chunks: {diagnostics.chunksReceived}</div>
          <div>Receiving: {diagnostics.isReceivingAudio ? '✅' : '❌'}</div>
        </div>
      )}

      {/* Your existing Live Mode UI goes here */}
    </div>
  );
}

export default LiveMode;
```

### Step 3: Test It

1. Restart your dev server
2. Open Live Mode
3. Click "Start Listening" 
4. Browser will ask for mic permission → **Allow**
5. Check console for: `[AudioCapture] Started successfully`
6. Play YouTube audio
7. Watch diagnostics update

---

## 🎛️ Advanced Usage

### Set Current Page
```typescript
audioCapture.current?.setCurrentPage(7);
```

### Adjust Sensitivity
```typescript
// Add a slider to your UI
<input 
  type="range" 
  min="0" 
  max="100" 
  onChange={(e) => {
    const value = Number(e.target.value) / 100; // 0-1
    audioCapture.current?.setSensitivity(value);
  }}
/>
```

### Manual Diagnostics Check
```typescript
const checkAudio = async () => {
  const diag = await audioCapture.current?.getDiagnostics();
  console.log(diag);
};
```

---

## 🧪 Verification

After adding the code, test with curl:

```bash
# Should show chunks being received
watch -n 1 'curl -s http://localhost:5000/api/armenian-learner/diagnostics'
```

Expected output when working:
```json
{
  "chunksReceived": 45,
  "isReceivingAudio": true,
  "totalDurationSeconds": 5.2
}
```

---

## 📝 Summary

**What you need to do:**
1. ✅ Copy `ArmenianLearnerAudioCapture.ts` to your frontend
2. ✅ Import it in Live Mode component
3. ✅ Add the button and diagnostics display
4. ✅ Test with microphone

**Time needed:** 5-10 minutes

**The module handles everything:**
- Microphone access
- Audio capture
- Base64 encoding
- API communication
- Page detection callbacks
- Diagnostics

**Just plug it in and it works!** 🎤✨
