#!/usr/bin/env node
/**
 * Find Actual Page Boundaries in Audio
 * Detect transitions, pauses, and topic changes to locate real page turns
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

console.log('🔍 Finding Page Boundaries in Audio');
console.log('====================================\n');

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
console.log(`Audio: ${audioInfo.sampleRate}Hz, ${audioInfo.bitsPerSample}bit\n`);

// Extract energy envelope (RMS over time)
console.log('📊 Analyzing audio energy envelope...');

const windowSize = audioInfo.sampleRate * 0.5; // 500ms windows
const hopSize = audioInfo.sampleRate * 0.1; // 100ms hop
const bytesPerSample = audioInfo.bitsPerSample / 8;
const totalSamples = (buffer.length - dataOffset) / bytesPerSample;
const numWindows = Math.floor((totalSamples - windowSize) / hopSize);

const energyEnvelope = [];

for (let i = 0; i < numWindows; i++) {
  const startSample = i * hopSize;
  const startByte = dataOffset + (startSample * bytesPerSample);
  
  let sumSquares = 0;
  let count = 0;
  
  for (let j = 0; j < windowSize; j++) {
    const byteIndex = startByte + (j * bytesPerSample);
    if (byteIndex + bytesPerSample > buffer.length) break;
    
    const sample = buffer.readInt16LE(byteIndex) / 32768.0;
    sumSquares += sample * sample;
    count++;
  }
  
  const rms = count > 0 ? Math.sqrt(sumSquares / count) : 0;
  const timestamp = (startSample / audioInfo.sampleRate);
  
  energyEnvelope.push({ timestamp, rms });
  
  if (i % 1000 === 0) {
    process.stdout.write(`\r   Progress: ${((i / numWindows) * 100).toFixed(1)}%`);
  }
}

console.log(`\r   ✅ Analyzed ${energyEnvelope.length} windows\n`);

// Find transitions (drops in energy = potential page boundaries)
console.log('🎯 Detecting transitions...');

const transitions = [];
const energyThreshold = 0.001; // Minimum energy to consider "active"
const dropThreshold = 0.5; // 50% energy drop = transition

for (let i = 5; i < energyEnvelope.length - 5; i++) {
  const current = energyEnvelope[i].rms;
  const prev = energyEnvelope[i - 5].rms;
  const next = energyEnvelope[i + 5].rms;
  
  // Look for dips: energy drops then rises
  const isDip = (prev > energyThreshold) && 
                (current < prev * dropThreshold) && 
                (next > current * 1.2);
  
  // Or sustained low energy (silence)
  const avgBefore = energyEnvelope.slice(i - 5, i).reduce((sum, e) => sum + e.rms, 0) / 5;
  const isSilence = (avgBefore > energyThreshold) && (current < energyThreshold);
  
  if (isDip || isSilence) {
    const timestamp = energyEnvelope[i].timestamp;
    
    // Avoid duplicates within 3 seconds
    const lastTransition = transitions[transitions.length - 1];
    if (!lastTransition || (timestamp - lastTransition.timestamp) > 3) {
      transitions.push({
        timestamp,
        type: isDip ? 'dip' : 'silence',
        energyBefore: prev,
        energyAt: current,
        energyAfter: next
      });
    }
  }
}

console.log(`✅ Found ${transitions.length} potential transitions\n`);

// Show distribution
console.log('📈 Transition Distribution:');
const buckets = Array(10).fill(0);
transitions.forEach(t => {
  const bucket = Math.floor(t.timestamp / (5234 / 10));
  if (bucket < 10) buckets[bucket]++;
});

buckets.forEach((count, i) => {
  const startMin = Math.floor((i * 523.4) / 60);
  const bar = '█'.repeat(Math.floor(count / 3));
  console.log(`   ${startMin.toString().padStart(2)}min: ${bar} (${count})`);
});

// If we have roughly 183 transitions, those might be our pages!
console.log(`\n🎯 Expected pages: 183`);
console.log(`   Found transitions: ${transitions.length}`);
console.log(`   Match quality: ${(Math.min(transitions.length, 183) / 183 * 100).toFixed(1)}%`);

if (transitions.length >= 150 && transitions.length <= 220) {
  console.log('\n✅ Transition count looks promising!');
  console.log('   These might be actual page boundaries.\n');
  
  // Save as potential page timestamps
  const pageTimestamps = transitions.map((t, idx) => ({
    pageNumber: idx + 1,
    timestamp: t.timestamp,
    type: t.type,
    confidence: t.energyBefore > 0.005 ? 'high' : 'medium'
  }));
  
  const outputPath = path.join(__dirname, 'training-data/detected-page-timestamps.json');
  fs.writeFileSync(outputPath, JSON.stringify(pageTimestamps, null, 2));
  console.log(`💾 Saved to training-data/detected-page-timestamps.json`);
  
  console.log('\n📋 First 10 detected pages:');
  pageTimestamps.slice(0, 10).forEach(p => {
    const time = `${Math.floor(p.timestamp / 60)}:${Math.floor(p.timestamp % 60).toString().padStart(2, '0')}`;
    console.log(`   Page ${p.pageNumber}: ${time} (${p.type}, ${p.confidence})`);
  });
  
} else {
  console.log(`\n⚠️ Found ${transitions.length} transitions, but expected ~183 pages.`);
  console.log('   Transition detection needs tuning.');
  
  // Still save for manual review
  const outputPath = path.join(__dirname, 'training-data/detected-transitions.json');
  fs.writeFileSync(outputPath, JSON.stringify(transitions.slice(0, 200), null, 2));
  console.log(`\n💾 Saved first 200 transitions for review`);
}

console.log('\n📌 Next: Use actual timestamps to rebuild fingerprints');
