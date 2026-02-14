#!/usr/bin/env node
/**
 * Test Live Tracker V2 - Improved matching strategy
 * Use timestamp-based search window instead of fixed "next 3 pages"
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Meyda = require('meyda');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ImprovedLiturgyTracker {
  constructor() {
    this.fingerprints = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'training-data/fingerprints.json'), 'utf8')
    );
    this.pageTimestamps = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'training-data/page-timestamps-mapped.json'), 'utf8')
    ).pages;
    
    this.currentPage = 1;
    this.currentTime = 0;
    
    console.log(`✅ Loaded ${this.fingerprints.length} fingerprints`);
    console.log(`✅ Loaded ${this.pageTimestamps.length} page timestamps\n`);
  }
  
  processLiveAudio(audioBuffer, timestamp) {
    this.currentTime = timestamp / 1000; // Convert to seconds
    
    const features = this.extractFeatures(audioBuffer);
    
    // Find candidates based on timestamp proximity
    // Look 30 seconds before and after current time
    const timeWindow = 30;
    const candidates = this.pageTimestamps.filter(page => {
      const pageTime = page.timestamp;
      return pageTime >= (this.currentTime - timeWindow) &&
             pageTime <= (this.currentTime + timeWindow) &&
             page.pageNumber >= this.currentPage;
    });
    
    if (candidates.length === 0) return { page: this.currentPage, changed: false };
    
    // Score each candidate
    const scores = candidates.map(page => ({
      pageNumber: page.pageNumber,
      expectedTime: page.timestamp,
      timeDiff: Math.abs(page.timestamp - this.currentTime),
      score: this.matchFingerprint(features, page.pageNumber)
    }));
    
    // Boost scores for pages close in time
    scores.forEach(s => {
      const timeBoost = Math.exp(-s.timeDiff / 10); // Closer in time = higher boost
      s.combinedScore = (s.score * 0.7) + (timeBoost * 0.3);
    });
    
    scores.sort((a, b) => b.combinedScore - a.combinedScore);
    const best = scores[0];
    
    // Advance if confident
    if (best && best.combinedScore > 0.5 && best.pageNumber > this.currentPage) {
      this.currentPage = best.pageNumber;
      return {
        page: this.currentPage,
        changed: true,
        confidence: best.combinedScore,
        timeDiff: best.timeDiff
      };
    }
    
    return { page: this.currentPage, changed: false };
  }
  
  extractFeatures(audioBuffer) {
    const windowSize = 2048;
    const hopSize = 512;
    const numFrames = Math.floor((audioBuffer.length - windowSize) / hopSize);
    
    const features = {
      mfcc: [], spectralCentroid: [], spectralRolloff: [], rms: [], zcr: []
    };
    
    for (let frame = 0; frame < Math.min(numFrames, 50); frame++) {
      const start = frame * hopSize;
      const frameData = audioBuffer.slice(start, start + windowSize);
      if (frameData.length < windowSize) break;
      
      try {
        const extracted = Meyda.extract([
          'mfcc', 'spectralCentroid', 'spectralRolloff', 'rms', 'zcr'
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
        }
      } catch (err) {}
    }
    
    return {
      mfcc: this.averageArray2D(features.mfcc),
      spectralCentroid: this.average(features.spectralCentroid),
      spectralRolloff: this.average(features.spectralRolloff),
      rms: this.average(features.rms),
      zcr: this.average(features.zcr)
    };
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
console.log('🎬 Test V2 - Time-based Matching\n');

const WAV_PATH = path.join(__dirname, 'full_service.wav');
let wavFile = WAV_PATH;
if (!fs.existsSync(wavFile)) {
  wavFile = path.join(__dirname, 'agent/full_service.wav');
}

const buffer = fs.readFileSync(wavFile);
const { audioInfo, dataOffset } = parseWavHeader(buffer);

console.log(`📊 Audio: ${audioInfo.sampleRate}Hz, ${audioInfo.bitsPerSample}bit`);

const durationSec = (buffer.length - dataOffset) / (audioInfo.sampleRate * (audioInfo.bitsPerSample / 8));
console.log(`⏱️  Duration: ${Math.floor(durationSec / 60)}:${Math.floor(durationSec % 60).toString().padStart(2, '0')}\n`);

const tracker = new ImprovedLiturgyTracker();
const pageTimestamps = tracker.pageTimestamps;

const testInterval = 10; // Process every 10 seconds
const windowSize = 5; // 5-second audio windows

const results = [];
let detectedPages = [];

console.log('🔍 Processing audio...\n');

for (let time = 0; time < durationSec; time += testInterval) {
  const samples = extractSamples(buffer, dataOffset, audioInfo, time, windowSize);
  const result = tracker.processLiveAudio(samples, time * 1000);
  
  if (result.changed) {
    // Find expected page at this time
    const expectedPage = pageTimestamps.find(p => 
      p.timestamp <= time && 
      (!pageTimestamps[p.pageNumber] || pageTimestamps[p.pageNumber].timestamp > time)
    );
    const expectedPageNum = expectedPage ? expectedPage.pageNumber : 1;
    const error = Math.abs(result.page - expectedPageNum);
    
    detectedPages.push(result.page);
    results.push({
      time,
      detectedPage: result.page,
      expectedPage: expectedPageNum,
      error,
      confidence: result.confidence,
      timeDiff: result.timeDiff
    });
    
    const status = error === 0 ? '✅' : error <= 2 ? '⚠️' : '❌';
    const timeStr = `${Math.floor(time / 60)}:${(time % 60).toString().padStart(2, '0')}`;
    console.log(`${status} ${timeStr} - Page ${result.page} (expected ${expectedPageNum}, conf: ${(result.confidence * 100).toFixed(0)}%, Δt: ${result.timeDiff.toFixed(1)}s)`);
  }
  
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
  
  const logPath = path.join(__dirname, 'training-data/test-results-v2.json');
  fs.writeFileSync(logPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Saved to training-data/test-results-v2.json`);
  
  if (exact / results.length > 0.7) {
    console.log('\n✅ System working well!');
  } else if (close / results.length > 0.75) {
    console.log('\n⚠️ Needs tuning but shows promise');
  } else {
    console.log('\n❌ Needs significant improvement');
  }
}
