#!/usr/bin/env node
/**
 * Extract Speaker-Specific Audio Features
 * Distinguish between choir (multiple voices) and solo (priest/deacon)
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
const SPEAKER_SIG_PATH = path.join(__dirname, 'training-data/speaker-signatures.json');
const FP_PATH = path.join(__dirname, 'training-data/fingerprints.json');

console.log('🎤 Extracting Speaker Features');
console.log('================================\n');

const speakerSigs = JSON.parse(fs.readFileSync(SPEAKER_SIG_PATH));
const fingerprints = JSON.parse(fs.readFileSync(FP_PATH));

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

// Extract speaker-distinguishing features
function extractSpeakerFeatures(samples) {
  const windowSize = 2048;
  const hopSize = 512;
  const numFrames = Math.floor((samples.length - windowSize) / hopSize);
  
  const features = {
    spectralFlux: [],
    spectralCentroid: [],
    spectralSpread: [],
    rms: []
  };
  
  let lastSpectrum = null;
  
  for (let frame = 0; frame < Math.min(numFrames, 50); frame++) {
    const start = frame * hopSize;
    const frameData = samples.slice(start, start + windowSize);
    if (frameData.length < windowSize) break;
    
    try {
      const mf = Meyda.extract(
        ['powerSpectrum', 'spectralCentroid', 'spectralSpread', 'rms'],
        frameData,
        { 
          sampleRate: audioInfo.sampleRate, 
          bufferSize: windowSize, 
          windowingFunction: 'hanning' 
        }
      );
      
      if (mf && mf.powerSpectrum) {
        features.spectralCentroid.push(mf.spectralCentroid);
        features.spectralSpread.push(mf.spectralSpread);
        features.rms.push(mf.rms);
        
        // Spectral flux (change in spectrum over time)
        if (lastSpectrum) {
          let flux = 0;
          for (let i = 0; i < Math.min(lastSpectrum.length, mf.powerSpectrum.length); i++) {
            const diff = mf.powerSpectrum[i] - lastSpectrum[i];
            flux += diff * diff;
          }
          features.spectralFlux.push(Math.sqrt(flux));
        }
        
        lastSpectrum = mf.powerSpectrum;
      }
    } catch (err) {}
  }
  
  // Average and variance
  return {
    spectralFlux: {
      mean: average(features.spectralFlux),
      variance: variance(features.spectralFlux)
    },
    spectralCentroid: {
      mean: average(features.spectralCentroid),
      variance: variance(features.spectralCentroid)
    },
    spectralSpread: {
      mean: average(features.spectralSpread),
      variance: variance(features.spectralSpread)
    },
    rms: {
      mean: average(features.rms),
      variance: variance(features.rms)
    }
  };
}

function average(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function variance(arr) {
  if (!arr || arr.length === 0) return 0;
  const avg = average(arr);
  const squaredDiffs = arr.map(v => (v - avg) * (v - avg));
  return average(squaredDiffs);
}

// Process first 30 pages to learn speaker characteristics
console.log('🔍 Analyzing speaker audio...\n');

const speakerProfiles = {
  choir: [],
  celebrant: [],
  deacon: []
};

for (let i = 0; i < Math.min(30, fingerprints.length); i++) {
  const fp = fingerprints[i];
  const speakerSig = speakerSigs.find(s => s.pageNumber === fp.pageNumber);
  
  if (!speakerSig || speakerSig.speaker === 'unknown') continue;
  
  process.stdout.write(`   Page ${fp.pageNumber} (${speakerSig.speaker})... `);
  
  const duration = fp.endTime - fp.startTime;
  const samples = extractSamples(fp.startTime, Math.min(duration, 15)); // Max 15 seconds
  const features = extractSpeakerFeatures(samples);
  
  speakerProfiles[speakerSig.speaker].push({
    pageNumber: fp.pageNumber,
    features
  });
  
  console.log('✅');
}

console.log('\n📊 Speaker Profiles:\n');

['choir', 'celebrant', 'deacon'].forEach(speaker => {
  const profiles = speakerProfiles[speaker];
  if (profiles.length === 0) {
    console.log(`${speaker.toUpperCase()}: No samples yet\n`);
    return;
  }
  
  // Average features across all samples
  const avgFluxMean = average(profiles.map(p => p.features.spectralFlux.mean));
  const avgFluxVar = average(profiles.map(p => p.features.spectralFlux.variance));
  const avgCentroid = average(profiles.map(p => p.features.spectralCentroid.mean));
  const avgSpread = average(profiles.map(p => p.features.spectralSpread.mean));
  
  console.log(`${speaker.toUpperCase()} (${profiles.length} samples):`);
  console.log(`   Spectral Flux: ${avgFluxMean.toFixed(6)} (variance: ${avgFluxVar.toFixed(6)})`);
  console.log(`   Spectral Centroid: ${avgCentroid.toFixed(1)} Hz`);
  console.log(`   Spectral Spread: ${avgSpread.toFixed(1)}\n`);
});

// Save speaker models
const modelsPath = path.join(__dirname, 'training-data/speaker-models.json');
fs.writeFileSync(modelsPath, JSON.stringify(speakerProfiles, null, 2));
console.log(`💾 Saved speaker models to training-data/speaker-models.json`);

console.log('\n✅ Speaker feature extraction complete!');
console.log('\n📌 Key Insight:');
console.log('   CHOIR should have higher spectral flux (more voices = more variation)');
console.log('   SOLO voices should have lower flux (single fundamental frequency)');
console.log('   Use spectral flux variance to detect choir vs. solo in real-time!');
