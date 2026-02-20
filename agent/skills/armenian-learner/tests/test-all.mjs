#!/usr/bin/env node
/**
 * Test suite for Armenian Learner skill
 */

import { AudioPhonemeExtractor } from '../lib/audio-phoneme-extractor.js';
import { TextWordParser } from '../lib/text-word-parser.js';
import { PatternDatabase } from '../lib/pattern-database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 Armenian Learner - Test Suite\n');

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    testsPassed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    testsFailed++;
  }
}

// Test 1: Audio Extractor Initialization
test('Audio extractor initializes', () => {
  const extractor = new AudioPhonemeExtractor();
  if (!extractor) throw new Error('Failed to create extractor');
  if (extractor.sampleRate !== 44100) throw new Error('Wrong sample rate');
});

// Test 2: Audio Signature Extraction
test('Audio signature extraction', () => {
  const extractor = new AudioPhonemeExtractor();
  const testAudio = new Float32Array(44100); // 1 second of silence
  const signature = extractor.extractSignature(testAudio);
  
  if (!signature.mfcc || signature.mfcc.length === 0) {
    throw new Error('No MFCC features');
  }
  if (typeof signature.duration !== 'number') {
    throw new Error('No duration');
  }
});

// Test 3: Text Parser Initialization
test('Text parser initializes', () => {
  const parser = new TextWordParser();
  if (!parser) throw new Error('Failed to create parser');
  if (!parser.armenianRegex) throw new Error('No Armenian regex');
});

// Test 4: Text Parser - Extract Words
test('Text parser extracts words', () => {
  const parser = new TextWordParser();
  const testPage = {
    pageNumber: 1,
    armenianText: 'Սուրբ Աստուած Սուրբ եւ Հզօր'
  };
  
  const words = parser.extractWords(testPage);
  if (words.length === 0) throw new Error('No words extracted');
  if (!words[0].word) throw new Error('Word missing');
  if (words[0].page !== 1) throw new Error('Wrong page number');
});

// Test 5: Pattern Database Initialization
test('Pattern database initializes', () => {
  const tempDir = path.join(__dirname, '../data/test-temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const db = new PatternDatabase(tempDir);
  if (!db) throw new Error('Failed to create database');
  if (!Array.isArray(db.patterns)) throw new Error('No patterns array');
  
  // Cleanup
  try {
    fs.rmSync(tempDir, { recursive: true });
  } catch (e) {}
});

// Test 6: Pattern Database - Add Pattern
test('Pattern database adds patterns', () => {
  const tempDir = path.join(__dirname, '../data/test-temp2');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const db = new PatternDatabase(tempDir);
  
  const testPattern = {
    armenianWord: 'Աստուած',
    soundSignature: {
      mfcc: [1, 2, 3, 4, 5],
      duration: 0.5
    },
    confidence: 0.8
  };
  
  db.addPattern(testPattern);
  
  if (db.patterns.length === 0) throw new Error('Pattern not added');
  if (db.patterns[0].armenianWord !== 'Աստուած') throw new Error('Wrong word');
  
  // Cleanup
  try {
    fs.rmSync(tempDir, { recursive: true });
  } catch (e) {}
});

// Test 7: Load Real Text Database
test('Load real text database', () => {
  const parser = new TextWordParser();
  const textDbPath = '/app/training-data/text-matcher-db.json';
  
  if (!fs.existsSync(textDbPath)) {
    throw new Error('Text database not found');
  }
  
  const pages = parser.loadTextDatabase(textDbPath);
  if (pages.length === 0) throw new Error('No pages loaded');
  if (pages.length !== 183) throw new Error(`Expected 183 pages, got ${pages.length}`);
});

// Test 8: Process All Pages
test('Process all pages from real database', () => {
  const parser = new TextWordParser();
  const textDbPath = '/app/training-data/text-matcher-db.json';
  const pages = parser.loadTextDatabase(textDbPath);
  const pageWords = parser.processAllPages(pages.slice(0, 10)); // Just first 10
  
  if (pageWords.size === 0) throw new Error('No pages processed');
  if (!pageWords.get(1)) throw new Error('Page 1 not found');
});

// Test 9: Get Vocabulary
test('Get vocabulary from pages', () => {
  const parser = new TextWordParser();
  const textDbPath = '/app/training-data/text-matcher-db.json';
  const pages = parser.loadTextDatabase(textDbPath);
  const pageWords = parser.processAllPages(pages.slice(0, 10));
  const vocab = parser.getVocabulary(pageWords);
  
  if (vocab.size === 0) throw new Error('No vocabulary');
});

// Test 10: Pattern Matching
test('Pattern matching works', () => {
  const tempDir = path.join(__dirname, '../data/test-temp3');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const db = new PatternDatabase(tempDir);
  
  // Add a pattern
  db.addPattern({
    armenianWord: 'test',
    soundSignature: {
      mfcc: [1, 2, 3, 4, 5],
      duration: 0.5
    },
    confidence: 0.8
  });
  
  // Try to match
  const matches = db.findMatchingPatterns({
    mfcc: [1.1, 2.1, 3.1, 4.1, 5.1],
    duration: 0.52
  });
  
  if (matches.length === 0) throw new Error('No matches found');
  
  // Cleanup
  try {
    fs.rmSync(tempDir, { recursive: true });
  } catch (e) {}
});

// Summary
console.log('\n📊 Test Results:');
console.log(`✅ Passed: ${testsPassed}`);
console.log(`❌ Failed: ${testsFailed}`);
console.log(`📈 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);

if (testsFailed === 0) {
  console.log('\n🎉 All tests passed! Skill is ready to use.');
  process.exit(0);
} else {
  console.log('\n⚠️  Some tests failed. Fix issues before using.');
  process.exit(1);
}
