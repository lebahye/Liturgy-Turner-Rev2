#!/usr/bin/env node
/**
 * Smart Page Tracker with Sequential Intelligence
 * Uses temporal sequencing + feature matching for accurate live tracking
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
const FP_PATH = path.join(__dirname, 'training-data/fingerprints.json');
const SIG_PATH = path.join(__dirname, 'training-data/page-signatures.json');

console.log('🧠 Smart Page Tracker with Sequential Intelligence');
console.log('==================================================\n');

const fingerprints = JSON.parse(fs.readFileSync(FP_PATH));
const signatures = JSON.parse(fs.readFileSync(SIG_PATH));

console.log(`📚 Loaded ${fingerprints.length} fingerprints\n`);

// Load audio
const buffer = fs.readFileSync(WAV_PATH);

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

const { audioInfo, dataOffset } = parseWavHeader(buffer);

function extractSamples(startTime, duration) {
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

function extractLiveFeatures(samples) {
  const windowSize = 2048;
  const hopSize = 512;
  const numFrames = Math.floor((samples.length - windowSize) / hopSize);
  
  const features = {
    mfcc: [], spectralCentroid: [], spectralRolloff: [], rms: [], zcr: []
  };
  
  for (let frame = 0; frame < Math.min(numFrames, 100); frame++) {
    const start = frame * hopSize;
    const frameData = samples.slice(start, start + windowSize);
    if (frameData.length < windowSize) break;
    
    try {
      const mf = Meyda.extract(
        ['mfcc', 'spectralCentroid', 'spectralRolloff', 'rms', 'zcr'],
        frameData,
        { sampleRate: audioInfo.sampleRate, bufferSize: windowSize, windowingFunction: 'hanning' }
      );
      
      if (mf) {
        features.mfcc.push(mf.mfcc);
        features.spectralCentroid.push(mf.spectralCentroid);
        features.spectralRolloff.push(mf.spectralRolloff);
        features.rms.push(mf.rms);
        features.zcr.push(mf.zcr);
      }
    } catch (err) {}
  }
  
  return {
    mfcc: averageArray2D(features.mfcc),
    spectralCentroid: average(features.spectralCentroid),
    spectralRolloff: average(features.spectralRolloff),
    rms: average(features.rms),
    zcr: average(features.zcr)
  };
}

function average(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function averageArray2D(arr) {
  if (!arr || arr.length === 0) return [];
  const len = arr[0].length;
  const result = new Array(len).fill(0);
  arr.forEach(row => row.forEach((val, i) => result[i] += val));
  return result.map(v => v / arr.length);
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dotProduct = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);
  return (magA === 0 || magB === 0) ? 0 : dotProduct / (magA * magB);
}

// Smart sequential tracker
class PageTracker {
  constructor() {
    this.currentPage = 1;
    this.currentTimestamp = 0;
    this.confidence = 0;
    this.history = [];
  }
  
  // Track current position
  update(timestamp, liveFeatures) {
    const elapsedSinceLastUpdate = timestamp - this.currentTimestamp;
    
    // Narrow search window based on current page
    // Only check pages within +/- 5 of current, or if we might have jumped ahead
    const windowSize = 5;
    const minPage = Math.max(1, this.currentPage - 2);
    const maxPage = Math.min(fingerprints.length, this.currentPage + windowSize + Math.floor(elapsedSinceLastUpdate / 20));
    
    const candidates = fingerprints.filter(fp => 
      fp.pageNumber >= minPage && fp.pageNumber <= maxPage
    );
    
    const scores = candidates.map(page => {
      const fp = page.features;
      const mfccSim = cosineSimilarity(liveFeatures.mfcc, fp.mfcc);
      const rmsDiff = Math.abs(liveFeatures.rms - fp.rms);
      const rmsScore = Math.exp(-rmsDiff * 100);
      const centroidDiff = Math.abs(liveFeatures.spectralCentroid - fp.spectralCentroid);
      const centroidScore = Math.exp(-centroidDiff / 50);
      
      // Sequential bonus: prefer pages close to current
      const distance = Math.abs(page.pageNumber - this.currentPage);
      const sequentialBonus = Math.exp(-distance / 3) * 0.3;
      
      const totalScore = (mfccSim * 0.5) + (rmsScore * 0.15) + (centroidScore * 0.15) + sequentialBonus;
      
      return { pageNumber: page.pageNumber, score: totalScore, mfccSim };
    });
    
    scores.sort((a, b) => b.score - a.score);
    const topMatch = scores[0];
    
    // Only advance if confidence is high enough
    if (topMatch.score > 0.7 && topMatch.pageNumber > this.currentPage) {
      this.currentPage = topMatch.pageNumber;
      this.confidence = topMatch.score;
      this.currentTimestamp = timestamp;
      return { changed: true, page: this.currentPage, confidence: this.confidence };
    } else if (topMatch.score > 0.8) {
      // High confidence, update even if same page
      this.confidence = topMatch.score;
      return { changed: false, page: this.currentPage, confidence: this.confidence };
    }
    
    return { changed: false, page: this.currentPage, confidence: this.confidence };
  }
}

// Test with sequential tracking
console.log('🎬 Running sequential tracking test...\n');

const tracker = new PageTracker();
const testInterval = 30; // Check every 30 seconds
const totalDuration = 5234; // 87 minutes
const results = [];

for (let time = 0; time < totalDuration; time += testInterval) {
  const samples = extractSamples(time, 10);
  const liveFeatures = extractLiveFeatures(samples);
  const result = tracker.update(time, liveFeatures);
  
  const expectedPage = Math.min(183, Math.floor(time / 28.6) + 1);
  const error = Math.abs(result.page - expectedPage);
  
  if (result.changed) {
    results.push({
      time,
      actualPage: result.page,
      expectedPage,
      error,
      confidence: result.confidence
    });
    
    const status = error === 0 ? '✅' : error <= 2 ? '⚠️' : '❌';
    console.log(`${status} ${Math.floor(time / 60)}:${(time % 60).toString().padStart(2, '0')} - Page ${result.page} (expected ${expectedPage}, conf: ${result.confidence.toFixed(2)})`);
  }
}

// Calculate accuracy
const exact = results.filter(r => r.error === 0).length;
const close = results.filter(r => r.error <= 2).length;

console.log('\n📊 Sequential Tracking Results');
console.log('==============================');
console.log(`Page turns detected: ${results.length}`);
console.log(`Exact matches: ${exact}/${results.length} (${(exact / results.length * 100).toFixed(1)}%)`);
console.log(`Within 2 pages: ${close}/${results.length} (${(close / results.length * 100).toFixed(1)}%)`);
console.log(`Average error: ${(results.reduce((sum, r) => sum + r.error, 0) / results.length).toFixed(1)} pages`);

if (exact / results.length > 0.6) {
  console.log('\n✅ Sequential tracking works well!');
} else if (close / results.length > 0.75) {
  console.log('\n⚠️ Decent tracking, needs fine-tuning');
} else {
  console.log('\n❌ Needs more work');
}

// Save tracking log
const logPath = path.join(__dirname, 'training-data/tracking-test-log.json');
fs.writeFileSync(logPath, JSON.stringify(results, null, 2));
console.log(`\n💾 Saved tracking log to training-data/tracking-test-log.json`);
