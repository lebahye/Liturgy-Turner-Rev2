#!/usr/bin/env node
/**
 * Speaker Transition Detection V3
 * - Lower silence threshold
 * - Shorter sustained transition requirement
 * - Better filtering
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Meyda = require('meyda');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 Speaker Transition Detection V3');
console.log('===================================\n');

const WAV_PATH = path.join(__dirname, 'full_service.wav');
let wavFile = WAV_PATH;
if (!fs.existsSync(wavFile)) {
  wavFile = path.join(__dirname, 'agent/full_service.wav');
}

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
const durationSec = (buffer.length - dataOffset) / (audioInfo.sampleRate * (audioInfo.bitsPerSample / 8));

console.log(`📊 Audio: ${audioInfo.sampleRate}Hz, ${audioInfo.bitsPerSample}bit`);
console.log(`⏱️  Duration: ${Math.floor(durationSec / 60)}:${Math.floor(durationSec % 60).toString().padStart(2, '0')}\n`);

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

function detectSpeaker(samples) {
  const windowSize = 2048;
  const hopSize = 512;
  const numFrames = Math.floor((samples.length - windowSize) / hopSize);
  
  const spectralFlux = [];
  const rms = [];
  let lastSpectrum = null;
  
  for (let frame = 0; frame < Math.min(numFrames, 50); frame++) {
    const start = frame * hopSize;
    const frameData = samples.slice(start, start + windowSize);
    if (frameData.length < windowSize) break;
    
    try {
      const extracted = Meyda.extract(['powerSpectrum', 'rms'], frameData, {
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
      
      if (extracted && extracted.rms) rms.push(extracted.rms);
      if (extracted && extracted.powerSpectrum) lastSpectrum = extracted.powerSpectrum;
    } catch (err) {}
  }
  
  if (spectralFlux.length === 0) return { speaker: 'silence', variance: 0, rms: 0 };
  
  const avgRMS = rms.reduce((a, b) => a + b, 0) / rms.length;
  
  // Much lower silence threshold - only truly silent moments
  if (avgRMS < 0.0005) return { speaker: 'silence', variance: 0, rms: avgRMS };
  
  const avg = spectralFlux.reduce((a, b) => a + b, 0) / spectralFlux.length;
  const variance = spectralFlux.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / spectralFlux.length;
  
  // Classify based on variance
  let speaker;
  if (variance > 5.0) speaker = 'choir';
  else if (variance > 1.5) speaker = 'celebrant';
  else speaker = 'deacon';
  
  return { speaker, variance, rms: avgRMS };
}

console.log('🎤 Scanning audio every 10 seconds (faster scan)...\n');

const scanInterval = 10; // 10 second intervals
const windowDuration = 5; // 5 second windows

const speakerTimeline = [];

for (let time = 0; time < durationSec; time += scanInterval) {
  const samples = extractSamples(time, windowDuration);
  const result = detectSpeaker(samples);
  
  speakerTimeline.push({
    time,
    speaker: result.speaker,
    variance: result.variance,
    rms: result.rms
  });
  
  if (Math.floor(time / scanInterval) % 10 === 0) {
    const progress = ((time / durationSec) * 100).toFixed(0);
    process.stdout.write(`\r   Progress: ${progress}%`);
  }
}

console.log('\r   Progress: 100%\n');

// Find transitions (just when speaker changes, ignoring silence)
const transitions = [];
let lastNonSilenceSpeaker = null;

for (let i = 0; i < speakerTimeline.length; i++) {
  const curr = speakerTimeline[i];
  
  if (curr.speaker !== 'silence') {
    if (lastNonSilenceSpeaker && curr.speaker !== lastNonSilenceSpeaker) {
      transitions.push({
        time: curr.time,
        from: lastNonSilenceSpeaker,
        to: curr.speaker,
        variance: curr.variance,
        rms: curr.rms
      });
    }
    lastNonSilenceSpeaker = curr.speaker;
  }
}

console.log(`📊 Results:`);
console.log(`Total timeline points: ${speakerTimeline.length}`);
console.log(`Transitions found: ${transitions.length}\n`);

const choirSections = speakerTimeline.filter(s => s.speaker === 'choir').length;
const celebrantSections = speakerTimeline.filter(s => s.speaker === 'celebrant').length;
const deaconSections = speakerTimeline.filter(s => s.speaker === 'deacon').length;
const silenceSections = speakerTimeline.filter(s => s.speaker === 'silence').length;

console.log(`Speaker Distribution:`);
console.log(`  Choir: ${choirSections} sections (${(choirSections / speakerTimeline.length * 100).toFixed(1)}%)`);
console.log(`  Celebrant: ${celebrantSections} sections (${(celebrantSections / speakerTimeline.length * 100).toFixed(1)}%)`);
console.log(`  Deacon: ${deaconSections} sections (${(deaconSections / speakerTimeline.length * 100).toFixed(1)}%)`);
console.log(`  Silence: ${silenceSections} sections (${(silenceSections / speakerTimeline.length * 100).toFixed(1)}%)\n`);

console.log(`All ${transitions.length} Transitions:`);
transitions.forEach((t, i) => {
  const timeStr = `${Math.floor(t.time / 60)}:${(t.time % 60).toString().padStart(2, '0')}`;
  console.log(`  ${(i + 1).toString().padStart(3)}. ${timeStr.padStart(6)} - ${t.from.padEnd(10)} → ${t.to.padEnd(10)} (var: ${t.variance.toFixed(2)}, rms: ${t.rms.toFixed(4)})`);
});

// Save
const outputPath = path.join(__dirname, 'training-data/transitions-v3.json');
fs.writeFileSync(outputPath, JSON.stringify({
  totalDuration: durationSec,
  scanInterval,
  totalTransitions: transitions.length,
  transitions,
  timeline: speakerTimeline,
  thresholds: {
    choir: '>5.0',
    celebrant: '1.5-5.0',
    deacon: '<1.5',
    silence_rms: '<0.0005'
  }
}, null, 2));

console.log(`\n💾 Saved to training-data/transitions-v3.json`);

console.log(`\n📌 Analysis:`);
console.log(`  Expected pages: 183`);
console.log(`  Detected transitions: ${transitions.length}`);

if (transitions.length >= 150 && transitions.length <= 220) {
  console.log(`  ✅ In expected range! These likely mark page turns.`);
} else if (transitions.length < 100) {
  console.log(`  ⚠️ Fewer than expected - may miss some pages`);
} else {
  console.log(`  ⚠️ More than expected - may have extra transitions`);
}

console.log(`\n🎯 Next: Use these ${transitions.length} transitions as page turn moments.`);
