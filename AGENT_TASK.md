# Liturgy Agent — Implementation Task
# DO NOT DEVIATE FROM THESE STEPS
# DO NOT modify any file not listed here
# DO NOT change thresholds, fingerprints, or training data

---

## CONTEXT
Three new skill files have been created to fix the page-turning accuracy problem.
Your job is to integrate them into the existing codebase exactly as specified.
Nothing else. No improvements, no cleanup, no refactoring.

---

## STEP 1 — Copy skill files into project

Copy these files from wherever they are downloaded to:

| Source file | Destination |
|-------------|-------------|
| score-logger.ts | server/score-logger.ts |
| audio-normalizer.ts | server/audio-normalizer.ts |
| capture-baseline.mjs | scripts/capture-baseline.mjs |
| validate-change.mjs | scripts/validate-change.mjs |

Verify each file exists at destination before proceeding.
If any file is missing — STOP and report which file is missing.

---

## STEP 2 — Add imports to liturgy-tracker.ts

Open server/liturgy-tracker.ts.
Add these two lines at the TOP with the existing imports:

```typescript
import { getScoreLogger } from './score-logger';
import { getAudioNormalizer } from './audio-normalizer';
```

DO NOT change anything else in the import block.

---

## STEP 3 — Patch extractFeatures() return statement

Find the return statement at the END of the extractFeatures() method.
It currently looks like:

```typescript
return {
  mfcc: this.averageArray2D(features.mfcc),
  spectralCentroid: this.average(features.spectralCentroid),
  spectralFlux: features.spectralFlux,
  spectralRolloff: this.average(features.spectralRolloff),
  rms: this.average(features.rms),
  zcr: this.average(features.zcr)
};
```

Replace it with:

```typescript
const normalizer = getAudioNormalizer();
const rawMFCC = this.averageArray2D(features.mfcc);
const rawRMS = this.average(features.rms);
const rawCentroid = this.average(features.spectralCentroid);

return {
  mfcc: normalizer.hasProfile() ? normalizer.correctMFCC(rawMFCC) : rawMFCC,
  spectralCentroid: normalizer.hasProfile() ? normalizer.correctCentroid(rawCentroid) : rawCentroid,
  spectralFlux: features.spectralFlux,
  spectralRolloff: this.average(features.spectralRolloff),
  rms: normalizer.hasProfile() ? normalizer.correctRMS(rawRMS) : rawRMS,
  zcr: this.average(features.zcr)
};
```

VERIFY: normalizer.hasProfile() returns false when no profile exists.
This means without calibration the system behaves EXACTLY as before.
Safe to deploy immediately.

---

## STEP 4 — Patch matchFingerprint() to return detail

Find the private matchFingerprint() method in liturgy-tracker.ts.
ADD a new method alongside it called matchFingerprintDetailed():

```typescript
private matchFingerprintDetailed(liveFeatures: LiveFeatures, pageNumber: number): {
  score: number;
  mfccSim: number;
  rmsSim: number;
  centroidSim: number;
  continuityBonus: number;
} {
  const stored = this.fingerprints.find(f => f.pageNumber === pageNumber);
  if (!stored) return { score: 0, mfccSim: 0, rmsSim: 0, centroidSim: 0, continuityBonus: 0 };

  const mfccSim = this.cosineSimilarity(liveFeatures.mfcc, stored.features.mfcc);

  if (mfccSim < 0.3) {
    return { score: 0, mfccSim, rmsSim: 0, centroidSim: 0, continuityBonus: 0 };
  }

  const rmsDiff = Math.abs(liveFeatures.rms - stored.features.rms);
  const rmsSim = Math.exp(-rmsDiff * 50);

  const centroidDiff = Math.abs(liveFeatures.spectralCentroid - stored.features.spectralCentroid);
  const centroidSim = Math.exp(-centroidDiff / 100);

  let continuityBonus = 0;
  const pageDistance = Math.abs(pageNumber - this.currentPage);
  if (pageDistance <= 1) continuityBonus = 0.15;
  else if (pageDistance <= 3) continuityBonus = 0.05;

  const baseScore = (mfccSim * 0.7) + (rmsSim * 0.15) + (centroidSim * 0.15);
  const score = Math.min(1.0, baseScore + continuityBonus);

  return { score, mfccSim, rmsSim, centroidSim, continuityBonus };
}
```

DO NOT modify or delete the existing matchFingerprint() method.
ADD the new method only.

---

## STEP 5 — Patch processLiveAudio() scoring section

Find this block inside processLiveAudio() (around line 155-175):

```typescript
// Score each candidate
const scores = candidates.map(pageNum => ({
  pageNumber: pageNum,
  score: this.scorePage(pageNum, features, detectedSpeaker)
}));
```

Replace ONLY that map call with:

```typescript
// Score each candidate — detailed version for logging
const scores = candidates.map(pageNum => {
  const detail = this.matchFingerprintDetailed(pageNum, features);
  const pageData = this.liveTrackerData.pages.find(p => p.pageNumber === pageNum);
  const speakerScore = detectedSpeaker === (pageData?.speaker || '') ? this.speakerWeight : 0;
  return {
    pageNumber: pageNum,
    score: speakerScore + (detail.score * this.fingerprintWeight),
    detail
  };
});
```

Then find the line AFTER scores.sort() that reads:
```typescript
const best = scores[0];
```

ADD these lines immediately AFTER that line:

```typescript
// Score logger — captures every decision for analysis
const logger = getScoreLogger();
if (logger && best) {
  logger.logScore({
    timestamp,
    currentPage: this.currentPage,
    candidatePage: best.pageNumber,
    confidenceScore: best.score,
    mfccSimilarity: best.detail?.mfccSim || 0,
    rmsSimilarity: best.detail?.rmsSim || 0,
    centroidSimilarity: best.detail?.centroidSim || 0,
    continuityBonus: best.detail?.continuityBonus || 0,
    detectedSpeaker,
    expectedSpeaker,
    triggered: !!(best.score > this.confidenceThreshold && best.pageNumber > this.currentPage)
  });
}
```

DO NOT change the gate condition on the next line.
DO NOT change confidenceThreshold.
DO NOT change any other logic.

---

## STEP 6 — Add API endpoints to routes.ts

Find the line in server/routes.ts that reads:
```typescript
app.use('/api', agentAudioRouter);
```

ADD these three endpoints AFTER that line:

```typescript
// Score logger endpoints
app.post('/api/liturgy/log/start', (_req, res) => {
  const { startScoreLogger } = require('./score-logger');
  startScoreLogger(0.85);
  res.json({ success: true, message: 'Score logging started' });
});

app.post('/api/liturgy/log/stop', (_req, res) => {
  const { stopScoreLogger } = require('./score-logger');
  const summary = stopScoreLogger();
  res.json({ success: true, summary });
});

app.post('/api/liturgy/log/status', (_req, res) => {
  const { getScoreLogger } = require('./score-logger');
  const logger = getScoreLogger();
  res.json({ 
    active: logger !== null,
    entriesCount: (logger as any)?._session?.entries?.length || 0
  });
});
```

---

## STEP 7 — Add scripts to package.json

Open package.json.
Find the "scripts" section.
ADD these two lines inside the scripts object:

```json
"baseline": "node scripts/capture-baseline.mjs",
"validate": "node scripts/validate-change.mjs"
```

---

## STEP 8 — TypeScript compilation check

Run:
```bash
npx tsc --noEmit
```

If there are errors:
- Report the exact error message
- DO NOT attempt to fix them by changing logic
- Only fix actual TypeScript type errors (missing types, wrong interface)
- If unsure — STOP and report

---

## STEP 9 — Restart services

```bash
docker-compose restart liturgy-app
```

Wait 10 seconds then verify:
```bash
curl -s http://localhost:5001/api/liturgy/status
```

Expected response includes: "initialized":true

---

## STEP 10 — Smoke test score logger

```bash
curl -s -X POST http://localhost:5001/api/liturgy/log/start
curl -s http://localhost:5001/api/liturgy/log/status
curl -s -X POST http://localhost:5001/api/liturgy/log/stop
```

Expected: start returns success:true, status shows active:true, stop returns summary.

---

## COMPLETION REPORT

After all steps done, report:
1. Which files were modified (list them)
2. TypeScript compilation result
3. Service restart result  
4. Smoke test results
5. Any errors encountered

DO NOT report success if any step failed.
DO NOT make additional changes beyond these 10 steps.
DO NOT update SOUL.md, AGENTS.md, or any MD files.
DO NOT run the nightly training loop.
DO NOT change thresholds.

---

## AGENT RULE FOR ONGOING USE

After this implementation, the nightly loop MUST follow this sequence:
1. npm run baseline (capture current state)
2. Read most recent score-log-*.md from training-data/
3. Apply ONLY the recommendation from that report
4. Restart service
5. npm run validate
6. If validate exits code 2 → rollback happened, report to George via Telegram
7. If validate exits code 0 → change committed, report success via Telegram
8. NEVER change more than one parameter per nightly run

