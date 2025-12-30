import { AudioFeatures, compareFeatures } from './audio-features';
import { CanonicalTimeline, TimelineFrame } from './canonical-timeline';

interface StateBeliefs {
  probabilities: Float32Array;
  bestState: number;
  confidence: number;
}

export class ViterbiMatcher {
  private timeline: CanonicalTimeline | null = null;
  private beliefs: Float32Array | null = null;
  private currentPage: number = 1;
  private lastTurnTime: number = 0;
  private startTime: number = 0;
  private minTimeBetweenTurns: number = 3000;
  private isReady: boolean = false;
  
  private stayPenalty = 0.3;
  private advancePenalty = 0.02;
  private skipPenalty = 0.1;
  private backtrackPenalty = 2.0;
  private maxAdvance = 20;
  private maxBacktrack = 3;
  private forwardDrift = 0.05;
  
  private featureHistory: AudioFeatures[] = [];
  private historySize = 5;
  
  constructor() {}
  
  setTimeline(timeline: CanonicalTimeline): void {
    this.timeline = timeline;
    this.beliefs = new Float32Array(timeline.frames.length);
    
    const startFrames = Math.min(100, timeline.frames.length);
    for (let i = 0; i < startFrames; i++) {
      this.beliefs[i] = 1.0 / startFrames;
    }
    
    if (timeline.pageBoundaries.length > 0) {
      const avgDuration = this.calculateAveragePagesectionDuration();
      this.minTimeBetweenTurns = Math.max(2000, avgDuration * 0.25);
    }
    
    console.log(`ViterbiMatcher: ${timeline.frames.length} states, ${timeline.pageBoundaries.length} pages`);
    console.log(`ViterbiMatcher: Min time between turns: ${(this.minTimeBetweenTurns/1000).toFixed(1)}s`);
  }
  
  private calculateAveragePagesectionDuration(): number {
    if (!this.timeline || this.timeline.pageBoundaries.length < 2) return 10000;
    
    const boundaries = this.timeline.pageBoundaries;
    let totalDuration = 0;
    let count = 0;
    
    for (let i = 1; i < boundaries.length; i++) {
      const duration = boundaries[i].timestampMs - boundaries[i-1].timestampMs;
      totalDuration += duration;
      count++;
    }
    
    return count > 0 ? totalDuration / count : 10000;
  }
  
  start(): void {
    this.startTime = Date.now();
    this.lastTurnTime = this.startTime;
    this.currentPage = 1;
    this.featureHistory = [];
    
    if (this.timeline && this.beliefs) {
      this.beliefs.fill(0);
      const startFrames = Math.min(100, this.timeline.frames.length);
      for (let i = 0; i < startFrames; i++) {
        this.beliefs[i] = 1.0 / startFrames;
      }
    }
    
    this.isReady = true;
    console.log('ViterbiMatcher: Started');
  }
  
  stop(): void {
    this.isReady = false;
    this.featureHistory = [];
    console.log('ViterbiMatcher: Stopped');
  }
  
  processFrame(features: AudioFeatures): {
    shouldTurnPage: boolean;
    newPage: number;
    confidence: number;
    position: number;
    cost: number;
  } {
    if (!this.isReady || !this.timeline || !this.beliefs) {
      return { shouldTurnPage: false, newPage: this.currentPage, confidence: 0, position: 0, cost: 0 };
    }
    
    this.featureHistory.push(features);
    if (this.featureHistory.length > this.historySize) {
      this.featureHistory.shift();
    }
    
    const avgFeatures = this.averageFeatures(this.featureHistory);
    
    const elapsedMs = Date.now() - this.startTime;
    const expectedFrame = Math.floor(elapsedMs / this.timeline.hopMs);
    
    const newBeliefs = new Float32Array(this.beliefs.length);
    
    const searchRadius = 300;
    const minSearch = Math.max(0, expectedFrame - searchRadius);
    const maxSearch = Math.min(this.timeline.frames.length - 1, expectedFrame + searchRadius);
    
    for (let nextState = minSearch; nextState <= maxSearch; nextState++) {
      const frame = this.timeline.frames[nextState];
      if (!frame.features || !frame.features.mfcc || frame.features.mfcc.length === 0) continue;
      
      const emissionCost = compareFeatures(avgFeatures, frame.features);
      const emissionProb = Math.exp(-emissionCost / 15);
      
      const timeOffset = Math.abs(nextState - expectedFrame);
      const timePenalty = (timeOffset / 100) * 0.5;
      const timeProb = Math.exp(-timePenalty);
      
      newBeliefs[nextState] = emissionProb * timeProb;
    }
    
    for (let i = minSearch; i <= maxSearch; i++) {
      if (this.beliefs[i] > 0.01) {
        const carryOver = 0.3;
        for (let delta = -5; delta <= 10; delta++) {
          const target = i + delta;
          if (target >= minSearch && target <= maxSearch) {
            const transitionWeight = delta === 1 ? 1.0 : 
                                     delta === 0 ? 0.8 :
                                     delta > 1 ? 0.6 / delta : 0.3;
            newBeliefs[target] += this.beliefs[i] * carryOver * transitionWeight;
          }
        }
      }
    }
    
    let sum = 0;
    for (let i = 0; i < newBeliefs.length; i++) {
      sum += newBeliefs[i];
    }
    if (sum > 0) {
      for (let i = 0; i < newBeliefs.length; i++) {
        newBeliefs[i] /= sum;
      }
    }
    
    this.beliefs = newBeliefs;
    
    let bestState = 0;
    let bestProb = 0;
    for (let i = 0; i < this.beliefs.length; i++) {
      if (this.beliefs[i] > bestProb) {
        bestProb = this.beliefs[i];
        bestState = i;
      }
    }
    
    const confidence = Math.min(100, bestProb * 500);
    
    let currentPageFromState = 1;
    for (const boundary of this.timeline.pageBoundaries) {
      if (bestState >= boundary.frameIndex) {
        currentPageFromState = boundary.pageNumber;
      } else {
        break;
      }
    }
    
    const now = Date.now();
    const timeSinceLastTurn = now - this.lastTurnTime;
    const elapsedTime = (now - this.startTime) / 1000;
    
    const shouldTurnPage = currentPageFromState > this.currentPage && 
                           timeSinceLastTurn >= this.minTimeBetweenTurns &&
                           confidence > 15;
    
    if (shouldTurnPage) {
      console.log(`PAGE TURN: ${this.currentPage} -> ${currentPageFromState} (state=${bestState}, conf=${confidence.toFixed(0)}%)`);
      this.currentPage = currentPageFromState;
      this.lastTurnTime = now;
    }
    
    if (Math.floor(elapsedTime) % 2 === 0 && Math.floor(elapsedTime * 10) % 10 === 0) {
      const stateTimeMs = bestState * this.timeline.hopMs;
      console.log(`[${elapsedTime.toFixed(1)}s] state=${bestState} (${(stateTimeMs/1000).toFixed(1)}s), page=${currentPageFromState}, conf=${confidence.toFixed(0)}%`);
    }
    
    return {
      shouldTurnPage,
      newPage: this.currentPage,
      confidence,
      position: bestState,
      cost: bestProb > 0 ? -Math.log(bestProb) : 999
    };
  }
  
  private averageFeatures(history: AudioFeatures[]): AudioFeatures {
    if (history.length === 0) {
      return { rms: 0, zcr: 0, mfcc: new Array(13).fill(0), spectralRolloff: 0, spectralCentroid: 0 };
    }
    
    if (history.length === 1) {
      return history[0];
    }
    
    const avgMfcc = new Array(13).fill(0);
    let avgRms = 0, avgZcr = 0, avgRolloff = 0, avgCentroid = 0;
    
    for (const f of history) {
      avgRms += f.rms;
      avgZcr += f.zcr;
      avgRolloff += f.spectralRolloff;
      avgCentroid += f.spectralCentroid;
      for (let i = 0; i < 13; i++) {
        avgMfcc[i] += f.mfcc[i];
      }
    }
    
    const n = history.length;
    return {
      rms: avgRms / n,
      zcr: avgZcr / n,
      mfcc: avgMfcc.map(m => m / n),
      spectralRolloff: avgRolloff / n,
      spectralCentroid: avgCentroid / n
    };
  }
  
  getCurrentPage(): number {
    return this.currentPage;
  }
  
  getBeliefDistribution(): { state: number; prob: number }[] {
    if (!this.beliefs) return [];
    
    const result: { state: number; prob: number }[] = [];
    for (let i = 0; i < this.beliefs.length; i++) {
      if (this.beliefs[i] > 0.01) {
        result.push({ state: i, prob: this.beliefs[i] });
      }
    }
    return result.sort((a, b) => b.prob - a.prob).slice(0, 10);
  }
}

export const viterbiMatcher = new ViterbiMatcher();
