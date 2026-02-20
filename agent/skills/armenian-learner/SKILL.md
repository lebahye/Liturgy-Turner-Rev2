---
name: armenian-learner
description: Learn to read and listen to old Western Armenian liturgical language by connecting sounds to written words
---

# Armenian Learner Skill

## Purpose

This skill learns Armenian liturgical language like a human child:
- **Hears** sounds in audio recordings
- **Sees** words on the page (from PDF)
- **Connects** the two: "this sound = this word"
- **Remembers** patterns in a growing database
- **Gets better** with practice

## Why This Exists

Whisper and other STT don't understand old Western Armenian liturgical language. This is specialized, sung/chanted Armenian from church services - not modern spoken Armenian.

Instead of relying on pre-trained models, this skill learns from YOUR specific audio recordings and liturgy text.

## What It Does

### Training Mode
1. Takes audio recording + PDF text + timestamps
2. Extracts sound patterns (phonemes, pitch, rhythm)
3. Parses Armenian text into words
4. Aligns audio segments to text segments
5. Stores patterns: "sound signature → Armenian word"
6. Builds a growing pattern database (the "brain")

### Recognition Mode
1. Listens to live audio stream
2. Extracts sound patterns from current audio
3. Matches against learned patterns
4. Predicts which page is being read
5. Turns page automatically with confidence

### Learning Mode
1. User corrects wrong predictions
2. System learns from corrections
3. Pattern database improves
4. Accuracy increases over time

## Tools Provided

### start_armenian_training
Start learning from audio + text data.

**Parameters:**
- `audioFile` (string): Path to audio recording
- `pdfFile` (string): Path to liturgy PDF
- `timestampsFile` (string): Path to page timestamps JSON
- `testMode` (boolean): If true, only process first 10 pages for testing

**Returns:** Training job ID

### get_armenian_status
Get current learning status and progress.

**Returns:**
```json
{
  "status": "training|idle|recognizing",
  "wordsLearned": 1245,
  "patternsStored": 3847,
  "accuracy": 0.783,
  "trainingTime": "2h 15m",
  "progress": 0.62,
  "currentActivity": "Processing page 42"
}
```

### start_armenian_recognition
Start live audio recognition and page prediction.

**Parameters:**
- `onPageDetected` (function): Callback when page is detected

**Returns:** Recognition session ID

### stop_armenian
Stop training or recognition.

### test_armenian_accuracy
Test current accuracy against known audio.

**Parameters:**
- `testAudioFile` (string): Audio file to test against
- `groundTruthFile` (string): Expected page turns

**Returns:** Accuracy report

### correct_armenian_prediction
Teach the system when it's wrong.

**Parameters:**
- `detectedPage` (number): What the system predicted
- `actualPage` (number): What it actually was
- `audioContext` (buffer): Recent audio that led to prediction

**Effect:** System learns from the correction

## Data Files

### learned-patterns.json
The "brain" - stores all learned sound→word mappings.

```json
{
  "patterns": [
    {
      "armenianWord": "Աստուած",
      "soundSignature": {
        "phonemes": ["ah", "s", "too", "ats"],
        "duration": 0.85,
        "mfcc": [...],
        "spectralFingerprint": [...]
      },
      "confidence": 0.87,
      "frequency": 42,
      "contexts": [...]
    }
  ]
}
```

### training-progress.json
Tracks learning progress over time.

### accuracy-history.json
Records accuracy test results.

## How to Use

### Initial Training
```javascript
// Start with your first recording
const jobId = await start_armenian_training({
  audioFile: '/app/agent/full_service.wav',
  pdfFile: '/app/agent/liturgy.pdf',
  timestampsFile: '/app/training-data/page-timestamps-mapped.json'
});

// Check progress
const status = await get_armenian_status();
console.log(`Learned ${status.wordsLearned} words so far...`);
```

### Live Recognition
```javascript
// During church service
await start_armenian_recognition({
  onPageDetected: (page, confidence) => {
    if (confidence > 0.8) {
      turnPage(page);
    }
  }
});
```

### Learning from Mistakes
```javascript
// When user corrects a wrong page turn
await correct_armenian_prediction({
  detectedPage: 15,
  actualPage: 17,
  audioContext: recentAudioBuffer
});
```

## Success Metrics

**Initial training (6-8 hours):**
- Words learned: 1,500+
- Patterns stored: 3,000+
- Baseline accuracy: 70-80%

**After 3-5 live services:**
- Words learned: 3,000+
- Accuracy: 85-92%
- Confidence scores improving

**Production ready:**
- Words learned: 5,000+
- Accuracy: 95%+
- False positives: <2%

## Architecture

```
Audio Input → Phoneme Extraction → Pattern Matching
    ↓              ↓                      ↓
PDF Text → Word Parsing → Alignment → Database
                                          ↓
                              Learning Loop ← Corrections
```

## Notes

- This learns YOUR specific liturgy, not general Armenian
- Accuracy improves with more training data
- Manual corrections make it smarter
- First training takes hours, but only done once
- Subsequent services use the learned patterns
