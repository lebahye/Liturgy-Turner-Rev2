export type AudioFeatures = {
  rms: number;
  zcr: number;
  mfcc: number[];
  spectralCentroid?: number;
  spectralFlatness?: number;
};

export type PageMarker = {
  pageNumber: number;
  timestampMs: number;
  audioFeatures: AudioFeatures | null;
};

export type FingerprintMatcher = {
  matchPage: (liveFeatures: AudioFeatures, currentPage: number) => {
    bestPage: number;
    confidence: number;
    scores: Map<number, number>;
  };
  getPageCount: () => number;
};

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  
  return dotProduct / denominator;
}

function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return Infinity;
  
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  
  return Math.sqrt(sum);
}

function compareFeatures(live: AudioFeatures, stored: AudioFeatures): number {
  if (!live.mfcc || !stored.mfcc) return 0;
  
  const mfccSimilarity = cosineSimilarity(live.mfcc, stored.mfcc);
  
  const rmsScore = 1 - Math.min(1, Math.abs(live.rms - stored.rms) / Math.max(stored.rms, 0.01));
  const zcrScore = 1 - Math.min(1, Math.abs(live.zcr - stored.zcr) / Math.max(stored.zcr, 1));
  
  const score = mfccSimilarity * 0.7 + rmsScore * 0.15 + zcrScore * 0.15;
  
  return Math.max(0, Math.min(1, score));
}

export function createFingerprintMatcher(markers: PageMarker[]): FingerprintMatcher {
  const pageFeatures = new Map<number, AudioFeatures[]>();
  
  for (const marker of markers) {
    if (marker.audioFeatures) {
      const existing = pageFeatures.get(marker.pageNumber) || [];
      existing.push(marker.audioFeatures);
      pageFeatures.set(marker.pageNumber, existing);
    }
  }
  
  const pageNumbers = Array.from(pageFeatures.keys()).sort((a, b) => a - b);
  console.log(`[FingerprintMatcher] Loaded ${markers.length} markers for pages ${pageNumbers.join(', ')}`);
  
  return {
    matchPage(liveFeatures: AudioFeatures, currentPage: number) {
      const scores = new Map<number, number>();
      let bestPage = currentPage;
      let bestScore = 0;
      
      const pagesToCheck = [currentPage, currentPage + 1];
      if (currentPage > 1) pagesToCheck.push(currentPage - 1);
      
      for (const pageNum of pagesToCheck) {
        const storedFeatures = pageFeatures.get(pageNum);
        if (!storedFeatures || storedFeatures.length === 0) continue;
        
        let maxScore = 0;
        for (const stored of storedFeatures) {
          const score = compareFeatures(liveFeatures, stored);
          if (score > maxScore) maxScore = score;
        }
        
        scores.set(pageNum, maxScore);
        
        if (maxScore > bestScore) {
          bestScore = maxScore;
          bestPage = pageNum;
        }
      }
      
      return {
        bestPage,
        confidence: bestScore,
        scores,
      };
    },
    
    getPageCount() {
      return pageNumbers.length;
    },
  };
}
