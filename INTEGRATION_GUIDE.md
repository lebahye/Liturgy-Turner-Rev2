# Liturgy Turner — New Skills Integration Guide

## Three skills built. Here is exactly how to integrate them.

---

## Skill 1: Score Logger
**File:** server/score-logger.ts
**Purpose:** Logs every confidence score during testing so the agent has real data

### Integration steps

1. Copy score-logger.ts to server/score-logger.ts

2. Add to server/routes.ts (after existing imports):
```typescript
import { startScoreLogger, stopScoreLogger, getScoreLogger } from './score-logger';
```

3. Add two new API endpoints in routes.ts:
```typescript
// Start a logging session
app.post('/api/liturgy/log/start', (_req, res) => {
  const tracker = getLiturgyTracker(); // however you access it
  startScoreLogger(0.85); // pass current threshold
  res.json({ success: true, message: 'Score logging started' });
});

// Stop and get report
app.post('/api/liturgy/log/stop', (_req, res) => {
  const summary = stopScoreLogger();
  res.json({ success: true, summary });
});
```

4. Add to liturgy-tracker.ts processLiveAudio() — after scoring, before the gate:
```typescript
// Log score (add this after scores.sort())
const logger = getScoreLogger();
if (logger && best) {
  logger.logScore({
    timestamp,
    currentPage: this.currentPage,
    candidatePage: best.pageNumber,
    confidenceScore: best.score,
    mfccSimilarity: /* get from detailed match */,
    rmsSimilarity: 0,
    centroidSimilarity: 0,
    continuityBonus: 0,
    detectedSpeaker,
    expectedSpeaker,
    triggered: best.score > this.confidenceThreshold && best.pageNumber > this.currentPage
  });
}
```

### Usage
Before phone test: POST /api/liturgy/log/start
After phone test:  POST /api/liturgy/log/stop
Check: training-data/score-log-{date}.md for the report and recommendation

---

## Skill 2: Overlearn Guard  
**Files:** scripts/capture-baseline.mjs, scripts/validate-change.mjs
**Purpose:** Prevents nightly agent from making things worse

### Integration steps

1. Copy both .mjs files to project root scripts/ folder

2. Update the nightly agent SOUL.md or AGENTS.md with this rule:
```
MANDATORY: Before changing ANY parameter in liturgy-tracker.ts:
  node scripts/capture-baseline.mjs
After the change, run a test session, then:
  node scripts/validate-change.mjs
If validate-change exits with code 2, the change was rolled back. Stop and report.
```

3. Add to package.json scripts:
```json
"baseline": "node scripts/capture-baseline.mjs",
"validate": "node scripts/validate-change.mjs"
```

### Usage
npm run baseline   → before any change
npm run validate   → after change + test session

---

## Skill 3: Audio Normalizer
**File:** server/audio-normalizer.ts
**Purpose:** Fixes phone vs microphone MFCC mismatch

### Integration steps

1. Copy audio-normalizer.ts to server/audio-normalizer.ts

2. Add to liturgy-tracker.ts:
```typescript
import { getAudioNormalizer } from './audio-normalizer';
```

3. In extractFeatures() return statement, apply correction:
```typescript
const normalizer = getAudioNormalizer();
const rawMFCC = this.averageArray2D(features.mfcc);
return {
  mfcc: normalizer.hasProfile() ? normalizer.correctMFCC(rawMFCC) : rawMFCC,
  spectralCentroid: normalizer.hasProfile() ? 
    normalizer.correctCentroid(this.average(features.spectralCentroid)) : 
    this.average(features.spectralCentroid),
  spectralFlux: features.spectralFlux,
  spectralRolloff: this.average(features.spectralRolloff),
  rms: normalizer.hasProfile() ? 
    normalizer.correctRMS(this.average(features.rms)) : 
    this.average(features.rms),
  zcr: this.average(features.zcr)
};
```

4. Add calibration endpoint to routes.ts:
```typescript
app.post('/api/liturgy/calibrate-audio', async (req, res) => {
  // req.body.phoneSamples = array of {pageNumber, mfcc, rms, centroid}
  // extracted from phone audio for specific pages
  const normalizer = getAudioNormalizer();
  const profile = normalizer.calibrateFromFingerprints(req.body.phoneSamples);
  res.json({ success: true, profile });
});
```

---

## Testing sequence after integration

1. Start services: docker-compose up
2. Start score logger: POST /api/liturgy/log/start
3. Play Badarak on phone near microphone
4. Manually advance pages as needed (normal test)
5. Stop logger: POST /api/liturgy/log/stop
6. Read report in training-data/score-log-{date}.md
7. Follow the RECOMMENDATION in the report
8. Run baseline: npm run baseline
9. Make ONLY the recommended change
10. Re-test
11. Validate: npm run validate
12. If rollback triggered — stop, report what happened

