#!/usr/bin/env node
/**
 * Phase 1A: Extract Phonetic Features from Classical Armenian
 * Learn how Old Armenian sounds by analyzing the actual recording
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Meyda = require('meyda');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🎓 Phase 1A: Classical Armenian Phonetic Extraction');
console.log('====================================================\n');

// Load our aligned data
const pageTimestamps = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'training-data/page-timestamps-mapped.json'), 'utf8')
).pages;

const textMatcher = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'training-data/text-matcher-db.json'), 'utf8')
);

console.log(`✅ Loaded ${pageTimestamps.length} page timestamps`);
console.log(`✅ Loaded ${textMatcher.pages.length} pages with text\n`);

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
console.log(`📊 Audio: ${audioInfo.sampleRate}Hz, ${audioInfo.bitsPerSample}bit\n`);

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

// Step 1: Extract acoustic features for each page
console.log('🔊 Step 1: Extracting acoustic features per page...\n');

const pageAcoustics = [];

for (let i = 0; i < Math.min(pageTimestamps.length, 20); i++) {
  const page = pageTimestamps[i];
  const nextPage = pageTimestamps[i + 1];
  const textData = textMatcher.pages.find(p => p.pageNumber === page.pageNumber);
  
  if (!textData || !nextPage) continue;
  
  const duration = Math.min(nextPage.timestamp - page.timestamp, 30);
  if (duration < 0.5) continue;
  
  console.log(`📄 Page ${page.pageNumber} (${page.timestamp.toFixed(1)}s - ${(page.timestamp + duration).toFixed(1)}s)`);
  
  // Extract audio for this page
  const samples = extractSamples(page.timestamp, duration);
  
  // Analyze acoustic properties
  const windowSize = 2048;
  const hopSize = 512;
  const numFrames = Math.floor((samples.length - windowSize) / hopSize);
  
  const features = {
    formants: [],       // Vowel frequencies
    pitches: [],        // Fundamental frequency
    energy: [],         // Volume
    spectralShape: [],  // Overall frequency distribution
    zeroCrossings: []   // Noisiness (consonants)
  };
  
  for (let frame = 0; frame < Math.min(numFrames, 50); frame++) {
    const start = frame * hopSize;
    const frameData = samples.slice(start, start + windowSize);
    
    try {
      const mf = Meyda.extract([
        'spectralCentroid', 'spectralRolloff', 'rms', 'zcr', 'spectralFlatness'
      ], frameData, {
        sampleRate: audioInfo.sampleRate,
        bufferSize: windowSize,
        windowingFunction: 'hanning'
      });
      
      if (mf) {
        if (mf.spectralCentroid) features.formants.push(mf.spectralCentroid);
        if (mf.spectralRolloff) features.spectralShape.push(mf.spectralRolloff);
        if (mf.rms) features.energy.push(mf.rms);
        if (mf.zcr) features.zeroCrossings.push(mf.zcr);
      }
    } catch (err) {}
  }
  
  // Calculate statistics
  const avgFormant = features.formants.reduce((a, b) => a + b, 0) / features.formants.length || 0;
  const avgEnergy = features.energy.reduce((a, b) => a + b, 0) / features.energy.length || 0;
  const avgZC = features.zeroCrossings.reduce((a, b) => a + b, 0) / features.zeroCrossings.length || 0;
  
  // Extract Armenian words on this page
  const armenianWords = (textData.armenianText.match(/[Ա-ֆ]+/g) || []).slice(0, 10);
  
  console.log(`   Armenian: ${armenianWords.slice(0, 5).join(' ')}`);
  console.log(`   Formant: ${avgFormant.toFixed(0)} Hz (vowel brightness)`);
  console.log(`   Energy: ${avgEnergy.toFixed(4)} (volume)`);
  console.log(`   ZC: ${avgZC.toFixed(4)} (consonant density)\n`);
  
  pageAcoustics.push({
    pageNumber: page.pageNumber,
    timestamp: page.timestamp,
    duration,
    armenianWords,
    acousticProfile: {
      avgFormant,
      avgEnergy,
      avgZeroCrossing: avgZC,
      formantVariance: calculateVariance(features.formants),
      energyVariance: calculateVariance(features.energy)
    }
  });
}

function calculateVariance(arr) {
  if (!arr || arr.length === 0) return 0;
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
  return arr.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / arr.length;
}

console.log('✅ Extracted acoustic features for first 20 pages\n');

// Step 2: Build Classical Armenian Letter → Sound mapping
console.log('🔤 Step 2: Building Classical Armenian phoneme library...\n');

// Classical Armenian alphabet
const classicalArmenianLetters = [
  'Ա', 'Բ', 'Գ', 'Դ', 'Ե', 'Զ', 'Է', 'Ը', 'Թ', 'Ժ',
  'Ի', 'Լ', 'Խ', 'Ծ', 'Կ', 'Հ', 'Ձ', 'Ղ', 'Ճ', 'Մ',
  'Յ', 'Ն', 'Շ', 'Ո', 'Չ', 'Պ', 'Ջ', 'Ռ', 'Ս', 'Վ',
  'Տ', 'Ր', 'Ց', 'ՈՒ', 'Փ', 'Ք', 'Օ', 'Ֆ'
];

console.log(`Classical Armenian has ${classicalArmenianLetters.length} letters\n`);

// Count letter frequency in our liturgy
const letterFreq = new Map();

textMatcher.pages.forEach(page => {
  const armenian = page.armenianText;
  for (const char of armenian) {
    if (/[Ա-ֆ]/.test(char)) {
      letterFreq.set(char, (letterFreq.get(char) || 0) + 1);
    }
  }
});

const sortedLetters = Array.from(letterFreq.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20);

console.log('Most common Classical Armenian letters in liturgy:');
sortedLetters.forEach(([letter, count], idx) => {
  console.log(`   ${idx + 1}. ${letter} (${count}×)`);
});

console.log('\n💾 Saving phonetic analysis...\n');

const phoneticAnalysis = {
  totalPages: pageAcoustics.length,
  pageAcoustics,
  letterFrequency: Array.from(letterFreq.entries()).map(([letter, count]) => ({ letter, count })),
  classicalAlphabet: classicalArmenianLetters,
  analysisDate: new Date().toISOString()
};

fs.writeFileSync(
  path.join(__dirname, 'training-data/phonetic-analysis.json'),
  JSON.stringify(phoneticAnalysis, null, 2)
);

console.log('✅ Saved phonetic-analysis.json\n');

console.log('📊 Summary');
console.log('==========');
console.log(`✅ Analyzed ${pageAcoustics.length} pages`);
console.log(`✅ Identified ${letterFreq.size} unique Armenian letters`);
console.log(`✅ Extracted acoustic profiles for Classical Armenian\n`);

console.log('📌 Next Steps:');
console.log('1. Segment audio into individual words');
console.log('2. Build acoustic templates for each of 1,348 words');
console.log('3. Create word-level recognizer');
console.log('4. Test recognition accuracy\n');

console.log('🎯 Goal: Custom Classical Armenian recognizer');
console.log('   Vocabulary: ONLY our 1,348 liturgical words');
console.log('   Expected accuracy: 95-99% (specialized domain)');
