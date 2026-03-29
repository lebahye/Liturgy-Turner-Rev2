/**
 * Audio Normalizer — Liturgy Turner
 * Corrects phone speaker frequency response before MFCC comparison
 * Fixes the core reason phone tests fail against mic-built fingerprints
 */

import fs from 'fs';
import path from 'path';

interface CorrectionProfile {
  createdAt: string;
  sampleCount: number;
  mfccOffsets: number[];      // per-coefficient additive correction
  mfccScaleFactors: number[]; // per-coefficient multiplicative correction
  rmsScale: number;           // RMS volume normalization factor
  centroidOffset: number;     // spectral centroid shift
  description: string;
}

export class AudioNormalizer {
  private profile: CorrectionProfile | null = null;
  private dataDir: string;
  private profileFile: string;

  constructor() {
    this.dataDir = path.join(process.cwd(), 'training-data');
    this.profileFile = path.join(this.dataDir, 'phone-correction-profile.json');
    this.loadProfile();
  }

  private loadProfile(): void {
    try {
      if (fs.existsSync(this.profileFile)) {
        this.profile = JSON.parse(fs.readFileSync(this.profileFile, 'utf8'));
        console.log('[AudioNormalizer] Correction profile loaded');
      } else {
        console.log('[AudioNormalizer] No correction profile found — running uncorrected');
        console.log('[AudioNormalizer] Run calibration to fix phone vs mic mismatch');
      }
    } catch (e) {
      console.error('[AudioNormalizer] Failed to load profile:', e);
    }
  }

  /**
   * Apply correction to live MFCC features before comparison
   * Call this in processLiveAudio() before matchFingerprint()
   */
  correctMFCC(mfcc: number[]): number[] {
    if (!this.profile || !this.profile.mfccOffsets) return mfcc;

    return mfcc.map((coeff, i) => {
      const offset = this.profile!.mfccOffsets[i] || 0;
      const scale = this.profile!.mfccScaleFactors[i] || 1.0;
      return (coeff + offset) * scale;
    });
  }

  correctRMS(rms: number): number {
    if (!this.profile) return rms;
    return rms * (this.profile.rmsScale || 1.0);
  }

  correctCentroid(centroid: number): number {
    if (!this.profile) return centroid;
    return centroid + (this.profile.centroidOffset || 0);
  }

  /**
   * Calibration mode — learns correction from paired samples
   * 
   * phoneSamples: MFCC arrays extracted from phone-played audio
   * micSamples: MFCC arrays extracted from same audio through mic (from fingerprints)
   * 
   * In practice: take 10 pages from your fingerprints.json (mic data)
   * and record yourself playing those same sections through your phone
   * then extract MFCC from both and call this function
   */
  calibrate(
    phoneSamples: { mfcc: number[]; rms: number; centroid: number }[],
    micSamples: { mfcc: number[]; rms: number; centroid: number }[]
  ): CorrectionProfile {
    if (phoneSamples.length === 0 || micSamples.length !== phoneSamples.length) {
      throw new Error('Paired samples required: same number of phone and mic samples');
    }

    const mfccLen = phoneSamples[0].mfcc.length;
    const offsets = new Array(mfccLen).fill(0);
    const scales = new Array(mfccLen).fill(1.0);
    let rmsScaleSum = 0;
    let centroidOffsetSum = 0;

    // Calculate per-coefficient correction
    for (let i = 0; i < phoneSamples.length; i++) {
      const phone = phoneSamples[i];
      const mic = micSamples[i];

      // For each MFCC coefficient: how much does phone differ from mic?
      for (let c = 0; c < mfccLen; c++) {
        offsets[c] += (mic.mfcc[c] - phone.mfcc[c]);
        if (Math.abs(phone.mfcc[c]) > 0.001) {
          scales[c] += (mic.mfcc[c] / phone.mfcc[c]);
        }
      }

      rmsScaleSum += mic.rms / (phone.rms || 0.001);
      centroidOffsetSum += (mic.centroid - phone.centroid);
    }

    const n = phoneSamples.length;
    const profile: CorrectionProfile = {
      createdAt: new Date().toISOString(),
      sampleCount: n,
      mfccOffsets: offsets.map(o => o / n),
      mfccScaleFactors: scales.map(s => s / n),
      rmsScale: rmsScaleSum / n,
      centroidOffset: centroidOffsetSum / n,
      description: `Calibrated from ${n} paired phone/mic samples`
    };

    fs.writeFileSync(this.profileFile, JSON.stringify(profile, null, 2));
    this.profile = profile;

    console.log('[AudioNormalizer] ✅ Calibration complete');
    console.log(`[AudioNormalizer] Samples: ${n}`);
    console.log(`[AudioNormalizer] RMS scale: ${profile.rmsScale.toFixed(3)}`);
    console.log(`[AudioNormalizer] Centroid offset: ${profile.centroidOffset.toFixed(1)}`);
    console.log(`[AudioNormalizer] Profile saved: ${this.profileFile}`);

    return profile;
  }

  /**
   * Quick calibration using existing fingerprints as the mic reference
   * Extract MFCC from phone-played audio for the same pages
   * and call this with just the phone samples
   */
  calibrateFromFingerprints(
    phonePageSamples: { pageNumber: number; mfcc: number[]; rms: number; centroid: number }[]
  ): CorrectionProfile {
    const fingerprintsFile = path.join(this.dataDir, 'fingerprints.json');
    const fingerprints = JSON.parse(fs.readFileSync(fingerprintsFile, 'utf8'));

    const micSamples: { mfcc: number[]; rms: number; centroid: number }[] = [];
    const phoneSamplesFiltered: { mfcc: number[]; rms: number; centroid: number }[] = [];

    for (const phoneSample of phonePageSamples) {
      const fp = fingerprints.find((f: any) => f.pageNumber === phoneSample.pageNumber);
      if (fp && fp.features?.mfcc?.length > 0) {
        micSamples.push({
          mfcc: fp.features.mfcc,
          rms: fp.features.rms,
          centroid: fp.features.spectralCentroid
        });
        phoneSamplesFiltered.push({
          mfcc: phoneSample.mfcc,
          rms: phoneSample.rms,
          centroid: phoneSample.centroid
        });
      }
    }

    if (phoneSamplesFiltered.length < 3) {
      throw new Error(`Need at least 3 matched pages for calibration. Got ${phoneSamplesFiltered.length}.`);
    }

    console.log(`[AudioNormalizer] Calibrating from ${phoneSamplesFiltered.length} fingerprint-matched pages`);
    return this.calibrate(phoneSamplesFiltered, micSamples);
  }

  hasProfile(): boolean {
    return this.profile !== null;
  }

  getProfileSummary(): string {
    if (!this.profile) return 'No correction profile loaded';
    return `Profile from ${this.profile.createdAt} (${this.profile.sampleCount} samples)`;
  }
}

// Singleton
let _normalizer: AudioNormalizer | null = null;

export function getAudioNormalizer(): AudioNormalizer {
  if (!_normalizer) _normalizer = new AudioNormalizer();
  return _normalizer;
}
