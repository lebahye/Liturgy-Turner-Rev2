#!/usr/bin/env node
/**
 * Test the Liturgy Live Tracker against the full recording
 * Simulates live audio processing and measures accuracy
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Meyda = require('meyda');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WAV_PATH = path.join(__dirname, 'full_service.wav');

console.log('🧪 Testing Liturgy Live Tracker');
console.log('================================\n');

// Load symlinked WAV if exists, otherwise look for actual file
let wavFile = WAV_PATH;
if (!fs.existsSync(wavFile)) {
  wavFile = path.join(__dirname, 'agent/full_service.wav');
}

if (!fs.existsSync(wavFile)) {
  console.error('❌ WAV file not found at:', WAV_PATH);
  console.error('   Or at:', path.join(__dirname, 'agent/full_service.wav'));
  console.error('\n💡 Make sure full_service.wav is accessible');
  process.exit(1);
}

console.log(`📂 Loading audio from: ${wavFile}`);

// Simple mock of the LiturgyPageTracker class
class MockLiturgyTracker {
  constructor() {
    this.currentPage = 1;
    this.currentSpeaker = null;
    this.lastTransitionTime = 0;
    
    // Load data
    const dataDir = path.join(__dirname, 'training-data');
    this.liveTrackerData = JSON.parse(fs.readFileSync(path.join(dataDir, 'live-tracker-data.json'), 'utf8'));
    this.fingerprints = JSON.parse(fs.readFileSync(path.join(dataDir, 'fingerprints.json'), 'utf8'));
    this.speakerModels = JSON.parse(fs.readFileSync(path.join(dataDir, 'speaker-models.json'), 'utf8'));
    
    console.log(`✅ Loaded ${this.fingerprints.length} fingerprints`);
    console.log(`✅ Loaded ${this.liveTrackerData.pages.length} page signatures\n`);
  }
  
  processLiveAudio(audioBuffer, timestamp) {
    const features = this.extractFeatures(audioBuffer);
    const detectedSpeaker = this.classifySpeaker(features);
    
    // Check if enough time since last transition
    if (timestamp - this.lastTransitionTime < 3000) {
      return { page: this.currentPage, changed: false };
    }
    
    // Get candidates (next 3 pages)
    const candidates = [];
    for (let i = 1; i <= 3; i++) {
      const pageNum = this.currentPage + i;
      if (pageNum <= 183) candidates.push(pageNum);
    }
    
    // Score each candidate
    const scores = candidates.map(pageNum => ({
      pageNumber: pageNum,
      score: this.scorePage(pageNum, features, detectedSpeaker)
    }));
    
    scores.sort((a, b) => b.score - a.score);
    const best = scores[0];
    
    // Advance if confident
    if (best && best.score > 0.75 && best.pageNumber > this.currentPage) {
      const previousPage = this.currentPage;
      this.currentPage = best.pageNumber;
      this.currentSpeaker = detectedSpeaker;
      this.lastTransitionTime = timestamp;
      
      return {
        page: this.currentPage,
        changed: true,
        confidence: best.score,
        jumped: best.pageNumber > previousPage + 1
      };
    }
    
    return { page: this.currentPage, changed: false };
  }
  
  extractFeatures(audioBuffer) {
    const windowSize = 2048;
    const hopSize = 512;
    const numFrames = Math.floor((audioBuffer.length - windowSize) / hopSize);
    
    const features = {
      mfcc: [], spectralCentroid: [], spectralFlux: [],
      spectralRolloff: [], rms: [], zcr: []
    };
    
    let lastSpectrum = null;
    
    for (let frame = 0; frame < Math.min(numFrames, 50); frame++) {
      const start = frame * hopSize;
      const frameData = audioBuffer.slice(start, start + windowSize);
      if (frameData.length < windowSize) break;
      
      try {
        const extracted = Meyda.extract([
          'mfcc', 'spectralCentroid', 'spectralRolloff', 'rms', 'zcr', 'powerSpectrum'
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
          
          if (extracted.powerSpectrum && lastSpectrum) {
            let flux = 0;
            for (let i = 0; i < Math.min(lastSpectrum.length, extracted.powerSpectrum.length); i++) {
              const diff = extracted.powerSpectrum[i] - lastSpectrum[i];
              flux += diff * diff;
            }
            features.spectralFlux.push(Math.sqrt(flux));
          }
          
          if (extracted.powerSpectrum) lastSpectrum = extracted.powerSpectrum;
        }
      } catch (err) {}
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
  
  classifySpeaker(features) {
    const fluxVariance = this.calculateVariance(features.spectralFlux);
    if (fluxVariance > 10) return 'choir';
    if (fluxVariance > 2) return 'celebrant';
    return 'deacon';
  }
  
  scorePage(pageNumber, features, detectedSpeaker) {
    let score = 0;
    
    const pageData = this.liveTrackerData.pages.find(p => p.pageNumber === pageNumber);
    if (!pageData) return 0;
    
    // Speaker match (30%)
    if (detectedSpeaker === pageData.speaker) {
      score += 0.3;
    }
    
    // Fingerprint match (70%)
    const fingerprintScore = this.matchFingerprint(features, pageNumber);
    score += fingerprintScore * 0.7;
    
    return score;
  }
  
  matchFingerprint(liveFeatures, pageNumber) {
    const stored = this.fingerprints.find(f => f.pageNumber === pageNumber);
    if (!stored) return 0;
    
    const mfccSim = this.cosineSimilarity(liveFeatures.mfcc, stored.features.mfcc);
    const rmsDiff = Math.abs(liveFeatures.rms - stored.features.rms);
    const rmsScore = Math.exp(-rmsDiff * 100);
    const centroidDiff = Math.abs(liveFeatures.spectralCentroid - stored.features.spectralCentroid);
    const centroidScore = Math.exp(-centroidDiff / 50);
    
    return (mfccSim * 0.6) + (rmsScore * 0.2) + (centroidScore * 0.2);
  }
  
  average(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }
  
  averageArray2D(arr) {
    if (!arr || arr.length === 0) return [];
    const len = arr[0].length;
    const result = new Array(len).fill(0);
    arr.forEach(row => row.forEach((val, i) => result[i] += val));
    return result.map(v => v / arr.length);
  }
  
  calculateVariance(arr) {
    if (!arr || arr.length === 0) return 0;
    const avg = this.average(arr);
    const squaredDiffs = arr.map(v => (v - avg) * (v - avg));
    return this.average(squaredDiffs);
  }
  
  cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dotProduct = 0, magA = 0, magB = 0;
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
  
  reset() {
    this.currentPage = 1;
    this.currentSpeaker = null;
    this.lastTransitionTime = 0;
  }
}

// Parse WAV file
function parseWavHeader(buffer) {
  let offset = 12;
  let audioInfo = null;
  let dataOffset = null;
  
  while (offset < buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    
    if (chunkId === 'fmt ') {
      audioInfo = {
        sampleRate: buffer.readUInt32LE(offset + 12),
        bitsPerSample: buffer.readUInt16LE(offset + 22)
      };
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      break;
    }
    
    offset += 8 + chunkSize;
  }
  
  return { audioInfo, dataOffset };
}

function extractSamples(buffer, dataOffset, audioInfo, startTime, duration) {
  const bytesPerSample = audioInfo.bitsPerSample / 8;
  const startSample = Math.floor(startTime * audioInfo.sampleRate);
  const numSamples = Math.floor(duration * audioInfo.sampleRate);
  const startByte = dataOffset + (startSample * bytesPerSample);
  
  const samples = new Float32Array(numSamples);
  
  for (let i = 0; i < numSamples; i++) {
    const byteIndex = startByte + (i * bytesPerSample);
    if (byteIndex + bytesPerSample > buffer.length) break;
    samples[i] = buffer.readInt16LE(byteIndex) / 32768.0;
  }
  
  return samples;
}

// Run test
console.log('🎬 Starting test simulation...\n');

const buffer = fs.readFileSync(wavFile);
const { audioInfo, dataOffset } = parseWavHeader(buffer);

console.log(`📊 Audio: ${audioInfo.sampleRate}Hz, ${audioInfo.bitsPerSample}bit`);

const durationSec = (buffer.length - dataOffset) / (audioInfo.sampleRate * (audioInfo.bitsPerSample / 8));
console.log(`⏱️  Duration: ${Math.floor(durationSec / 60)}:${Math.floor(durationSec % 60).toString().padStart(2, '0')}\n`);

const tracker = new MockLiturgyTracker();
const testInterval = 10; // Process every 10 seconds
const windowSize = 2; // 2-second audio windows

const results = [];
let detectedPages = [];

console.log('🔍 Processing audio...\n');

for (let time = 0; time < durationSec; time += testInterval) {
  const samples = extractSamples(buffer, dataOffset, audioInfo, time, windowSize);
  const result = tracker.processLiveAudio(samples, time * 1000);
  
  if (result.changed) {
    const expectedPage = Math.min(183, Math.floor(time / 28.6) + 1);
    const error = Math.abs(result.page - expectedPage);
    
    detectedPages.push(result.page);
    results.push({
      time,
      detectedPage: result.page,
      expectedPage,
      error,
      confidence: result.confidence,
      jumped: result.jumped
    });
    
    const status = error === 0 ? '✅' : error <= 2 ? '⚠️' : '❌';
    const timeStr = `${Math.floor(time / 60)}:${(time % 60).toString().padStart(2, '0')}`;
    console.log(`${status} ${timeStr} - Page ${result.page} (expected ~${expectedPage}, conf: ${(result.confidence * 100).toFixed(0)}%)`);
  }
  
  // Progress indicator
  if (Math.floor(time / testInterval) % 10 === 0) {
    const progress = ((time / durationSec) * 100).toFixed(0);
    process.stdout.write(`\r   Progress: ${progress}%`);
  }
}

console.log('\n\n📊 Test Results');
console.log('===============');
console.log(`Page transitions detected: ${results.length}`);
console.log(`Pages reached: ${detectedPages.length > 0 ? Math.max(...detectedPages) : 0} / 183`);

if (results.length > 0) {
  const exact = results.filter(r => r.error === 0).length;
  const close = results.filter(r => r.error <= 2).length;
  const avgError = results.reduce((sum, r) => sum + r.error, 0) / results.length;
  const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
  
  console.log(`\nAccuracy:`);
  console.log(`  Exact matches: ${exact}/${results.length} (${(exact / results.length * 100).toFixed(1)}%)`);
  console.log(`  Within 2 pages: ${close}/${results.length} (${(close / results.length * 100).toFixed(1)}%)`);
  console.log(`  Average error: ${avgError.toFixed(1)} pages`);
  console.log(`  Average confidence: ${(avgConfidence * 100).toFixed(1)}%`);
  
  // Save detailed results
  const logPath = path.join(__dirname, 'training-data/test-results.json');
  fs.writeFileSync(logPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Saved detailed results to training-data/test-results.json`);
  
  if (exact / results.length > 0.7) {
    console.log('\n✅ System is working well!');
  } else if (close / results.length > 0.75) {
    console.log('\n⚠️ System needs tuning but shows promise');
  } else {
    console.log('\n❌ System needs significant improvement');
  }
} else {
  console.log('\n⚠️ No page transitions detected - check thresholds');
}

console.log('\n📌 Next: Run manual training session with real page turns');
