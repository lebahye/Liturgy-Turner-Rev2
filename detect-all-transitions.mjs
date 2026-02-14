#!/usr/bin/env node
/**
 * Detect ALL speaker transitions in the full audio
 * Find every choir→solo and solo→choir change
 * This gives us the real page structure
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Meyda = require('meyda');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 Detecting All Speaker Transitions');
console.log('=====================================\n');

const WAV_PATH = path.join(__dirname, 'full_service.wav');
let wavFile = WAV_PATH;
if (!fs.existsSync(wavFile)) {
  wavFile = path.join(__dirname, 'agent/full_service.wav');
}

const buffer = fs.readFileSync(wavFile);

// Parse WAV
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
const durationSec = (buffer.length - dataOffset) / (audioInfo.sampleRate * (audioInfo.bitsPerSample / 8));

console.log(`📊 Audio: ${audioInfo.sampleRate}Hz, ${audioInfo.bitsPerSample}bit`);
console.log(`⏱️  Duration: ${Math.floor(durationSec / 60)}:${Math.floor(durationSec % 60).toString().padStart(2, '0')}\n`);

// Extract samples
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

// Detect speaker from audio chunk
function detectSpeaker(samples) {
  const windowSize = 2048;
  const hopSize = 512;
  const numFrames = Math.floor((samples.length - windowSize) / hopSize);
  
  const spectralFlux = [];
  let lastSpectrum = null;
  
  for (let frame = 0; frame < Math.min(numFrames, 30); frame++) {
    const start = frame * hopSize;
    const frameData = samples.slice(start, start + windowSize);
    if (frameData.length < windowSize) break;
    
    try {
      const extracted = Meyda.extract(['powerSpectrum'], frameData, {
        sampleRate: audioInfo.sampleRate,
        bufferSize: windowSize,
        windowingFunction: 'hanning'
      });
      
      if (extracted && extracted.powerSpectrum && lastSpectrum) {
        let flux = 0;
        for (let i = 0; i < Math.min(lastSpectrum.length, extracted.powerSpectrum.length); i++) {
          const diff = extracted.powerSpectrum[i] - lastSpectrum[i];
          flux += diff * diff;
        }
        spectralFlux.push(Math.sqrt(flux));
      }
      
      if (extracted && extracted.powerSpectrum) lastSpectrum = extracted.powerSpectrum;
    } catch (err) {}
  }
  
  // Calculate variance
  if (spectralFlux.length === 0) return 'unknown';
  
  const avg = spectralFlux.reduce((a, b) => a + b, 0) / spectralFlux.length;
  const variance = spectralFlux.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / spectralFlux.length;
  
  if (variance > 10) return 'choir';
  if (variance > 2) return 'celebrant';
  return 'deacon';
}

console.log('🎤 Scanning audio every 5 seconds...\n');

const scanInterval = 5; // Check every 5 seconds
const windowDuration = 3; // Analyze 3-second windows

const speakerTimeline = [];
let lastSpeaker = null;

for (let time = 0; time < durationSec; time += scanInterval) {
  const samples = extractSamples(time, windowDuration);
  const speaker = detectSpeaker(samples);
  
  speakerTimeline.push({
    time,
    speaker
  });
  
  // Progress
  if (Math.floor(time / scanInterval) % 20 === 0) {
    const progress = ((time / durationSec) * 100).toFixed(0);
    process.stdout.write(`\r   Progress: ${progress}%`);
  }
}

console.log('\r   Progress: 100%\n');

// Find transitions
const transitions = [];

for (let i = 1; i < speakerTimeline.length; i++) {
  const prev = speakerTimeline[i - 1];
  const curr = speakerTimeline[i];
  
  if (prev.speaker !== curr.speaker && curr.speaker !== 'unknown' && prev.speaker !== 'unknown') {
    transitions.push({
      time: curr.time,
      from: prev.speaker,
      to: curr.speaker
    });
  }
}

console.log(`\n📊 Results:`);
console.log(`Total timeline points: ${speakerTimeline.length}`);
console.log(`Speaker transitions found: ${transitions.length}\n`);

// Group by speaker type
const choirSections = speakerTimeline.filter(s => s.speaker === 'choir').length;
const celebrantSections = speakerTimeline.filter(s => s.speaker === 'celebrant').length;
const deaconSections = speakerTimeline.filter(s => s.speaker === 'deacon').length;

console.log(`Speaker Distribution:`);
console.log(`  Choir: ${choirSections} sections`);
console.log(`  Celebrant: ${celebrantSections} sections`);
console.log(`  Deacon: ${deaconSections} sections\n`);

// Show first 20 transitions
console.log(`First 20 Transitions:`);
transitions.slice(0, 20).forEach((t, i) => {
  const timeStr = `${Math.floor(t.time / 60)}:${(t.time % 60).toString().padStart(2, '0')}`;
  console.log(`  ${i + 1}. ${timeStr} - ${t.from} → ${t.to}`);
});

// Save all transitions
const outputPath = path.join(__dirname, 'training-data/detected-speaker-transitions.json');
fs.writeFileSync(outputPath, JSON.stringify({
  totalDuration: durationSec,
  scanInterval,
  totalTransitions: transitions.length,
  transitions,
  timeline: speakerTimeline
}, null, 2));

console.log(`\n💾 Saved to training-data/detected-speaker-transitions.json`);

console.log(`\n📌 Analysis:`);
console.log(`  Expected pages: 183`);
console.log(`  Detected transitions: ${transitions.length}`);

if (transitions.length >= 150 && transitions.length <= 220) {
  console.log(`  ✅ Transition count is in expected range!`);
  console.log(`  These transitions likely correspond to page turns.`);
} else if (transitions.length < 100) {
  console.log(`  ⚠️ Fewer transitions than expected - may need to lower sensitivity`);
} else {
  console.log(`  ⚠️ More transitions than expected - may need to filter noise`);
}
