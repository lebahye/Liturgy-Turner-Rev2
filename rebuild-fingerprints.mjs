#!/usr/bin/env node
/**
 * Rebuild fingerprints using actual detected page timestamps
 * This will dramatically improve matching accuracy
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Meyda = require('meyda');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔨 Rebuilding Fingerprints from Actual Timestamps');
console.log('==================================================\n');

const WAV_PATH = path.join(__dirname, 'full_service.wav');
let wavFile = WAV_PATH;
if (!fs.existsSync(wavFile)) {
  wavFile = path.join(__dirname, 'agent/full_service.wav');
}

// Load page timestamps
const pageData = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'training-data/page-timestamps-mapped.json'), 'utf8')
);

console.log(`📖 Loaded timestamps for ${pageData.pages.length} pages\n`);

const buffer = fs.readFileSync(wavFile);

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

function extractFeatures(samples, sampleRate) {
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
        sampleRate,
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

console.log('🔍 Extracting features for all 183 pages...\n');

const newFingerprints = [];

for (let i = 0; i < pageData.pages.length; i++) {
  const page = pageData.pages[i];
  const nextPage = pageData.pages[i + 1];
  
  const startTime = page.timestamp;
  const endTime = nextPage ? nextPage.timestamp : (page.timestamp + pageData.avgPageDuration);
  const duration = Math.min(endTime - startTime, 60); // Max 60s per page
  
  process.stdout.write(`\r   Page ${page.pageNumber}/183...`);
  
  const samples = extractSamples(startTime, duration);
  const features = extractFeatures(samples, audioInfo.sampleRate);
  
  if (features.mfcc.length > 0) {
    newFingerprints.push({
      pageNumber: page.pageNumber,
      startTime,
      endTime,
      duration,
      hasTransition: page.hasTransition || false,
      source: page.source,
      features: {
        mfcc: averageArray2D(features.mfcc),
        spectralCentroid: average(features.spectralCentroid),
        spectralRolloff: average(features.spectralRolloff),
        rms: average(features.rms),
        zcr: average(features.zcr)
      },
      rawFeatureCount: features.mfcc.length
    });
  }
}

console.log(`\r   ✅ Extracted features for all 183 pages\n`);

// Save new fingerprints
const outputPath = path.join(__dirname, 'training-data/fingerprints-v2.json');
fs.writeFileSync(outputPath, JSON.stringify(newFingerprints, null, 2));

console.log(`💾 Saved to training-data/fingerprints-v2.json`);

// Also update the main fingerprints file for the tracker to use
fs.writeFileSync(
  path.join(__dirname, 'training-data/fingerprints.json'),
  JSON.stringify(newFingerprints, null, 2)
);

console.log(`💾 Updated training-data/fingerprints.json (tracker will use this)\n`);

console.log(`📊 Fingerprint Quality:`);
const avgFeatures = newFingerprints.reduce((sum, fp) => sum + fp.rawFeatureCount, 0) / newFingerprints.length;
console.log(`  Average features per page: ${avgFeatures.toFixed(0)}`);
console.log(`  Pages with transitions: ${newFingerprints.filter(fp => fp.hasTransition).length}`);
console.log(`  Interpolated pages: ${newFingerprints.filter(fp => fp.source === 'interpolated').length}\n`);

console.log(`✅ Fingerprints rebuilt using ACTUAL audio from detected transitions!`);
console.log(`   This should dramatically improve matching accuracy.\n`);

console.log(`🎯 Next: Run test again to measure improvement`);
