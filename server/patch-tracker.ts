/**
 * Patch for liturgy-tracker.ts
 * 
 * Add these 3 changes to your existing liturgy-tracker.ts:
 * 
 * 1. Add import at top:
 *    import { getScoreLogger } from './score-logger';
 * 
 * 2. In matchFingerprint(), capture raw values before returning:
 *    (see patched version below)
 * 
 * 3. In processLiveAudio(), log to score logger after scoring:
 *    (see patched version below)
 */

// ============================================================
// PATCH 1: Replace matchFingerprint() with this version
// Returns both the score AND the raw components for logging
// ============================================================

/*
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
*/

// ============================================================
// PATCH 2: Replace the scoring section in processLiveAudio()
// Around line 155-180 in your current tracker
// ============================================================

/*
// Score each candidate — use detailed version for logging
const scores = candidates.map(pageNum => {
  const detail = this.matchFingerprintDetailed(pageNum, features);
  const speakerScore = detectedSpeaker === 
    (this.liveTrackerData.pages.find(p => p.pageNumber === pageNum)?.speaker || '') 
    ? this.speakerWeight : 0;
  return {
    pageNumber: pageNum,
    score: speakerScore + (detail.score * this.fingerprintWeight),
    detail
  };
});

scores.sort((a, b) => b.score - a.score);
const best = scores[0];

// LOG TO SCORE LOGGER — this is the key addition
const logger = getScoreLogger();
if (logger && best) {
  logger.logScore({
    timestamp,
    currentPage: this.currentPage,
    candidatePage: best.pageNumber,
    confidenceScore: best.score,
    mfccSimilarity: best.detail.mfccSim,
    rmsSimilarity: best.detail.rmsSim,
    centroidSimilarity: best.detail.centroidSim,
    continuityBonus: best.detail.continuityBonus,
    detectedSpeaker,
    expectedSpeaker,
    triggered: best.score > this.confidenceThreshold && best.pageNumber > this.currentPage
  });
}

// Original gate — unchanged
if (best && best.score > this.confidenceThreshold && best.pageNumber > this.currentPage) {
  // ... rest of your existing advance logic
}
*/
