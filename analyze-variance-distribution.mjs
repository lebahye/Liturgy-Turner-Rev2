#!/usr/bin/env node
/**
 * Analyze spectral flux variance distribution across the audio
 * Find the actual threshold values for choir/celebrant/deacon
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Meyda = require('meyda');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('📊 Analyzing Variance Distribution');
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

function calculateVariance(samples) {
  const windowSize = 2048;
  const hopSize = 512;
  const numFrames = Math.floor((samples.length - windowSize) / hopSize);
  
  const spectralFlux = [];
  let lastSpectrum = null;
  
  for (let frame = 0; frame < Math.min(numFrames, 50); frame++) {
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
  
  if (spectralFlux.length === 0) return 0;
  
  const avg = spectralFlux.reduce((a, b) => a + b, 0) / spectralFlux.length;
  const variance = spectralFlux.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / spectralFlux.length;
  
  return variance;
}

console.log('Sampling audio at 100 points...\n');

const variances = [];
const sampleCount = 100;

for (let i = 0; i < sampleCount; i++) {
  const time = (durationSec / sampleCount) * i;
  const samples = extractSamples(time, 3);
  const variance = calculateVariance(samples);
  
  variances.push({
    time,
    variance
  });
  
  if (i % 10 === 0) {
    process.stdout.write(`\r   Progress: ${i}/${sampleCount}`);
  }
}

console.log(`\r   Progress: ${sampleCount}/${sampleCount}\n`);

// Sort variances
const sortedVariances = [...variances].sort((a, b) => a.variance - b.variance);

// Statistics
const min = sortedVariances[0].variance;
const max = sortedVariances[sortedVariances.length - 1].variance;
const median = sortedVariances[Math.floor(sortedVariances.length / 2)].variance;
const avg = variances.reduce((sum, v) => sum + v.variance, 0) / variances.length;

console.log('📊 Variance Statistics:');
console.log(`  Minimum: ${min.toFixed(4)}`);
console.log(`  Maximum: ${max.toFixed(4)}`);
console.log(`  Median: ${median.toFixed(4)}`);
console.log(`  Average: ${avg.toFixed(4)}\n`);

// Percentiles
const p10 = sortedVariances[Math.floor(sortedVariances.length * 0.1)].variance;
const p25 = sortedVariances[Math.floor(sortedVariances.length * 0.25)].variance;
const p75 = sortedVariances[Math.floor(sortedVariances.length * 0.75)].variance;
const p90 = sortedVariances[Math.floor(sortedVariances.length * 0.9)].variance;

console.log('Percentiles:');
console.log(`  10th: ${p10.toFixed(4)}`);
console.log(`  25th: ${p25.toFixed(4)}`);
console.log(`  75th: ${p75.toFixed(4)}`);
console.log(`  90th: ${p90.toFixed(4)}\n`);

// Distribution
console.log('Distribution:');
const ranges = [
  { label: '< 0.5', count: variances.filter(v => v.variance < 0.5).length },
  { label: '0.5 - 1.0', count: variances.filter(v => v.variance >= 0.5 && v.variance < 1.0).length },
  { label: '1.0 - 2.0', count: variances.filter(v => v.variance >= 1.0 && v.variance < 2.0).length },
  { label: '2.0 - 5.0', count: variances.filter(v => v.variance >= 2.0 && v.variance < 5.0).length },
  { label: '5.0 - 10.0', count: variances.filter(v => v.variance >= 5.0 && v.variance < 10.0).length },
  { label: '>= 10.0', count: variances.filter(v => v.variance >= 10.0).length }
];

ranges.forEach(r => {
  const bar = '█'.repeat(Math.floor(r.count / 2));
  console.log(`  ${r.label.padEnd(12)}: ${bar} (${r.count})`);
});

// Show highest variance moments (likely choir)
console.log('\n🎵 Highest Variance Moments (Likely Choir):');
sortedVariances.slice(-10).reverse().forEach((v, i) => {
  const timeStr = `${Math.floor(v.time / 60)}:${(v.time % 60).toString().padStart(2, '0')}`;
  console.log(`  ${i + 1}. ${timeStr} - Variance: ${v.variance.toFixed(4)}`);
});

// Suggested thresholds
console.log('\n💡 Suggested Thresholds:');
console.log(`  Choir (top 20%): variance > ${p75.toFixed(4)}`);
console.log(`  Celebrant (middle): ${p25.toFixed(4)} < variance < ${p75.toFixed(4)}`);
console.log(`  Deacon (bottom 25%): variance < ${p25.toFixed(4)}`);

// Save
const outputPath = path.join(__dirname, 'training-data/variance-distribution.json');
fs.writeFileSync(outputPath, JSON.stringify({
  statistics: { min, max, median, avg, p10, p25, p75, p90 },
  distribution: ranges,
  allVariances: variances,
  suggestedThresholds: {
    choir: p75,
    celebrantMin: p25,
    celebrantMax: p75,
    deacon: p25
  }
}, null, 2));

console.log(`\n💾 Saved to training-data/variance-distribution.json`);
