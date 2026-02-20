/**
 * Page Matcher
 * 
 * Simpler approach: match current audio features directly to page fingerprints
 */

import fs from 'fs';
import path from 'path';

export class PageMatcher {
  constructor(fingerprintsPath = '/app/training-data/fingerprints-v2.json') {
    this.fingerprints = JSON.parse(fs.readFileSync(fingerprintsPath, 'utf8'));
    this.sensitivity = 0.5;
    this.lastMatches = [];
    this.maxHistory = 3; // Temporal smoothing
    
    console.log(`[page-matcher] Loaded ${this.fingerprints.length} page fingerprints`);
  }

  /**
   * Match audio features to pages
   * @param {Object} features - Audio features {mfcc, spectralCentroid, rms, zcr}
   * @returns {Object} {page, confidence, matches}
   */
  matchAudio(features) {
    const scores = [];
    
    // Compare against each page
    for (const fingerprint of this.fingerprints) {
      const score = this.compareFeatures(features, fingerprint.features);
      
      scores.push({
        page: fingerprint.pageNumber,
        score,
        duration: fingerprint.duration
      });
    }
    
    // Sort by score
    scores.sort((a, b) => b.score - a.score);
    
    const bestMatch = scores[0];
    
    // Add to history
    this.lastMatches.push({
      page: bestMatch.page,
      score: bestMatch.score,
      timestamp: Date.now()
    });
    
    if (this.lastMatches.length > this.maxHistory) {
      this.lastMatches.shift();
    }
    
    // Get smoothed prediction
    const smoothedPage = this.getSmoothedPage();
    const confidence = bestMatch.score;
    
    return {
      page: smoothedPage,
      confidence,
      topMatches: scores.slice(0, 5),
      triggerable: confidence > this.sensitivity
    };
  }

  /**
   * Compare two feature sets
   * @param {Object} features1 - First feature set
   * @param {Object} features2 - Second feature set
   * @returns {number} Similarity score 0-1
   */
  compareFeatures(features1, features2) {
    let totalScore = 0;
    let weights = 0;
    
    // MFCC comparison (most important)
    if (features1.mfcc && features2.mfcc) {
      const mfccSim = this.cosineSimilarity(features1.mfcc, features2.mfcc);
      totalScore += mfccSim * 0.6;
      weights += 0.6;
    }
    
    // Spectral centroid (pitch/brightness)
    if (features1.spectralCentroid && features2.spectralCentroid) {
      const diff = Math.abs(features1.spectralCentroid - features2.spectralCentroid);
      const maxDiff = 1000; // Normalize
      const sim = Math.max(0, 1 - (diff / maxDiff));
      totalScore += sim * 0.2;
      weights += 0.2;
    }
    
    // RMS (volume/energy)
    if (features1.rms && features2.rms) {
      const diff = Math.abs(features1.rms - features2.rms);
      const maxDiff = 0.1; // Normalize
      const sim = Math.max(0, 1 - (diff / maxDiff));
      totalScore += sim * 0.1;
      weights += 0.1;
    }
    
    // Zero crossing rate (noisiness)
    if (features1.zcr && features2.zcr) {
      const diff = Math.abs(features1.zcr - features2.zcr);
      const maxDiff = 100; // Normalize
      const sim = Math.max(0, 1 - (diff / maxDiff));
      totalScore += sim * 0.1;
      weights += 0.1;
    }
    
    return weights > 0 ? totalScore / weights : 0;
  }

  /**
   * Cosine similarity between two vectors
   * @param {Array<number>} a - First vector
   * @param {Array<number>} b - Second vector
   * @returns {number} Similarity 0-1
   */
  cosineSimilarity(a, b) {
    const len = Math.min(a.length, b.length);
    let dotProduct = 0;
    let magA = 0;
    let magB = 0;
    
    for (let i = 0; i < len; i++) {
      dotProduct += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    
    magA = Math.sqrt(magA);
    magB = Math.sqrt(magB);
    
    if (magA === 0 || magB === 0) return 0;
    
    const sim = dotProduct / (magA * magB);
    // Convert from -1..1 to 0..1
    return (sim + 1) / 2;
  }

  /**
   * Get smoothed page prediction using temporal voting
   * @returns {number} Most likely page
   */
  getSmoothedPage() {
    if (this.lastMatches.length === 0) return null;
    
    // Count votes
    const votes = new Map();
    
    this.lastMatches.forEach(match => {
      const count = votes.get(match.page) || 0;
      votes.set(match.page, count + 1);
    });
    
    // Find winner
    let winnerPage = this.lastMatches[this.lastMatches.length - 1].page;
    let maxVotes = 0;
    
    for (const [page, count] of votes.entries()) {
      if (count > maxVotes) {
        maxVotes = count;
        winnerPage = page;
      }
    }
    
    return winnerPage;
  }

  /**
   * Set sensitivity threshold
   * @param {number} value - Sensitivity 0.0-1.0
   */
  setSensitivity(value) {
    this.sensitivity = value;
    console.log(`[page-matcher] Sensitivity set to ${(value * 100).toFixed(0)}%`);
  }

  /**
   * Reset history
   */
  reset() {
    this.lastMatches = [];
  }
}
