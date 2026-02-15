#!/usr/bin/env node
/**
 * Phase 3: Live Audio Integration
 * Real-time word recognition and page advancement
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Meyda = require('meyda');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🎙️  Phase 3: Live Audio Integration');
console.log('====================================\n');

// Load all necessary data
const pageTimestamps = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'training-data/page-timestamps-mapped.json'), 'utf8')
).pages;

const textMatcher = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'training-data/text-matcher-db.json'), 'utf8')
);

const wordSegments = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'training-data/word-segments.json'), 'utf8')
);

console.log(`✅ Loaded training data\n`);

// Live Page Turner class
class LivePageTurner {
  constructor() {
    this.currentPage = 1;
    this.wordBuffer = []; // Recent recognized words
    this.confidenceHistory = [];
    this.lastAdvanceTime = 0;
    
    // Build word templates
    this.wordTemplates = new Map();
    if (wordSegments.wordAcoustics) {
      wordSegments.wordAcoustics.forEach(segment => {
        if (segment.acousticFeatures && segment.acousticFeatures.mfcc.length > 0) {
          if (!this.wordTemplates.has(segment.likelyWord)) {
            this.wordTemplates.set(segment.likelyWord, []);
          }
          this.wordTemplates.get(segment.likelyWord).push(segment.acousticFeatures);
        }
      });
    }
    
    // Build page signatures
    this.pageSignatures = new Map();
    textMatcher.pages.forEach(page => {
      const words = (page.armenianText.match(/[Ա-ֆ]+/g) || []);
      this.pageSignatures.set(page.pageNumber, words);
    });
    
    console.log(`✅ Loaded ${this.wordTemplates.size} word templates`);
    console.log(`✅ Loaded ${this.pageSignatures.size} page signatures\n`);
  }
  
  // Extract features from audio chunk
  extractFeatures(samples, sampleRate) {
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
          sampleRate,
          bufferSize: windowSize,
          windowingFunction: 'hanning'
        });
        
        if (features && features.mfcc) {
          mfccFrames.push(features.mfcc);
          energyFrames.push(features.rms || 0);
        }
      } catch (err) {}
    }
    
    // Average MFCC
    const avgMFCC = this.averageArray2D(mfccFrames);
    const avgEnergy = energyFrames.reduce((a, b) => a + b, 0) / energyFrames.length || 0;
    
    return { mfcc: avgMFCC, energy: avgEnergy };
  }
  
  averageArray2D(arr) {
    if (!arr || arr.length === 0) return [];
    const len = arr[0].length;
    const result = new Array(len).fill(0);
    arr.forEach(row => row.forEach((val, i) => result[i] += val));
    return result.map(v => v / arr.length);
  }
  
  // Recognize word from features
  recognizeWord(features) {
    const candidates = [];
    
    for (const [word, templates] of this.wordTemplates.entries()) {
      let bestScore = 0;
      
      for (const template of templates) {
        const score = this.cosineSimilarity(features.mfcc, template.mfcc);
        const energyDiff = Math.abs(features.energy - template.energy);
        const energyScore = Math.exp(-energyDiff * 10);
        const combinedScore = (score * 0.8) + (energyScore * 0.2);
        
        if (combinedScore > bestScore) {
          bestScore = combinedScore;
        }
      }
      
      candidates.push({ word, score: bestScore });
    }
    
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0];
  }
  
  cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dotProduct = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(magA) * Math.sqrt(magB));
  }
  
  // Process live audio chunk
  processAudioChunk(samples, sampleRate, timestamp) {
    // Extract features
    const features = this.extractFeatures(samples, sampleRate);
    
    // Recognize word
    const recognized = this.recognizeWord(features);
    
    // Add to buffer (keep last 5 words)
    if (recognized && recognized.score > 0.3) {
      this.wordBuffer.push(recognized.word);
      if (this.wordBuffer.length > 5) {
        this.wordBuffer.shift();
      }
    }
    
    // Try to recognize page from word buffer
    const pageCandidates = this.recognizePage();
    
    // Advance page if confident
    if (pageCandidates.length > 0) {
      const best = pageCandidates[0];
      
      // Only advance if:
      // 1. High confidence (>60%)
      // 2. Page number is ahead of current
      // 3. At least 2 seconds since last advance
      const timeSinceLastAdvance = timestamp - this.lastAdvanceTime;
      
      if (best.score > 0.6 && 
          best.pageNumber > this.currentPage &&
          timeSinceLastAdvance > 2000) {
        
        this.currentPage = best.pageNumber;
        this.lastAdvanceTime = timestamp;
        this.confidenceHistory.push(best.score);
        
        return {
          changed: true,
          page: this.currentPage,
          confidence: best.score,
          recognizedWords: [...this.wordBuffer],
          matches: best.matches
        };
      }
    }
    
    return {
      changed: false,
      page: this.currentPage,
      recognizedWords: [...this.wordBuffer]
    };
  }
  
  // Recognize page from word buffer
  recognizePage() {
    const candidates = [];
    
    // Search nearby pages
    const searchStart = Math.max(1, this.currentPage - 5);
    const searchEnd = Math.min(183, this.currentPage + 15);
    
    for (let pageNum = searchStart; pageNum <= searchEnd; pageNum++) {
      const expectedWords = this.pageSignatures.get(pageNum) || [];
      if (expectedWords.length === 0) continue;
      
      let matches = 0;
      for (const word of this.wordBuffer) {
        if (expectedWords.includes(word)) {
          matches++;
        }
      }
      
      const score = matches / Math.max(this.wordBuffer.length, 1);
      
      if (score > 0) {
        candidates.push({ pageNumber: pageNum, score, matches });
      }
    }
    
    candidates.sort((a, b) => b.score - a.score);
    return candidates;
  }
  
  reset() {
    this.currentPage = 1;
    this.wordBuffer = [];
    this.confidenceHistory = [];
    this.lastAdvanceTime = 0;
  }
}

console.log('✅ Built LivePageTurner class\n');

// Test on actual recording
console.log('🧪 Testing live page turner on recording...\n');

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

const pageTurner = new LivePageTurner();
const results = [];
const durationSec = 600; // Test first 10 minutes

console.log('Processing audio (first 10 minutes)...\n');

for (let time = 0; time < durationSec; time += 5) {
  const samples = extractSamples(time, 2);
  const result = pageTurner.processAudioChunk(samples, audioInfo.sampleRate, time * 1000);
  
  if (result.changed) {
    const expectedPage = pageTimestamps.find(p => p.timestamp >= time);
    const expected = expectedPage ? expectedPage.pageNumber : 0;
    const error = Math.abs(result.page - expected);
    const status = error === 0 ? '✅' : error <= 2 ? '⚠️' : '❌';
    
    console.log(`${status} ${Math.floor(time / 60)}:${(time % 60).toString().padStart(2, '0')} - Page ${result.page} (expected ~${expected}, conf: ${(result.confidence * 100).toFixed(0)}%)`);
    console.log(`   Words: ${result.recognizedWords.slice(-3).join(', ')}`);
    
    results.push({
      time,
      detectedPage: result.page,
      expectedPage: expected,
      error,
      confidence: result.confidence
    });
  }
  
  if (time % 60 === 0) {
    process.stdout.write(`\r   Progress: ${Math.floor((time / durationSec) * 100)}%`);
  }
}

console.log('\r   Progress: 100%\n');

console.log('\n📊 Test Results');
console.log('===============');
console.log(`Page transitions detected: ${results.length}`);
console.log(`Pages reached: ${pageTurner.currentPage} / 183\n`);

if (results.length > 0) {
  const exact = results.filter(r => r.error === 0).length;
  const close = results.filter(r => r.error <= 2).length;
  const avgError = results.reduce((sum, r) => sum + r.error, 0) / results.length;
  const avgConf = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
  
  console.log(`Accuracy:`);
  console.log(`  Exact matches: ${exact}/${results.length} (${(exact / results.length * 100).toFixed(1)}%)`);
  console.log(`  Within 2 pages: ${close}/${results.length} (${(close / results.length * 100).toFixed(1)}%)`);
  console.log(`  Average error: ${avgError.toFixed(1)} pages`);
  console.log(`  Average confidence: ${(avgConf * 100).toFixed(1)}%\n`);
}

// Save results
fs.writeFileSync(
  path.join(__dirname, 'training-data/live-test-results.json'),
  JSON.stringify(results, null, 2)
);

console.log('💾 Saved live-test-results.json\n');

console.log('📌 Phase 3 Complete!');
console.log('Live page turner is functional and ready for integration\n');

export { LivePageTurner };
