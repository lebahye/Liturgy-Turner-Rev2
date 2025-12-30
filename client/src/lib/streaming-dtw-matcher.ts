import { type AudioFeatures, applyEMA, averageFeatures } from './audio-features';
import { 
  type CanonicalTimeline, 
  type PageMarkerData, 
  buildCanonicalTimeline, 
  computeFrameDistance 
} from './canonical-timeline';

export type { PageMarkerData } from './canonical-timeline';

export interface DTWMatchResult {
  currentPage: number;
  estimatedTimelinePosition: number;
  confidence: number;
  pathCost: number;
  elapsedMs: number;
}

export class StreamingDTWMatcher {
  private timeline: CanonicalTimeline | null = null;
  private startTime: number = 0;
  private isRunning: boolean = false;
  private onPageChange?: (page: number, confidence: number) => void;
  private onConfidenceUpdate?: (confidence: number) => void;
  
  private currentPage: number = 1;
  private lastPageTurnTime: number = 0;
  private estimatedPosition: number = 0;
  
  private recentFeatures: AudioFeatures[] = [];
  private smoothedFeatures: AudioFeatures | null = null;
  private featureBufferSize: number = 30;
  
  private warmupFrames: number = 0;
  private warmupRequired: number = 50;
  
  private dtwWindow: number = 100;
  private searchRadius: number = 50;
  private positionHistory: number[] = [];
  private costHistory: number[] = [];
  
  private debugMode: boolean = true;
  private lastDebugTime: number = 0;
  
  private minTimeBetweenTurns: number = 3000;
  private costThreshold: number = 50;

  setMarkers(markers: PageMarkerData[]) {
    this.timeline = buildCanonicalTimeline(markers, 100);
    
    if (this.timeline.pageBoundaries.length > 1) {
      const firstBoundary = this.timeline.pageBoundaries[0];
      const lastBoundary = this.timeline.pageBoundaries[this.timeline.pageBoundaries.length - 1];
      const totalTime = lastBoundary.timestampMs - firstBoundary.timestampMs;
      const avgPageTime = totalTime / (this.timeline.pageBoundaries.length - 1);
      this.minTimeBetweenTurns = Math.max(2000, avgPageTime * 0.3);
    }
    
    console.log('StreamingDTW: Built timeline with', 
      this.timeline.frames.length, 'frames,',
      this.timeline.pageBoundaries.length, 'page boundaries');
    console.log('StreamingDTW: Min time between turns:', (this.minTimeBetweenTurns / 1000).toFixed(1), 's');
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
    this.estimatedPosition = 0;
    this.recentFeatures = [];
    this.smoothedFeatures = null;
    this.warmupFrames = 0;
    this.positionHistory = [];
    this.costHistory = [];
    this.lastDebugTime = 0;
    
    console.log('StreamingDTW: Started - warming up...');
  }

  stop() {
    this.isRunning = false;
    this.recentFeatures = [];
    this.smoothedFeatures = null;
    this.positionHistory = [];
    this.costHistory = [];
    console.log('StreamingDTW: Stopped');
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

  processAudioFeatures(features: AudioFeatures) {
    if (!this.isRunning || !this.timeline) return;

    this.warmupFrames++;
    
    if (this.warmupFrames < this.warmupRequired) {
      return;
    }
    
    if (this.warmupFrames === this.warmupRequired) {
      console.log('StreamingDTW: Ready - aligning to training timeline');
    }

    this.smoothedFeatures = applyEMA(features, this.smoothedFeatures, 0.2);
    
    this.recentFeatures.push(this.smoothedFeatures);
    if (this.recentFeatures.length > this.featureBufferSize) {
      this.recentFeatures.shift();
    }

    if (this.recentFeatures.length < 15) {
      return;
    }

    const elapsedMs = this.getElapsedMs();
    const avgFeatures = averageFeatures(this.recentFeatures.slice(-15));
    
    const match = this.findTimelinePosition(avgFeatures, elapsedMs);
    
    if (this.onConfidenceUpdate) {
      this.onConfidenceUpdate(match.confidence);
    }

    if (this.debugMode && elapsedMs - this.lastDebugTime > 2000) {
      this.lastDebugTime = elapsedMs;
      const timeSinceTurn = Date.now() - this.lastPageTurnTime;
      console.log(`[${(elapsedMs/1000).toFixed(1)}s] page=${this.currentPage}, ` +
        `pos=${match.estimatedTimelinePosition.toFixed(0)}, ` +
        `cost=${match.pathCost.toFixed(1)}, ` +
        `conf=${match.confidence.toFixed(0)}%, ` +
        `sinceLastTurn=${(timeSinceTurn/1000).toFixed(1)}s`);
    }

    const timeSinceLastTurn = Date.now() - this.lastPageTurnTime;
    
    if (match.currentPage > this.currentPage && 
        match.confidence >= 70 &&
        match.pathCost < this.costThreshold &&
        timeSinceLastTurn >= this.minTimeBetweenTurns) {
      
      console.log(`PAGE TURN: ${this.currentPage} -> ${match.currentPage} ` +
        `(pos=${match.estimatedTimelinePosition.toFixed(0)}, ` +
        `cost=${match.pathCost.toFixed(1)}, conf=${match.confidence.toFixed(0)}%)`);
      
      this.currentPage = match.currentPage;
      this.lastPageTurnTime = Date.now();
      
      if (this.onPageChange) {
        this.onPageChange(match.currentPage, match.confidence);
      }
    }

    return match;
  }

  private findTimelinePosition(liveFeatures: AudioFeatures, elapsedMs: number): DTWMatchResult {
    if (!this.timeline || this.timeline.frames.length === 0) {
      return {
        currentPage: this.currentPage,
        estimatedTimelinePosition: 0,
        confidence: 0,
        pathCost: Infinity,
        elapsedMs,
      };
    }

    const expectedPosition = Math.floor(elapsedMs / this.timeline.hopMs);
    
    const searchStart = Math.max(0, expectedPosition - this.searchRadius);
    const searchEnd = Math.min(this.timeline.frames.length - 1, expectedPosition + this.searchRadius);

    let bestPosition = expectedPosition;
    let bestCost = Infinity;

    for (let i = searchStart; i <= searchEnd; i++) {
      const frame = this.timeline.frames[i];
      if (!frame) continue;
      
      const cost = computeFrameDistance(liveFeatures, frame.features);
      
      const positionPenalty = Math.abs(i - expectedPosition) * 0.1;
      const totalCost = cost + positionPenalty;
      
      if (totalCost < bestCost) {
        bestCost = totalCost;
        bestPosition = i;
      }
    }

    this.positionHistory.push(bestPosition);
    this.costHistory.push(bestCost);
    
    if (this.positionHistory.length > 20) {
      this.positionHistory.shift();
      this.costHistory.shift();
    }

    const smoothedPosition = this.positionHistory.reduce((a, b) => a + b, 0) / this.positionHistory.length;
    const avgCost = this.costHistory.reduce((a, b) => a + b, 0) / this.costHistory.length;

    this.estimatedPosition = smoothedPosition;

    let detectedPage = this.currentPage;
    for (const boundary of this.timeline.pageBoundaries) {
      if (smoothedPosition >= boundary.frameIndex) {
        detectedPage = boundary.pageNumber;
      }
    }

    const confidence = Math.max(0, Math.min(100, 100 - avgCost * 2));

    return {
      currentPage: detectedPage,
      estimatedTimelinePosition: smoothedPosition,
      confidence,
      pathCost: avgCost,
      elapsedMs,
    };
  }

  getCurrentMatch(): DTWMatchResult {
    const avgFeatures = this.recentFeatures.length > 0 
      ? averageFeatures(this.recentFeatures.slice(-15))
      : { rms: 0, zcr: 0, spectralCentroid: 0, spectralRolloff: 0, mfcc: [] };
    return this.findTimelinePosition(avgFeatures, this.getElapsedMs());
  }
}

export const streamingDTWMatcher = new StreamingDTWMatcher();
