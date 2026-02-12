#!/usr/bin/env node
/**
 * Page Matching Test System
 * Simulates live playback and tests auto-page-turning accuracy
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

console.log('🧪 Testing Page Matching System');
console.log('================================\n');

// Load fingerprints
const fingerprints = JSON.parse(fs.readFileSync(FP_PATH));
console.log(`📚 Loaded ${fingerprints.length} page fingerprints\n`);

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
        channels: buffer.readUInt16LE(offset + 10),
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
    
    const sample = buffer.readInt16LE(byteIndex);
    samples[i] = sample / 32768.0;
  }
  
  return samples;
}

function extractLiveFeatures(samples) {
  const windowSize = 2048;
  const hopSize = 512;
  const numFrames = Math.floor((samples.length - windowSize) / hopSize);
  
  const features = {
    mfcc: [],
    spectralCentroid: [],
    spectralRolloff: [],
    rms: [],
    zcr: []
  };
  
  for (let frame = 0; frame < Math.min(numFrames, 100); frame++) {
    const start = frame * hopSize;
    const frameData = samples.slice(start, start + windowSize);
    
    if (frameData.length < windowSize) break;
    
    try {
      const meydaFeatures = Meyda.extract([
        'mfcc', 'spectralCentroid', 'spectralRolloff', 'rms', 'zcr'
      ], frameData, {
        sampleRate: audioInfo.sampleRate,
        bufferSize: windowSize,
        windowingFunction: 'hanning'
      });
      
      if (meydaFeatures) {
        features.mfcc.push(meydaFeatures.mfcc);
        features.spectralCentroid.push(meydaFeatures.spectralCentroid);
        features.spectralRolloff.push(meydaFeatures.spectralRolloff);
        features.rms.push(meydaFeatures.rms);
        features.zcr.push(meydaFeatures.zcr);
      }
    } catch (err) {
      // Skip
    }
  }
  
  // Average
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
  
  arr.forEach(row => {
    row.forEach((val, i) => result[i] += val);
  });
  
  return result.map(v => v / arr.length);
}

// Cosine similarity for MFCC vectors
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;
  
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

// Match live audio to a page
function matchPage(liveFeatures, candidatePages) {
  const scores = candidatePages.map(page => {
    const fp = page.features;
    
    // MFCC similarity (main voice characteristic)
    const mfccSim = cosineSimilarity(liveFeatures.mfcc, fp.mfcc);
    
    // RMS similarity (volume)
    const rmsDiff = Math.abs(liveFeatures.rms - fp.rms);
    const rmsScore = Math.exp(-rmsDiff * 100); // Exponential decay
    
    // Spectral centroid similarity (brightness)
    const centroidDiff = Math.abs(liveFeatures.spectralCentroid - fp.spectralCentroid);
    const centroidScore = Math.exp(-centroidDiff / 50);
    
    // Combined score (weighted)
    const totalScore = (mfccSim * 0.6) + (rmsScore * 0.2) + (centroidScore * 0.2);
    
    return {
      pageNumber: page.pageNumber,
      score: totalScore,
      mfccSim,
      rmsScore,
      centroidScore
    };
  });
  
  // Sort by score
  scores.sort((a, b) => b.score - a.score);
  
  return scores;
}

// Test simulation
console.log('🎬 Running simulation test...\n');

const testPoints = [
  { time: 10, expectedPage: 1 },
  { time: 60, expectedPage: 3 },
  { time: 150, expectedPage: 6 },
  { time: 300, expectedPage: 11 },
  { time: 600, expectedPage: 21 },
  { time: 1200, expectedPage: 42 },
  { time: 2400, expectedPage: 84 },
  { time: 3600, expectedPage: 126 },
  { time: 4800, expectedPage: 168 }
];

let correct = 0;
let closeEnough = 0; // Within 2 pages

testPoints.forEach(test => {
  const samples = extractSamples(test.time, 15); // 15 second window
  const liveFeatures = extractLiveFeatures(samples);
  
  // Match against all fingerprints
  const matches = matchPage(liveFeatures, fingerprints);
  const topMatch = matches[0];
  
  const error = Math.abs(topMatch.pageNumber - test.expectedPage);
  const isCorrect = error === 0;
  const isClose = error <= 2;
  
  if (isCorrect) correct++;
  if (isClose) closeEnough++;
  
  console.log(`Time ${test.time}s (expected page ${test.expectedPage}):`);
  console.log(`   🎯 Best match: Page ${topMatch.pageNumber} (score: ${topMatch.score.toFixed(3)})`);
  console.log(`   Top 3: ${matches.slice(0, 3).map(m => `#${m.pageNumber}(${m.score.toFixed(2)})`).join(' ')}`);
  console.log(`   ${isCorrect ? '✅ CORRECT' : isClose ? '⚠️ CLOSE' : '❌ WRONG'} (error: ${error} pages)\n`);
});

console.log('📊 Test Results');
console.log('===============');
console.log(`Exact matches: ${correct}/${testPoints.length} (${(correct / testPoints.length * 100).toFixed(1)}%)`);
console.log(`Within 2 pages: ${closeEnough}/${testPoints.length} (${(closeEnough / testPoints.length * 100).toFixed(1)}%)`);

if (correct >= testPoints.length * 0.7) {
  console.log('\n✅ System is working well! Ready for live use.');
} else if (closeEnough >= testPoints.length * 0.8) {
  console.log('\n⚠️ System needs tuning but shows promise.');
} else {
  console.log('\n❌ System needs more training or different approach.');
}

console.log('\n📌 Next: Integrate with the live app');
