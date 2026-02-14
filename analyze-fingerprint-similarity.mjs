#!/usr/bin/env node
/**
 * Analyze why fingerprint matching is failing
 * Compare live audio features to stored fingerprints
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Meyda = require('meyda');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 Analyzing Fingerprint Similarity Issues');
console.log('==========================================\n');

const WAV_PATH = path.join(__dirname, 'full_service.wav');
let wavFile = WAV_PATH;
if (!fs.existsSync(wavFile)) {
  wavFile = path.join(__dirname, 'agent/full_service.wav');
}

const buffer = fs.readFileSync(wavFile);
const fingerprints = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'training-data/fingerprints.json'), 'utf8')
);

console.log(`📖 Loaded ${fingerprints.length} fingerprints\n`);

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

function extractFeatures(samples) {
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
      const mf = Meyda.extract([
        'mfcc', 'spectralCentroid', 'spectralRolloff', 'rms', 'zcr'
      ], frameData, {
        sampleRate: audioInfo.sampleRate,
        bufferSize: windowSize,
        windowingFunction: 'hanning'
      });
      
      if (mf) {
        if (mf.mfcc) features.mfcc.push(mf.mfcc);
        if (mf.spectralCentroid) features.spectralCentroid.push(mf.spectralCentroid);
        if (mf.spectralRolloff) features.spectralRolloff.push(mf.spectralRolloff);
        if (mf.rms) features.rms.push(mf.rms);
        if (mf.zcr) features.zcr.push(mf.zcr);
      }
    } catch (err) {}
  }
  
  return features;
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
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Test a few known pages
const testPages = [10, 50, 100, 150];

console.log('Testing fingerprint matching on known pages:\n');

testPages.forEach(pageNum => {
  const fp = fingerprints[pageNum - 1];
  console.log(`📄 Page ${pageNum} (${Math.floor(fp.startTime / 60)}:${Math.floor(fp.startTime % 60).toString().padStart(2, '0')})`);
  
  // Extract live audio from same timestamp
  const samples = extractSamples(fp.startTime, 5); // 5 second window
  const liveFeatures = extractFeatures(samples);
  
  if (liveFeatures.mfcc.length === 0) {
    console.log('  ⚠️ No features extracted\n');
    return;
  }
  
  const liveMFCC = averageArray2D(liveFeatures.mfcc);
  const liveCentroid = average(liveFeatures.spectralCentroid);
  const liveRolloff = average(liveFeatures.spectralRolloff);
  const liveRMS = average(liveFeatures.rms);
  
  // Compare to stored fingerprint
  const mfccSim = cosineSimilarity(liveMFCC, fp.features.mfcc);
  const centroidDiff = Math.abs(liveCentroid - fp.features.spectralCentroid);
  const rolloffDiff = Math.abs(liveRolloff - fp.features.spectralRolloff);
  const rmsDiff = Math.abs(liveRMS - fp.features.rms);
  
  console.log(`  MFCC similarity: ${(mfccSim * 100).toFixed(1)}%`);
  console.log(`  Centroid diff: ${centroidDiff.toFixed(0)} Hz`);
  console.log(`  Rolloff diff: ${rolloffDiff.toFixed(0)} Hz`);
  console.log(`  RMS diff: ${rmsDiff.toFixed(4)}`);
  
  // Now compare to ALL fingerprints to see best match
  let bestMatch = { pageNumber: -1, score: 0 };
  
  fingerprints.forEach(otherFp => {
    const otherMFCCSim = cosineSimilarity(liveMFCC, otherFp.features.mfcc);
    if (otherMFCCSim > bestMatch.score) {
      bestMatch = { pageNumber: otherFp.pageNumber, score: otherMFCCSim };
    }
  });
  
  console.log(`  ✓ Self-match should be best, but best match is page ${bestMatch.pageNumber} (${(bestMatch.score * 100).toFixed(1)}%)`);
  
  if (bestMatch.pageNumber === pageNum) {
    console.log(`  ✅ CORRECT!\n`);
  } else {
    console.log(`  ❌ WRONG! Off by ${Math.abs(bestMatch.pageNumber - pageNum)} pages\n`);
  }
});

console.log('\n💡 Insights:');
console.log('If self-matching fails, the issue is likely:');
console.log('  1. Different window sizes (training vs live)');
console.log('  2. Different feature extraction parameters');
console.log('  3. Audio segments don\'t align perfectly');
console.log('  4. Need to use more features or different similarity metric');
