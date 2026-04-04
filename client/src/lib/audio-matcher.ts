import { type AudioFeatures, compareFeatures, compareFeaturesCosineSimilarity, applyEMA, averageFeatures } from './audio-features';

export interface PageMarker {
  pageNumber: number;
  timestampMs: number;
  audioFeatures?: AudioFeatures | null;
}

export interface MatchResult {
  currentPage: number;
  confidence: number;
  elapsedMs: number;
  nextMarkerMs: number | null;
  featureMatch: number;
  timingScore: number;
  targetPage: number;
  isDiscriminative: boolean;
}

export class AudioMatcher {
  private markers: PageMarker[] = [];
  private startTime: number = 0;
  private isRunning: boolean = false;
  private onPageChange?: (page: number, confidence: number) => void;
  private onConfidenceUpdate?: (confidence: number) => void;
  private currentPage: number = 1;
  private lastPageTurnTime: number = 0;
  private recentFeatures: AudioFeatures[] = [];
  private featureWindowSize: number = 25;
  private smoothedFeatures: AudioFeatures | null = null;
  private debugMode: boolean = true;
  private lastDebugTime: number = 0;
  
  private absoluteThreshold: number = 50;
  private discriminativeMargin: number = 8;
  private consecutiveHitsRequired: number = 5;
  private hitCounts: Map<number, number> = new Map();
  private warmupFrames: number = 0;
  private warmupRequired: number = 40;
  
  private averagePageDuration: number = 15000;
  private minTimeBetweenTurns: number = 5000;

  setMarkers(markers: PageMarker[]) {
    this.markers = markers.filter(m => m.audioFeatures).sort((a, b) => a.pageNumber - b.pageNumber);
    
    if (this.markers.length > 1) {
      let totalDelta = 0;
      let deltaCount = 0;
      
      for (let i = 1; i < this.markers.length; i++) {
        const delta = this.markers[i].timestampMs - this.markers[i-1].timestampMs;
        if (delta > 0 && delta < 120000) {
          totalDelta += delta;
          deltaCount++;
        }
      }
      
      if (deltaCount > 0) {
        this.averagePageDuration = totalDelta / deltaCount;
        this.minTimeBetweenTurns = Math.max(4000, this.averagePageDuration * 0.4);
      }
    }
    
    console.log('AudioMatcher: Loaded', this.markers.length, 'audio fingerprints');
    console.log('AudioMatcher: Average page duration:', (this.averagePageDuration / 1000).toFixed(1), 's');
    console.log('AudioMatcher: Min time between turns:', (this.minTimeBetweenTurns / 1000).toFixed(1), 's');
  }

  setCallbacks(
    onPageChange: (page: number, confidence: number) => void,
    onConfidenceUpdate: (confidence: number) => void
  ) {
    this.onPageChange = onPageChange;
    this.onConfidenceUpdate = onConfidenceUpdate;
  }

  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.startTime = Date.now();
    this.lastPageTurnTime = Date.now();
    this.currentPage = 1;
    this.recentFeatures = [];
    this.smoothedFeatures = null;
    this.lastDebugTime = 0;
    this.hitCounts.clear();
    this.warmupFrames = 0;
    
    console.log('AudioMatcher: Started - warming up microphone...');
  }

  stop() {
    this.isRunning = false;
    this.recentFeatures = [];
    this.smoothedFeatures = null;
    this.hitCounts.clear();
    console.log('AudioMatcher: Stopped');
  }

  reset() {
    this.stop();
    this.startTime = 0;
    this.currentPage = 1;
  }

  getElapsedMs(): number {
    if (!this.startTime) return 0;
    return Date.now() - this.startTime;
  }

  private computeAudioScore(liveFeatures: AudioFeatures, storedFeatures: AudioFeatures): number {
    const directMatch = compareFeatures(liveFeatures, storedFeatures);
    
    if (!liveFeatures.mfcc || !storedFeatures.mfcc || liveFeatures.mfcc.length === 0) {
      return directMatch;
    }
    
    const minLen = Math.min(liveFeatures.mfcc.length, storedFeatures.mfcc.length, 13);
    let mfccDistance = 0;
    
    for (let i = 0; i < minLen; i++) {
      const diff = liveFeatures.mfcc[i] - storedFeatures.mfcc[i];
      const weight = i < 4 ? 2.0 : (i < 8 ? 1.5 : 1.0);
      mfccDistance += diff * diff * weight;
    }
    
    mfccDistance = Math.sqrt(mfccDistance / minLen);
    const mfccScore = Math.max(0, 100 - mfccDistance * 1.5);
    
    return (directMatch * 0.4) + (mfccScore * 0.6);
  }

  processAudioFeatures(features: AudioFeatures) {
    if (!this.isRunning) return;

    this.warmupFrames++;
    
    if (this.warmupFrames < this.warmupRequired) {
      return;
    }
    
    if (this.warmupFrames === this.warmupRequired) {
      console.log('AudioMatcher: Ready - listening for trained audio patterns');
    }

    this.smoothedFeatures = applyEMA(features, this.smoothedFeatures, 0.25);

    this.recentFeatures.push(this.smoothedFeatures);
    if (this.recentFeatures.length > this.featureWindowSize) {
      this.recentFeatures.shift();
    }

    if (this.recentFeatures.length < 10) {
      return;
    }

    const elapsedMs = this.getElapsedMs();
    const avgFeatures = averageFeatures(this.recentFeatures.slice(-10));
    
    const match = this.findDiscriminativeMatch(avgFeatures);
    
    if (this.onConfidenceUpdate) {
      this.onConfidenceUpdate(match.featureMatch);
    }

    if (this.debugMode && elapsedMs - this.lastDebugTime > 2000) {
      this.lastDebugTime = elapsedMs;
      const hits = this.hitCounts.get(match.targetPage) || 0;
      const timeSinceTurn = Date.now() - this.lastPageTurnTime;
      console.log(`[${(elapsedMs/1000).toFixed(1)}s] page=${this.currentPage}, target=${match.targetPage}, score=${match.featureMatch.toFixed(0)}%, discriminative=${match.isDiscriminative}, hits=${hits}/${this.consecutiveHitsRequired}, sinceLastTurn=${(timeSinceTurn/1000).toFixed(1)}s`);
    }

    const timeSinceLastTurn = Date.now() - this.lastPageTurnTime;
    
    if (match.targetPage > this.currentPage && 
        match.isDiscriminative &&
        match.featureMatch >= this.absoluteThreshold && 
        timeSinceLastTurn >= this.minTimeBetweenTurns) {
      
      const hits = this.hitCounts.get(match.targetPage) || 0;
      if (hits >= this.consecutiveHitsRequired) {
        console.log(`PAGE TURN: ${this.currentPage} -> ${match.targetPage} (score=${match.featureMatch.toFixed(0)}%, margin=${match.confidence.toFixed(0)}%)`);
        this.currentPage = match.targetPage;
        this.lastPageTurnTime = Date.now();
        this.hitCounts.clear();
        this.recentFeatures = [];
        this.smoothedFeatures = null;
        if (this.onPageChange) {
          this.onPageChange(match.targetPage, match.featureMatch);
        }
      }
    }

    return match;
  }

  private findDiscriminativeMatch(currentFeatures: AudioFeatures): MatchResult {
    const elapsedMs = this.getElapsedMs();
    
    if (this.markers.length === 0) {
      return { 
        currentPage: 1, confidence: 0, elapsedMs, nextMarkerMs: null, 
        featureMatch: 0, timingScore: 0, targetPage: 0, isDiscriminative: false 
      };
    }

    const candidateMarkers = this.markers.filter(m => m.pageNumber > this.currentPage);
    
    if (candidateMarkers.length === 0) {
      return { 
        currentPage: this.currentPage, confidence: 0, elapsedMs, nextMarkerMs: null, 
        featureMatch: 0, timingScore: 0, targetPage: 0, isDiscriminative: false 
      };
    }

    const scores: Array<{page: number, score: number, marker: PageMarker}> = [];
    
    for (const marker of candidateMarkers.slice(0, 5)) {
      if (!marker.audioFeatures) continue;
      const score = this.computeAudioScore(currentFeatures, marker.audioFeatures as AudioFeatures);
      scores.push({ page: marker.pageNumber, score, marker });
    }

    if (scores.length === 0) {
      return { 
        currentPage: this.currentPage, confidence: 0, elapsedMs, nextMarkerMs: null, 
        featureMatch: 0, timingScore: 0, targetPage: 0, isDiscriminative: false 
      };
    }

    scores.sort((a, b) => b.score - a.score);
    
    const bestMatch = scores[0];
    const secondBest = scores.length > 1 ? scores[1] : null;
    
    const margin = secondBest ? (bestMatch.score - secondBest.score) : bestMatch.score;
    
    const isNextPage = bestMatch.page === this.currentPage + 1;
    const requiredMargin = isNextPage ? this.discriminativeMargin : this.discriminativeMargin * 1.5;
    
    const isDiscriminative = margin >= requiredMargin && bestMatch.score >= this.absoluteThreshold;

    if (isDiscriminative) {
      const hits = (this.hitCounts.get(bestMatch.page) || 0) + 1;
      this.hitCounts.set(bestMatch.page, hits);
    } else {
      const pages = Array.from(this.hitCounts.keys());
      for (const page of pages) {
        const count = this.hitCounts.get(page) || 0;
        if (count > 0) {
          this.hitCounts.set(page, Math.max(0, count - 1));
        }
      }
    }

    const timingScore = this.calculateTimingScore(elapsedMs, bestMatch.marker.timestampMs);

    return {
      currentPage: this.currentPage,
      confidence: margin,
      elapsedMs,
      nextMarkerMs: bestMatch.marker.timestampMs,
      featureMatch: bestMatch.score,
      timingScore,
      targetPage: bestMatch.page,
      isDiscriminative,
    };
  }

  private calculateTimingScore(elapsedMs: number, expectedMs: number): number {
    const difference = Math.abs(elapsedMs - expectedMs);
    const tolerance = Math.max(8000, expectedMs * 0.3);
    
    if (difference <= tolerance) {
      return 100 - (difference / tolerance) * 30;
    } else {
      return Math.max(20, 70 - (difference / tolerance) * 20);
    }
  }

  getCurrentMatch(): MatchResult {
    const avgFeatures = this.recentFeatures.length > 0 
      ? averageFeatures(this.recentFeatures.slice(-10))
      : { rms: 0, zcr: 0, spectralCentroid: 0, spectralRolloff: 0, mfcc: [] };
    return this.findDiscriminativeMatch(avgFeatures);
  }
}

export const audioMatcher = new AudioMatcher();
