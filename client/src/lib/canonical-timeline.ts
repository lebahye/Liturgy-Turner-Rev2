import { type AudioFeatures } from './audio-features';

export interface TimelineFrame {
  timestampMs: number;
  features: AudioFeatures;
  pageNumber: number;
  isPageBoundary: boolean;
}

export interface CanonicalTimeline {
  frames: TimelineFrame[];
  pageBoundaries: Array<{
    pageNumber: number;
    frameIndex: number;
    timestampMs: number;
  }>;
  hopMs: number;
  totalDurationMs: number;
}

export interface PageMarkerData {
  pageNumber: number;
  timestampMs: number;
  audioFeatures: AudioFeatures;
}

export function buildCanonicalTimeline(
  markers: PageMarkerData[],
  hopMs: number = 100
): CanonicalTimeline {
  if (markers.length === 0) {
    return { frames: [], pageBoundaries: [], hopMs, totalDurationMs: 0 };
  }

  const sortedMarkers = [...markers].sort((a, b) => a.timestampMs - b.timestampMs);
  
  const firstTimestamp = 0;
  const lastTimestamp = sortedMarkers[sortedMarkers.length - 1].timestampMs + 10000;
  const totalDurationMs = lastTimestamp;

  const frames: TimelineFrame[] = [];
  const pageBoundaries: Array<{pageNumber: number; frameIndex: number; timestampMs: number}> = [];

  let currentMarkerIndex = 0;
  let currentPage = sortedMarkers[0].pageNumber - 1;

  for (let t = firstTimestamp; t <= lastTimestamp; t += hopMs) {
    while (currentMarkerIndex < sortedMarkers.length && 
           sortedMarkers[currentMarkerIndex].timestampMs <= t) {
      const marker = sortedMarkers[currentMarkerIndex];
      currentPage = marker.pageNumber;
      
      pageBoundaries.push({
        pageNumber: marker.pageNumber,
        frameIndex: frames.length,
        timestampMs: marker.timestampMs,
      });
      
      currentMarkerIndex++;
    }

    let frameFeatures: AudioFeatures;
    
    const nearestMarker = findNearestMarker(sortedMarkers, t);
    if (nearestMarker) {
      const distance = Math.abs(t - nearestMarker.timestampMs);
      const weight = Math.exp(-distance / 2000);
      frameFeatures = interpolateFeatures(nearestMarker.audioFeatures, weight);
    } else {
      frameFeatures = { rms: 0, zcr: 0, spectralCentroid: 0, spectralRolloff: 0, mfcc: [] };
    }

    const isPageBoundary = pageBoundaries.some(
      pb => Math.abs(pb.timestampMs - t) < hopMs
    );

    frames.push({
      timestampMs: t,
      features: frameFeatures,
      pageNumber: currentPage,
      isPageBoundary,
    });
  }

  console.log(`Built canonical timeline: ${frames.length} frames, ${pageBoundaries.length} page boundaries`);

  return {
    frames,
    pageBoundaries,
    hopMs,
    totalDurationMs,
  };
}

function findNearestMarker(markers: PageMarkerData[], timestamp: number): PageMarkerData | null {
  let nearest: PageMarkerData | null = null;
  let minDistance = Infinity;

  for (const marker of markers) {
    const distance = Math.abs(marker.timestampMs - timestamp);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = marker;
    }
  }

  return nearest;
}

function interpolateFeatures(features: AudioFeatures, weight: number): AudioFeatures {
  return {
    rms: features.rms * weight,
    zcr: features.zcr * weight,
    spectralCentroid: features.spectralCentroid * weight,
    spectralRolloff: features.spectralRolloff * weight,
    mfcc: features.mfcc.map(v => v * weight),
  };
}

export function computeFrameDistance(a: AudioFeatures, b: AudioFeatures): number {
  if (!a.mfcc || !b.mfcc || a.mfcc.length === 0 || b.mfcc.length === 0) {
    return Infinity;
  }

  const minLen = Math.min(a.mfcc.length, b.mfcc.length, 13);
  let mfccDist = 0;
  
  for (let i = 0; i < minLen; i++) {
    const weight = i < 4 ? 2.0 : (i < 8 ? 1.5 : 1.0);
    const diff = a.mfcc[i] - b.mfcc[i];
    mfccDist += diff * diff * weight;
  }
  mfccDist = Math.sqrt(mfccDist / minLen);

  const rmsDiff = Math.abs(a.rms - b.rms) * 100;
  const zcrDiff = Math.abs(a.zcr - b.zcr) / 10;

  return mfccDist + rmsDiff * 0.5 + zcrDiff * 0.3;
}
