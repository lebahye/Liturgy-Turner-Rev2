#!/usr/bin/env node
/**
 * Audio Fingerprint Extraction
 * Extract Meyda features from WAV file for each liturgy page
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
const PLAN_PATH = path.join(__dirname, 'training-data/fingerprint-plan.json');
const OUTPUT_PATH = path.join(__dirname, 'training-data/fingerprints.json');

console.log('🎵 Extracting Audio Fingerprints');
console.log('=================================\n');

// Load fingerprint plan
const plan = JSON.parse(fs.readFileSync(PLAN_PATH));
console.log(`📋 Loaded plan for ${plan.pages.length} pages\n`);

// Read WAV file
console.log('📂 Reading audio file...');
const buffer = fs.readFileSync(WAV_PATH);

// Parse WAV header
function parseWavHeader(buffer) {
  const riff = buffer.toString('ascii', 0, 4);
  const wave = buffer.toString('ascii', 8, 12);
  
  if (riff !== 'RIFF' || wave !== 'WAVE') {
    throw new Error('Invalid WAV file');
  }
  
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
        bitsPerSample: buffer.readUInt16LE(offset + 22),
        byteRate: buffer.readUInt32LE(offset + 16)
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
console.log(`✅ Audio: ${audioInfo.sampleRate}Hz, ${audioInfo.channels}ch, ${audioInfo.bitsPerSample}bit`);

// Extract samples from buffer
function extractSamples(buffer, startTime, duration, sampleRate, bitsPerSample, dataOffset) {
  const bytesPerSample = bitsPerSample / 8;
  const startSample = Math.floor(startTime * sampleRate);
  const numSamples = Math.floor(duration * sampleRate);
  const startByte = dataOffset + (startSample * bytesPerSample);
  
  const samples = new Float32Array(numSamples);
  
  for (let i = 0; i < numSamples; i++) {
    const byteIndex = startByte + (i * bytesPerSample);
    if (byteIndex + bytesPerSample > buffer.length) break;
    
    // Read 16-bit PCM sample
    const sample = buffer.readInt16LE(byteIndex);
    // Normalize to -1.0 to 1.0
    samples[i] = sample / 32768.0;
  }
  
  return samples;
}

// Extract features for a segment
function extractFeatures(samples, sampleRate) {
  if (samples.length === 0) return null;
  
  const windowSize = plan.windowSize || 2048;
  const hopSize = plan.hopSize || 512;
  const numFrames = Math.floor((samples.length - windowSize) / hopSize);
  
  const features = {
    mfcc: [],
    spectralCentroid: [],
    spectralRolloff: [],
    rms: [],
    zcr: []
  };
  
  // Extract features for each frame
  for (let frame = 0; frame < Math.min(numFrames, 100); frame++) { // Limit to 100 frames per page
    const start = frame * hopSize;
    const frameData = samples.slice(start, start + windowSize);
    
    if (frameData.length < windowSize) break;
    
    try {
      const meydaFeatures = Meyda.extract([
        'mfcc',
        'spectralCentroid',
        'spectralRolloff',
        'rms',
        'zcr'
      ], frameData, {
        sampleRate,
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
      // Skip frame on error
    }
  }
  
  return features;
}

// Process each page
console.log('\n🔍 Extracting fingerprints...');
const fingerprints = [];

for (let i = 0; i < plan.pages.length; i++) { // Process all pages
  const page = plan.pages[i];
  const duration = page.endTime - page.startTime;
  
  process.stdout.write(`   Page ${page.pageNumber}... `);
  
  const samples = extractSamples(
    buffer,
    page.startTime,
    duration,
    audioInfo.sampleRate,
    audioInfo.bitsPerSample,
    dataOffset
  );
  
  const features = extractFeatures(samples, audioInfo.sampleRate);
  
  if (features && features.mfcc.length > 0) {
    // Compute average features for this page
    const avgFeatures = {
      mfcc: averageArray2D(features.mfcc),
      spectralCentroid: average(features.spectralCentroid),
      spectralRolloff: average(features.spectralRolloff),
      rms: average(features.rms),
      zcr: average(features.zcr)
    };
    
    fingerprints.push({
      pageNumber: page.pageNumber,
      startTime: page.startTime,
      endTime: page.endTime,
      features: avgFeatures,
      rawFeatureCount: features.mfcc.length,
      textSignature: page.textSignature
    });
    
    console.log(`✅ ${features.mfcc.length} frames`);
  } else {
    console.log(`❌ No features extracted`);
  }
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
    row.forEach((val, i) => {
      result[i] += val;
    });
  });
  
  return result.map(v => v / arr.length);
}

// Save fingerprints
console.log(`\n💾 Saving ${fingerprints.length} fingerprints...`);
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(fingerprints, null, 2));
console.log(`✅ Saved to training-data/fingerprints.json`);

console.log('\n📊 Fingerprint Summary');
console.log('=====================');
fingerprints.forEach(fp => {
  console.log(`Page ${fp.pageNumber}: RMS=${fp.features.rms.toFixed(3)}, Centroid=${fp.features.spectralCentroid.toFixed(1)}Hz`);
});

console.log('\n✅ Fingerprint extraction complete!');
console.log('\n📌 Next: Build live matching system');
