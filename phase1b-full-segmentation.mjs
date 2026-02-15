#!/usr/bin/env node
/**
 * Phase 1B Extended: Full Audio Segmentation
 * Process ALL 183 pages to build comprehensive word templates
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Meyda = require('meyda');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔪 Phase 1B Extended: Full Audio Segmentation');
console.log('==============================================\n');

// Load data
const pageTimestamps = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'training-data/page-timestamps-mapped.json'), 'utf8')
).pages;

const textMatcher = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'training-data/text-matcher-db.json'), 'utf8')
);

console.log(`✅ Processing ALL ${pageTimestamps.length} pages\n`);

// Load audio
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

// Simple approach: Extract features for each page as a whole
// Build page-level templates (not word-level for now - faster)

console.log('🎵 Extracting acoustic signatures for each page...\n');

const pageTemplates = [];

for (let i = 0; i < pageTimestamps.length; i++) {
  const page = pageTimestamps[i];
  const nextPage = pageTimestamps[i + 1];
  const textData = textMatcher.pages.find(p => p.pageNumber === page.pageNumber);
  
  if (!textData || !nextPage) continue;
  
  const duration = Math.min(nextPage.timestamp - page.timestamp, 15);
  if (duration < 0.5) continue;
  
  if (i % 10 === 0) {
    process.stdout.write(`\r   Page ${i + 1}/${pageTimestamps.length}...`);
  }
  
  // Extract audio
  const samples = extractSamples(page.timestamp, duration);
  
  // Extract MFCC features
  const windowSize = 2048;
  const hopSize = 512;
  const numFrames = Math.floor((samples.length - windowSize) / hopSize);
  
  const mfccFrames = [];
  const energyFrames = [];
  const centroidFrames = [];
  
  for (let frame = 0; frame < Math.min(numFrames, 50); frame++) {
    const start = frame * hopSize;
    const frameData = samples.slice(start, start + windowSize);
    
    try {
      const features = Meyda.extract(['mfcc', 'rms', 'spectralCentroid'], frameData, {
        sampleRate: audioInfo.sampleRate,
        bufferSize: windowSize,
        windowingFunction: 'hanning'
      });
      
      if (features && features.mfcc) {
        mfccFrames.push(features.mfcc);
        energyFrames.push(features.rms || 0);
        centroidFrames.push(features.spectralCentroid || 0);
      }
    } catch (err) {}
  }
  
  // Average features
  const avgMFCC = averageArray2D(mfccFrames);
  const avgEnergy = energyFrames.reduce((a, b) => a + b, 0) / energyFrames.length || 0;
  const avgCentroid = centroidFrames.reduce((a, b) => a + b, 0) / centroidFrames.length || 0;
  
  // Get Armenian words
  const armenianWords = (textData.armenianText.match(/[Ա-ֆ]+/g) || []).slice(0, 10);
  
  pageTemplates.push({
    pageNumber: page.pageNumber,
    timestamp: page.timestamp,
    duration,
    features: {
      mfcc: avgMFCC,
      energy: avgEnergy,
      centroid: avgCentroid
    },
    armenianWords,
    firstWords: armenianWords.slice(0, 3)
  });
}

function averageArray2D(arr) {
  if (!arr || arr.length === 0) return [];
  const len = arr[0].length;
  const result = new Array(len).fill(0);
  arr.forEach(row => row.forEach((val, i) => result[i] += val));
  return result.map(v => v / arr.length);
}

console.log(`\r✅ Extracted templates for ${pageTemplates.length} pages\n`);

// Build comprehensive word → pages index
console.log('📚 Building word-to-page index...\n');

const wordIndex = new Map();

pageTemplates.forEach(page => {
  page.armenianWords.forEach(word => {
    if (!wordIndex.has(word)) {
      wordIndex.set(word, []);
    }
    wordIndex.get(word).push({
      pageNumber: page.pageNumber,
      timestamp: page.timestamp,
      features: page.features
    });
  });
});

console.log(`✅ Indexed ${wordIndex.size} unique words\n`);

// Show coverage
console.log('📊 Top 20 most common words:\n');
const sortedWords = Array.from(wordIndex.entries())
  .sort((a, b) => b[1].length - a[1].length)
  .slice(0, 20);

sortedWords.forEach(([word, pages], idx) => {
  console.log(`   ${idx + 1}. ${word} (${pages.length} pages)`);
});

// Save comprehensive templates
console.log('\n💾 Saving comprehensive templates...\n');

const comprehensiveData = {
  pageTemplates,
  wordIndex: Array.from(wordIndex.entries()).map(([word, pages]) => ({
    word,
    pageCount: pages.length,
    pages: pages.map(p => ({ pageNumber: p.pageNumber, timestamp: p.timestamp }))
  })),
  metadata: {
    created: new Date().toISOString(),
    totalPages: pageTemplates.length,
    totalWords: wordIndex.size,
    sampleRate: audioInfo.sampleRate
  }
};

fs.writeFileSync(
  path.join(__dirname, 'training-data/comprehensive-templates.json'),
  JSON.stringify(comprehensiveData, null, 2)
);

console.log('✅ Saved comprehensive-templates.json\n');

console.log('📊 Summary');
console.log('==========');
console.log(`✅ Page templates: ${pageTemplates.length}`);
console.log(`✅ Unique words: ${wordIndex.size}`);
console.log(`✅ Total word→page mappings: ${Array.from(wordIndex.values()).reduce((sum, pages) => sum + pages.length, 0)}\n`);

console.log('🎯 Next: Rebuild live system with comprehensive templates');
