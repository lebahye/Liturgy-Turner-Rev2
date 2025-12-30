import Meyda from 'meyda';

export interface AudioFeatures {
  rms: number;
  zcr: number;
  spectralCentroid: number;
  spectralRolloff: number;
  mfcc: number[];
}

export type MeydaAnalyzer = ReturnType<typeof Meyda.createMeydaAnalyzer>;

export function createAudioAnalyzer(
  audioContext: AudioContext,
  source: MediaStreamAudioSourceNode,
  onFeatures: (features: AudioFeatures) => void
): MeydaAnalyzer {
  const analyzer = Meyda.createMeydaAnalyzer({
    audioContext,
    source,
    bufferSize: 2048,
    featureExtractors: ['rms', 'zcr', 'spectralCentroid', 'spectralRolloff', 'mfcc'],
    callback: (features: any) => {
      if (features) {
        onFeatures({
          rms: features.rms || 0,
          zcr: features.zcr || 0,
          spectralCentroid: features.spectralCentroid || 0,
          spectralRolloff: features.spectralRolloff || 0,
          mfcc: features.mfcc || [],
        });
      }
    },
  });

  return analyzer;
}

export function normalizeFeatures(features: AudioFeatures): AudioFeatures {
  const mfccNormalized = features.mfcc.map(v => {
    const absVal = Math.abs(v);
    if (absVal < 1) return v;
    return v / Math.max(absVal, 100);
  });

  return {
    rms: Math.log1p(features.rms * 100),
    zcr: features.zcr / 500,
    spectralCentroid: features.spectralCentroid / 300,
    spectralRolloff: features.spectralRolloff / 20000,
    mfcc: mfccNormalized,
  };
}

export function compareFeatures(live: AudioFeatures, stored: AudioFeatures): number {
  if (!live || !stored) return 0;

  const liveNorm = normalizeFeatures(live);
  const storedNorm = normalizeFeatures(stored);

  const rmsDiff = Math.abs(liveNorm.rms - storedNorm.rms);
  const rmsMatch = Math.exp(-rmsDiff * 2);

  const zcrDiff = Math.abs(liveNorm.zcr - storedNorm.zcr);
  const zcrMatch = Math.exp(-zcrDiff * 3);

  const centroidDiff = Math.abs(liveNorm.spectralCentroid - storedNorm.spectralCentroid);
  const centroidMatch = Math.exp(-centroidDiff * 2);

  const rolloffDiff = Math.abs(liveNorm.spectralRolloff - storedNorm.spectralRolloff);
  const rolloffMatch = Math.exp(-rolloffDiff * 3);

  let mfccMatch = 0;
  if (liveNorm.mfcc && storedNorm.mfcc && liveNorm.mfcc.length > 0 && storedNorm.mfcc.length > 0) {
    const minLen = Math.min(liveNorm.mfcc.length, storedNorm.mfcc.length, 13);
    let sum = 0;
    for (let i = 0; i < minLen; i++) {
      const weight = i < 5 ? 1.5 : 1.0;
      const diff = Math.abs(liveNorm.mfcc[i] - storedNorm.mfcc[i]);
      sum += Math.exp(-diff * 2) * weight;
    }
    mfccMatch = sum / (minLen * 1.25);
  }

  const confidence = (
    rmsMatch * 0.15 +
    zcrMatch * 0.10 +
    centroidMatch * 0.15 +
    rolloffMatch * 0.10 +
    mfccMatch * 0.50
  ) * 100;

  return Math.min(100, Math.max(0, confidence));
}

export function compareFeaturesCosineSimilarity(live: AudioFeatures, stored: AudioFeatures): number {
  if (!live || !stored || !live.mfcc || !stored.mfcc) return 0;
  
  const minLen = Math.min(live.mfcc.length, stored.mfcc.length, 13);
  if (minLen === 0) return 0;
  
  let dotProduct = 0;
  let liveMag = 0;
  let storedMag = 0;
  
  for (let i = 0; i < minLen; i++) {
    dotProduct += live.mfcc[i] * stored.mfcc[i];
    liveMag += live.mfcc[i] * live.mfcc[i];
    storedMag += stored.mfcc[i] * stored.mfcc[i];
  }
  
  liveMag = Math.sqrt(liveMag);
  storedMag = Math.sqrt(storedMag);
  
  if (liveMag < 0.001 || storedMag < 0.001) return 0;
  
  const cosineSim = dotProduct / (liveMag * storedMag);
  return Math.max(0, (cosineSim + 1) / 2) * 100;
}

export function averageFeatures(featuresList: AudioFeatures[]): AudioFeatures {
  if (featuresList.length === 0) {
    return { rms: 0, zcr: 0, spectralCentroid: 0, spectralRolloff: 0, mfcc: [] };
  }

  const sum = featuresList.reduce((acc, f) => ({
    rms: acc.rms + f.rms,
    zcr: acc.zcr + f.zcr,
    spectralCentroid: acc.spectralCentroid + f.spectralCentroid,
    spectralRolloff: acc.spectralRolloff + f.spectralRolloff,
    mfcc: f.mfcc.map((v, i) => (acc.mfcc[i] || 0) + v),
  }), { rms: 0, zcr: 0, spectralCentroid: 0, spectralRolloff: 0, mfcc: [] as number[] });

  const n = featuresList.length;
  return {
    rms: sum.rms / n,
    zcr: sum.zcr / n,
    spectralCentroid: sum.spectralCentroid / n,
    spectralRolloff: sum.spectralRolloff / n,
    mfcc: sum.mfcc.map(v => v / n),
  };
}

export function applyEMA(current: AudioFeatures, previous: AudioFeatures | null, alpha: number = 0.3): AudioFeatures {
  if (!previous) return current;
  
  return {
    rms: alpha * current.rms + (1 - alpha) * previous.rms,
    zcr: alpha * current.zcr + (1 - alpha) * previous.zcr,
    spectralCentroid: alpha * current.spectralCentroid + (1 - alpha) * previous.spectralCentroid,
    spectralRolloff: alpha * current.spectralRolloff + (1 - alpha) * previous.spectralRolloff,
    mfcc: current.mfcc.map((v, i) => alpha * v + (1 - alpha) * (previous.mfcc[i] || 0)),
  };
}
