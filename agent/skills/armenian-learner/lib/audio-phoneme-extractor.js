/**
 * Audio Phoneme Extractor
 * 
 * Extracts sound patterns from audio recordings
 * Works with SUNG/CHANTED liturgical Armenian, not spoken
 */

import Meyda from 'meyda';

export class AudioPhonemeExtractor {
  constructor() {
    this.sampleRate = 44100;
    this.hopSize = 512;
    this.bufferSize = 2048;
  }

  /**
   * Extract sound signature from audio segment
   * @param {Float32Array} audioBuffer - Audio samples
   * @param {number} sampleRate - Sample rate (default 44100)
   * @returns {Object} Sound signature with MFCC, spectral features, etc.
   */
  extractSignature(audioBuffer, sampleRate = 44100) {
    this.sampleRate = sampleRate;
    
    try {
      // Chunk audio into power-of-2 frames for Meyda
      const chunks = this.chunkAudio(audioBuffer, this.bufferSize);
      
      if (chunks.length === 0) {
        console.warn('[audio-extractor] No valid chunks extracted, returning default');
        return this.getDefaultSignature();
      }
      
      // Extract features from each chunk
      const allFeatures = chunks.map(chunk => {
        return Meyda.extract([
          'mfcc',
          'spectralCentroid',
          'spectralRolloff',
          'rms',
          'zcr',
          'spectralFlatness',
          'spectralKurtosis'
        ], chunk);
      });
      
      // Average features across all chunks
      const features = this.averageFeatures(allFeatures);
      
      // Calculate duration
      const duration = audioBuffer.length / sampleRate;
      
      // Build spectral fingerprint (simplified)
      const spectralFingerprint = this.buildSpectralFingerprint(audioBuffer);
      
      // Estimate phonemes (basic pitch/energy patterns)
      const phonemes = this.estimatePhonemes(audioBuffer);
      
      return {
        mfcc: features.mfcc || [],
        spectralCentroid: features.spectralCentroid || 0,
        spectralRolloff: features.spectralRolloff || 0,
        rms: features.rms || 0,
        zcr: features.zcr || 0,
        spectralFlatness: features.spectralFlatness || 0,
        spectralKurtosis: features.spectralKurtosis || 0,
        duration,
        spectralFingerprint,
        phonemes,
        chunksProcessed: chunks.length
      };
    } catch (error) {
      console.error('[audio-extractor] Error extracting features:', error.message);
      return this.getDefaultSignature();
    }
  }

  /**
   * Chunk audio into power-of-2 sized frames for Meyda
   * @param {Float32Array} audioBuffer - Full audio buffer
   * @param {number} frameSize - Power-of-2 frame size (e.g., 2048)
   * @returns {Array<Float32Array>} Array of audio chunks
   */
  chunkAudio(audioBuffer, frameSize) {
    const chunks = [];
    const hopSize = Math.floor(frameSize / 2); // 50% overlap for smoother analysis
    
    for (let i = 0; i < audioBuffer.length - frameSize; i += hopSize) {
      const chunk = audioBuffer.slice(i, i + frameSize);
      if (chunk.length === frameSize) {
        chunks.push(chunk);
      }
    }
    
    return chunks;
  }

  /**
   * Average features across multiple chunks
   * @param {Array} allFeatures - Array of feature objects from Meyda
   * @returns {Object} Averaged features
   */
  averageFeatures(allFeatures) {
    if (allFeatures.length === 0) {
      return {
        mfcc: new Array(13).fill(0),
        spectralCentroid: 0,
        spectralRolloff: 0,
        rms: 0,
        zcr: 0,
        spectralFlatness: 0,
        spectralKurtosis: 0
      };
    }
    
    const averaged = {
      mfcc: new Array(13).fill(0),
      spectralCentroid: 0,
      spectralRolloff: 0,
      rms: 0,
      zcr: 0,
      spectralFlatness: 0,
      spectralKurtosis: 0
    };
    
    // Sum all features
    allFeatures.forEach(features => {
      if (features.mfcc) {
        features.mfcc.forEach((val, idx) => {
          averaged.mfcc[idx] += val;
        });
      }
      averaged.spectralCentroid += features.spectralCentroid || 0;
      averaged.spectralRolloff += features.spectralRolloff || 0;
      averaged.rms += features.rms || 0;
      averaged.zcr += features.zcr || 0;
      averaged.spectralFlatness += features.spectralFlatness || 0;
      averaged.spectralKurtosis += features.spectralKurtosis || 0;
    });
    
    // Divide by count to get averages
    const count = allFeatures.length;
    averaged.mfcc = averaged.mfcc.map(val => val / count);
    averaged.spectralCentroid /= count;
    averaged.spectralRolloff /= count;
    averaged.rms /= count;
    averaged.zcr /= count;
    averaged.spectralFlatness /= count;
    averaged.spectralKurtosis /= count;
    
    return averaged;
  }

  buildSpectralFingerprint(audioBuffer, numBands = 12) {
    // Divide frequency spectrum into bands and get average energy per band
    const fingerprint = new Array(numBands).fill(0);
    const samplesPerBand = Math.floor(audioBuffer.length / numBands);
    
    for (let i = 0; i < numBands; i++) {
      const start = i * samplesPerBand;
      const end = Math.min(start + samplesPerBand, audioBuffer.length);
      
      let energy = 0;
      for (let j = start; j < end; j++) {
        energy += Math.abs(audioBuffer[j]);
      }
      
      fingerprint[i] = energy / samplesPerBand;
    }
    
    return fingerprint;
  }

  estimatePhonemes(audioBuffer) {
    // Basic phoneme estimation using energy and pitch changes
    // This is simplified - real phoneme detection is complex
    
    const phonemes = [];
    const windowSize = Math.floor(this.sampleRate * 0.05); // 50ms windows
    const numWindows = Math.floor(audioBuffer.length / windowSize);
    
    for (let i = 0; i < numWindows; i++) {
      const start = i * windowSize;
      const end = Math.min(start + windowSize, audioBuffer.length);
      const window = audioBuffer.slice(start, end);
      
      // Calculate energy
      const energy = this.calculateRMS(window);
      
      // Calculate zero-crossing rate (rough pitch indicator)
      const zcr = this.calculateZCR(window);
      
      // Classify into rough phoneme types
      if (energy > 0.01) {
        if (zcr > 100) {
          phonemes.push('s'); // Sibilant/fricative
        } else if (zcr < 30) {
          phonemes.push('m'); // Nasal/vowel
        } else {
          phonemes.push('t'); // Stop/plosive
        }
      }
    }
    
    return phonemes;
  }

  calculateRMS(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }

  calculateZCR(samples) {
    let crossings = 0;
    for (let i = 1; i < samples.length; i++) {
      if ((samples[i] >= 0 && samples[i - 1] < 0) || 
          (samples[i] < 0 && samples[i - 1] >= 0)) {
        crossings++;
      }
    }
    return crossings;
  }

  getDefaultSignature() {
    return {
      mfcc: new Array(13).fill(0),
      spectralCentroid: 0,
      spectralRolloff: 0,
      rms: 0,
      zcr: 0,
      spectralFlatness: 0,
      spectralKurtosis: 0,
      duration: 0,
      spectralFingerprint: new Array(12).fill(0),
      phonemes: []
    };
  }

  /**
   * Process entire audio file and extract features for segments
   * @param {Float32Array} fullAudio - Complete audio buffer
   * @param {Array} segments - Array of {start, end, page} objects
   * @returns {Array} Array of signatures for each segment
   */
  processSegments(fullAudio, segments, sampleRate = 44100) {
    console.log(`[audio-extractor] Processing ${segments.length} segments...`);
    
    return segments.map((segment, idx) => {
      const startSample = Math.floor(segment.start * sampleRate);
      const endSample = Math.floor(segment.end * sampleRate);
      const audioSlice = fullAudio.slice(startSample, endSample);
      
      const signature = this.extractSignature(audioSlice, sampleRate);
      
      if (idx % 10 === 0) {
        console.log(`[audio-extractor] Processed ${idx + 1}/${segments.length} segments`);
      }
      
      return {
        page: segment.page,
        start: segment.start,
        end: segment.end,
        signature
      };
    });
  }
}
