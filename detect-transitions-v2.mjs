#!/usr/bin/env node
/**
 * Detect speaker transitions V2 - With corrected thresholds
 * Based on actual variance distribution analysis
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Meyda = require('meyda');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 Speaker Transition Detection V2');
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
  
  // Calculate variance
  if (spectralFlux.length === 0) return 'silence';
  
  const avgRMS = rms.reduce((a, b) => a + b, 0) / rms.length;
  
  // Skip if too quiet (silence or very low volume)
  if (avgRMS < 0.002) return 'silence';
  
  const avg = spectralFlux.reduce((a, b) => a + b, 0) / spectralFlux.length;
  const variance = spectralFlux.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / spectralFlux.length;
  
  // New thresholds based on actual data
  if (variance > 5.0) return 'choir';
  if (variance > 1.5) return 'celebrant';
  return 'deacon';
}

console.log('🎤 Scanning audio every 5 seconds...\n');

const scanInterval = 5;
const windowDuration = 3;

const speakerTimeline = [];

for (let time = 0; time < durationSec; time += scanInterval) {
  const samples = extractSamples(time, windowDuration);
  const speaker = detectSpeaker(samples);
  
  speakerTimeline.push({
    time,
    speaker
  });
  
  if (Math.floor(time / scanInterval) % 20 === 0) {
    const progress = ((time / durationSec) * 100).toFixed(0);
    process.stdout.write(`\r   Progress: ${progress}%`);
  }
}

console.log('\r   Progress: 100%\n');

// Find sustained transitions (filter out rapid back-and-forth)
const sustainedTransitions = [];
let currentSpeaker = speakerTimeline[0].speaker;
let transitionStartTime = 0;

for (let i = 1; i < speakerTimeline.length; i++) {
  const curr = speakerTimeline[i];
  
  // Check if speaker has SUSTAINED for at least 3 consecutive measurements (15 seconds)
  if (curr.speaker !== currentSpeaker && curr.speaker !== 'silence') {
    let sustained = true;
    for (let j = 1; j <= 2 && (i + j) < speakerTimeline.length; j++) {
      if (speakerTimeline[i + j].speaker !== curr.speaker && speakerTimeline[i + j].speaker !== 'silence') {
        sustained = false;
        break;
      }
    }
    
    if (sustained && currentSpeaker !== 'silence') {
      sustainedTransitions.push({
        time: curr.time,
        from: currentSpeaker,
        to: curr.speaker
      });
      currentSpeaker = curr.speaker;
      transitionStartTime = curr.time;
    }
  }
}

console.log(`📊 Results:`);
console.log(`Total timeline points: ${speakerTimeline.length}`);
console.log(`Sustained transitions found: ${sustainedTransitions.length}\n`);

const choirSections = speakerTimeline.filter(s => s.speaker === 'choir').length;
const celebrantSections = speakerTimeline.filter(s => s.speaker === 'celebrant').length;
const deaconSections = speakerTimeline.filter(s => s.speaker === 'deacon').length;
const silenceSections = speakerTimeline.filter(s => s.speaker === 'silence').length;

console.log(`Speaker Distribution:`);
console.log(`  Choir: ${choirSections} sections (${(choirSections / speakerTimeline.length * 100).toFixed(1)}%)`);
console.log(`  Celebrant: ${celebrantSections} sections (${(celebrantSections / speakerTimeline.length * 100).toFixed(1)}%)`);
console.log(`  Deacon: ${deaconSections} sections (${(deaconSections / speakerTimeline.length * 100).toFixed(1)}%)`);
console.log(`  Silence: ${silenceSections} sections (${(silenceSections / speakerTimeline.length * 100).toFixed(1)}%)\n`);

console.log(`First 30 Sustained Transitions:`);
sustainedTransitions.slice(0, 30).forEach((t, i) => {
  const timeStr = `${Math.floor(t.time / 60)}:${(t.time % 60).toString().padStart(2, '0')}`;
  console.log(`  ${(i + 1).toString().padStart(2)}. ${timeStr} - ${t.from} → ${t.to}`);
});

// Save
const outputPath = path.join(__dirname, 'training-data/sustained-transitions-v2.json');
fs.writeFileSync(outputPath, JSON.stringify({
  totalDuration: durationSec,
  scanInterval,
  totalTransitions: sustainedTransitions.length,
  transitions: sustainedTransitions,
  timeline: speakerTimeline,
  thresholds: {
    choir: '>5.0',
    celebrant: '1.5-5.0',
    deacon: '<1.5',
    silence_rms: '<0.002'
  }
}, null, 2));

console.log(`\n💾 Saved to training-data/sustained-transitions-v2.json`);

console.log(`\n📌 Analysis:`);
console.log(`  Expected pages: 183`);
console.log(`  Detected sustained transitions: ${sustainedTransitions.length}`);

if (sustainedTransitions.length >= 150 && sustainedTransitions.length <= 220) {
  console.log(`  ✅ Transition count is in expected range!`);
} else if (sustainedTransitions.length < 100) {
  console.log(`  ⚠️ Fewer transitions than expected`);
} else {
  console.log(`  ⚠️ More transitions than expected`);
}

console.log(`\n💡 These sustained transitions likely mark page turns.`);
console.log(`   Next: Map them to the 183 pages in the PDF.`);
