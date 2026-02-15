#!/usr/bin/env node
/**
 * Phase 1B: Word Segmentation
 * Detect word boundaries in audio and extract individual word samples
 * Align with Classical Armenian text from liturgy
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Meyda = require('meyda');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔪 Phase 1B: Word Segmentation');
console.log('================================\n');

// Load data
const pageTimestamps = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'training-data/page-timestamps-mapped.json'), 'utf8')
).pages;

const textMatcher = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'training-data/text-matcher-db.json'), 'utf8')
);

console.log(`✅ Loaded ${pageTimestamps.length} pages\n`);

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

// Voice Activity Detection (VAD)
function detectSpeechSegments(samples, sampleRate) {
  const frameSizeMs = 20; // 20ms frames
  const frameSizeSamples = Math.floor((frameSizeMs / 1000) * sampleRate);
  const numFrames = Math.floor(samples.length / frameSizeSamples);
  
  const energyThreshold = 0.001; // Minimum energy for speech
  const segments = [];
  let inSpeech = false;
  let speechStart = 0;
  
  for (let i = 0; i < numFrames; i++) {
    const start = i * frameSizeSamples;
    const end = Math.min(start + frameSizeSamples, samples.length);
    const frame = samples.slice(start, end);
    
    // Calculate frame energy (RMS)
    const energy = Math.sqrt(
      frame.reduce((sum, val) => sum + val * val, 0) / frame.length
    );
    
    if (!inSpeech && energy > energyThreshold) {
      // Speech started
      inSpeech = true;
      speechStart = i;
    } else if (inSpeech && energy <= energyThreshold) {
      // Check if silence continues for 3 frames (60ms)
      let silenceFrames = 0;
      for (let j = i; j < Math.min(i + 3, numFrames); j++) {
        const checkStart = j * frameSizeSamples;
        const checkEnd = Math.min(checkStart + frameSizeSamples, samples.length);
        const checkFrame = samples.slice(checkStart, checkEnd);
        const checkEnergy = Math.sqrt(
          checkFrame.reduce((sum, val) => sum + val * val, 0) / checkFrame.length
        );
        if (checkEnergy <= energyThreshold) silenceFrames++;
      }
      
      if (silenceFrames >= 2) {
        // Speech ended
        inSpeech = false;
        const startTime = (speechStart * frameSizeSamples) / sampleRate;
        const endTime = (i * frameSizeSamples) / sampleRate;
        const duration = endTime - startTime;
        
        // Filter out very short segments (< 100ms) - likely noise
        if (duration > 0.1 && duration < 5.0) {
          segments.push({ startTime, endTime, duration });
        }
      }
    }
  }
  
  return segments;
}

console.log('🎤 Segmenting pages into speech chunks...\n');

const wordSegments = [];
let totalSegments = 0;

// Process first 30 pages for now (testing)
for (let i = 0; i < Math.min(pageTimestamps.length, 30); i++) {
  const page = pageTimestamps[i];
  const nextPage = pageTimestamps[i + 1];
  const textData = textMatcher.pages.find(p => p.pageNumber === page.pageNumber);
  
  if (!textData || !nextPage) continue;
  
  const duration = Math.min(nextPage.timestamp - page.timestamp, 30);
  if (duration < 0.5) continue;
  
  process.stdout.write(`\r📄 Page ${page.pageNumber}/${pageTimestamps.length}...`);
  
  // Extract audio for this page
  const samples = extractSamples(page.timestamp, duration);
  
  // Detect speech segments
  const segments = detectSpeechSegments(samples, audioInfo.sampleRate);
  
  // Get Armenian words for this page
  const armenianWords = (textData.armenianText.match(/[Ա-ֆ]+/g) || []);
  
  // Try to align segments with words
  // Assumption: number of segments ≈ number of significant words/phrases
  segments.forEach((segment, idx) => {
    const absoluteStart = page.timestamp + segment.startTime;
    const absoluteEnd = page.timestamp + segment.endTime;
    
    // Try to guess which word this might be
    const wordIndex = Math.floor((idx / segments.length) * armenianWords.length);
    const likelyWord = armenianWords[wordIndex] || 'unknown';
    
    wordSegments.push({
      pageNumber: page.pageNumber,
      segmentIndex: idx,
      startTime: absoluteStart,
      endTime: absoluteEnd,
      duration: segment.duration,
      likelyWord
    });
    
    totalSegments++;
  });
}

console.log(`\r✅ Segmented ${totalSegments} speech chunks from 30 pages\n`);

// Extract acoustic features for each segment
console.log('🔊 Extracting features for speech segments...\n');

const wordAcoustics = wordSegments.slice(0, 100).map((segment, idx) => {
  if (idx % 10 === 0) {
    process.stdout.write(`\r   Processing segment ${idx + 1}/100...`);
  }
  
  const samples = extractSamples(segment.startTime, segment.duration);
  
  // Extract MFCC and other features
  const windowSize = 512;
  const hopSize = 256;
  const numFrames = Math.floor((samples.length - windowSize) / hopSize);
  
  const mfccFrames = [];
  const energyFrames = [];
  
  for (let frame = 0; frame < Math.min(numFrames, 20); frame++) {
    const start = frame * hopSize;
    const frameData = samples.slice(start, start + windowSize);
    
    try {
      const features = Meyda.extract(['mfcc', 'rms'], frameData, {
        sampleRate: audioInfo.sampleRate,
        bufferSize: windowSize,
        windowingFunction: 'hanning'
      });
      
      if (features && features.mfcc) {
        mfccFrames.push(features.mfcc);
        energyFrames.push(features.rms || 0);
      }
    } catch (err) {}
  }
  
  // Average MFCC across frames
  const avgMFCC = averageArray2D(mfccFrames);
  const avgEnergy = energyFrames.reduce((a, b) => a + b, 0) / energyFrames.length || 0;
  
  return {
    ...segment,
    acousticFeatures: {
      mfcc: avgMFCC,
      energy: avgEnergy,
      numFrames: mfccFrames.length
    }
  };
});

function averageArray2D(arr) {
  if (!arr || arr.length === 0) return [];
  const len = arr[0].length;
  const result = new Array(len).fill(0);
  arr.forEach(row => row.forEach((val, i) => result[i] += val));
  return result.map(v => v / arr.length);
}

console.log(`\r✅ Extracted features for 100 segments\n`);

// Group segments by likely word
console.log('📚 Grouping segments by word...\n');

const wordTemplates = new Map();

wordAcoustics.forEach(segment => {
  const word = segment.likelyWord;
  if (!wordTemplates.has(word)) {
    wordTemplates.set(word, []);
  }
  wordTemplates.get(word).push(segment);
});

console.log(`✅ Found templates for ${wordTemplates.size} unique words\n`);

// Show some examples
console.log('📖 Example word templates:\n');
let count = 0;
for (const [word, segments] of wordTemplates.entries()) {
  if (count++ >= 10) break;
  console.log(`   ${word}: ${segments.length} samples`);
}

// Save word segments
console.log('\n💾 Saving word segmentation data...\n');

const segmentationData = {
  totalSegments,
  processedPages: 30,
  wordSegments: wordSegments.slice(0, 500), // Save first 500
  wordAcoustics: wordAcoustics,
  wordTemplates: Array.from(wordTemplates.entries()).map(([word, segments]) => ({
    word,
    sampleCount: segments.length,
    avgDuration: segments.reduce((sum, s) => sum + s.duration, 0) / segments.length
  })),
  metadata: {
    created: new Date().toISOString(),
    sampleRate: audioInfo.sampleRate
  }
};

fs.writeFileSync(
  path.join(__dirname, 'training-data/word-segments.json'),
  JSON.stringify(segmentationData, null, 2)
);

console.log('✅ Saved word-segments.json\n');

console.log('📊 Summary');
console.log('==========');
console.log(`✅ Segmented ${totalSegments} speech chunks`);
console.log(`✅ Extracted features for ${wordAcoustics.length} segments`);
console.log(`✅ Created templates for ${wordTemplates.size} unique words\n`);

console.log('📌 Next: Phase 2');
console.log('Build acoustic templates for ALL 1,348 liturgical words\n');
