/**
 * Sequential Liturgy Page Tracker
 * Production-ready implementation for Armenian church services
 */

import Meyda from 'meyda';
import fs from 'fs';
import path from 'path';

interface LiveFeatures {
  mfcc: number[];
  spectralCentroid: number;
  spectralFlux: number[];
  spectralRolloff: number;
  rms: number;
  zcr: number;
}

interface PageData {
  pageNumber: number;
  speaker: string;
  triggerWords: string[];
  armenianWords: string[];
  preview: string;
}

interface Fingerprint {
  pageNumber: number;
  startTime: number;
  endTime: number;
  features: {
    mfcc: number[];
    spectralCentroid: number;
    spectralRolloff: number;
    rms: number;
    zcr: number;
  };
}

interface TrackingResult {
  page: number;
  changed: boolean;
  confidence?: number;
  reason?: string;
  jumped?: boolean;
}

export class LiturgyPageTracker {
  private currentPage: number = 1;
  private currentSpeaker: string | null = null;
  private lastTransitionTime: number = 0;
  private lookAheadWindow: number = 3;
  
  private liveTrackerData: { pages: PageData[]; transitions: any[] };
  private fingerprints: Fingerprint[];
  private speakerModels: any;
  
  // Tunable parameters
  private speakerWeight = 0.3;
  private fingerprintWeight = 0.7;
  private confidenceThreshold = 0.75;
  private transitionCooldown = 3000; // 3 seconds between transitions
  
  constructor() {
    // Load training data
    const dataDir = path.join(process.cwd(), 'training-data');
    
    this.liveTrackerData = JSON.parse(
      fs.readFileSync(path.join(dataDir, 'live-tracker-data.json'), 'utf8')
    );
    
    this.fingerprints = JSON.parse(
      fs.readFileSync(path.join(dataDir, 'fingerprints.json'), 'utf8')
    );
    
    this.speakerModels = JSON.parse(
      fs.readFileSync(path.join(dataDir, 'speaker-models.json'), 'utf8')
    );
  }
  
  /**
   * Process live audio and determine if page should advance
   */
  processLiveAudio(audioBuffer: Float32Array, timestamp: number): TrackingResult {
    // Extract features
    const features = this.extractFeatures(audioBuffer);
    
    // Detect current speaker
    const detectedSpeaker = this.classifySpeaker(features);
    
    // Get expected speaker for current page
    const currentPageData = this.liveTrackerData.pages.find(
      p => p.pageNumber === this.currentPage
    );
    
    const expectedSpeaker = currentPageData?.speaker || 'unknown';
    
    // Check if enough time has passed since last transition
    if (timestamp - this.lastTransitionTime < this.transitionCooldown) {
      return { page: this.currentPage, changed: false };
    }
    
    // Check for speaker transition
    const speakerChanged = detectedSpeaker !== expectedSpeaker;
    
    if (speakerChanged || this.shouldCheckNextPages(features)) {
      // Get candidate pages (only look forward!)
      const candidates = this.getCandidatePages();
      
      // Score each candidate
      const scores = candidates.map(pageNum => ({
        pageNumber: pageNum,
        score: this.scorePage(pageNum, features, detectedSpeaker)
      }));
      
      // Sort by score
      scores.sort((a, b) => b.score - a.score);
      const best = scores[0];
      
      // Advance if confident and moving forward
      if (best && best.score > this.confidenceThreshold && best.pageNumber > this.currentPage) {
        const previousPage = this.currentPage;
        this.currentPage = best.pageNumber;
        this.currentSpeaker = detectedSpeaker;
        this.lastTransitionTime = timestamp;
        
        return {
          page: this.currentPage,
          changed: true,
          confidence: best.score,
          reason: this.explainAdvance(best.score, speakerChanged),
          jumped: best.pageNumber > previousPage + 1
        };
      }
    }
    
    return { page: this.currentPage, changed: false };
  }
  
  /**
   * Extract audio features using Meyda
   */
  private extractFeatures(audioBuffer: Float32Array): LiveFeatures {
    const windowSize = 2048;
    const hopSize = 512;
    const numFrames = Math.floor((audioBuffer.length - windowSize) / hopSize);
    
    const features: {
      mfcc: number[][];
      spectralCentroid: number[];
      spectralFlux: number[];
      spectralRolloff: number[];
      rms: number[];
      zcr: number[];
    } = {
      mfcc: [],
      spectralCentroid: [],
      spectralFlux: [],
      spectralRolloff: [],
      rms: [],
      zcr: []
    };
    
    let lastSpectrum: number[] | null = null;
    
    for (let frame = 0; frame < Math.min(numFrames, 50); frame++) {
      const start = frame * hopSize;
      const frameData = audioBuffer.slice(start, start + windowSize);
      
      if (frameData.length < windowSize) break;
      
      try {
        const extracted = Meyda.extract([
          'mfcc',
          'spectralCentroid',
          'spectralRolloff',
          'rms',
          'zcr',
          'powerSpectrum'
        ], frameData, {
          sampleRate: 48000,
          bufferSize: windowSize,
          windowingFunction: 'hanning'
        });
        
        if (extracted) {
          if (extracted.mfcc) features.mfcc.push(extracted.mfcc);
          if (extracted.spectralCentroid) features.spectralCentroid.push(extracted.spectralCentroid);
          if (extracted.spectralRolloff) features.spectralRolloff.push(extracted.spectralRolloff);
          if (extracted.rms) features.rms.push(extracted.rms);
          if (extracted.zcr) features.zcr.push(extracted.zcr);
          
          // Calculate spectral flux
          if (extracted.powerSpectrum && lastSpectrum) {
            let flux = 0;
            for (let i = 0; i < Math.min(lastSpectrum.length, extracted.powerSpectrum.length); i++) {
              const diff = extracted.powerSpectrum[i] - lastSpectrum[i];
              flux += diff * diff;
            }
            features.spectralFlux.push(Math.sqrt(flux));
          }
          
          if (extracted.powerSpectrum) {
            lastSpectrum = extracted.powerSpectrum;
          }
        }
      } catch (err) {
        // Skip frame on error
      }
    }
    
    return {
      mfcc: this.averageArray2D(features.mfcc),
      spectralCentroid: this.average(features.spectralCentroid),
      spectralFlux: features.spectralFlux,
      spectralRolloff: this.average(features.spectralRolloff),
      rms: this.average(features.rms),
      zcr: this.average(features.zcr)
    };
  }
  
  /**
   * Classify speaker based on spectral flux variance
   */
  private classifySpeaker(features: LiveFeatures): string {
    const fluxVariance = this.calculateVariance(features.spectralFlux);
    
    // Thresholds from training
    if (fluxVariance > 10) return 'choir';
    if (fluxVariance > 2) return 'celebrant';
    return 'deacon';
  }
  
  /**
   * Get candidate pages to check (only forward!)
   */
  private getCandidatePages(): number[] {
    const candidates: number[] = [];
    for (let i = 1; i <= this.lookAheadWindow; i++) {
      const pageNum = this.currentPage + i;
      if (pageNum <= 183) {
        candidates.push(pageNum);
      }
    }
    return candidates;
  }
  
  /**
   * Score a candidate page
   */
  private scorePage(pageNumber: number, features: LiveFeatures, detectedSpeaker: string): number {
    let score = 0;
    
    // Get page data
    const pageData = this.liveTrackerData.pages.find(p => p.pageNumber === pageNumber);
    if (!pageData) return 0;
    
    // Speaker match (30%)
    if (detectedSpeaker === pageData.speaker) {
      score += this.speakerWeight;
    }
    
    // Audio fingerprint match (70%)
    const fingerprintScore = this.matchFingerprint(features, pageNumber);
    score += fingerprintScore * this.fingerprintWeight;
    
    return score;
  }
  
  /**
   * Match audio fingerprint to stored fingerprint
   */
  private matchFingerprint(liveFeatures: LiveFeatures, pageNumber: number): number {
    const stored = this.fingerprints.find(f => f.pageNumber === pageNumber);
    if (!stored) return 0;
    
    // MFCC cosine similarity (main signal)
    const mfccSim = this.cosineSimilarity(liveFeatures.mfcc, stored.features.mfcc);
    
    // RMS similarity (volume match)
    const rmsDiff = Math.abs(liveFeatures.rms - stored.features.rms);
    const rmsScore = Math.exp(-rmsDiff * 100);
    
    // Spectral centroid similarity (brightness)
    const centroidDiff = Math.abs(liveFeatures.spectralCentroid - stored.features.spectralCentroid);
    const centroidScore = Math.exp(-centroidDiff / 50);
    
    // Combined score
    return (mfccSim * 0.6) + (rmsScore * 0.2) + (centroidScore * 0.2);
  }
  
  /**
   * Check if we should look for next pages even without speaker change
   */
  private shouldCheckNextPages(features: LiveFeatures): boolean {
    // Check periodically based on audio characteristics
    // If silence or very low energy, might be transitioning
    return features.rms < 0.005;
  }
  
  /**
   * Explain why page advanced
   */
  private explainAdvance(score: number, speakerChanged: boolean): string {
    if (score > 0.9) return 'Very confident (all signals strong)';
    if (speakerChanged && score > 0.75) return 'Speaker transition + audio match';
    if (score > 0.85) return 'Strong audio fingerprint match';
    return 'Combined signals';
  }
  
  // Utility functions
  private average(arr: number[]): number {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }
  
  private averageArray2D(arr: number[][]): number[] {
    if (!arr || arr.length === 0) return [];
    const len = arr[0].length;
    const result = new Array(len).fill(0);
    
    arr.forEach(row => {
      row.forEach((val, i) => {
        result[i] += val;
      });
    });
    
    return result.map(v => v / arr.length);
  }
  
  private calculateVariance(arr: number[]): number {
    if (!arr || arr.length === 0) return 0;
    const avg = this.average(arr);
    const squaredDiffs = arr.map(v => (v - avg) * (v - avg));
    return this.average(squaredDiffs);
  }
  
  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let magA = 0;
    let magB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    
    magA = Math.sqrt(magA);
    magB = Math.sqrt(magB);
    
    if (magA === 0 || magB === 0) return 0;
    
    return dotProduct / (magA * magB);
  }
  
  /**
   * Manual controls
   */
  setPage(pageNumber: number): boolean {
    if (pageNumber >= 1 && pageNumber <= 183) {
      this.currentPage = pageNumber;
      this.lastTransitionTime = Date.now();
      return true;
    }
    return false;
  }
  
  getCurrentPage(): number {
    return this.currentPage;
  }
  
  reset(): void {
    this.currentPage = 1;
    this.currentSpeaker = null;
    this.lastTransitionTime = 0;
  }
  
  /**
   * Tune parameters (for manual training)
   */
  setConfidenceThreshold(threshold: number): void {
    this.confidenceThreshold = Math.max(0, Math.min(1, threshold));
  }
  
  setLookAheadWindow(pages: number): void {
    this.lookAheadWindow = Math.max(1, Math.min(10, pages));
  }
}
