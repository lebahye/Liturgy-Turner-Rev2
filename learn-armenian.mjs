#!/usr/bin/env node
/**
 * Self-Learning Armenian Audio-to-Text Mapper
 * Learn Old/Western Armenian by correlating PDF text with audio
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧠 Learning Armenian from Liturgy');
console.log('==================================\n');

// Load page analysis
const pageData = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'training-data/page-analysis.json'))
);

console.log(`📚 Loaded ${pageData.length} pages\n`);

// Step 1: Build Armenian vocabulary from all pages
console.log('📝 Building Armenian vocabulary...');

const armenianWordPattern = /[Ա-և]+/g;
const wordFrequency = new Map();
const wordsByPage = new Map();

pageData.forEach(page => {
  const words = page.armenianText.match(armenianWordPattern) || [];
  wordsByPage.set(page.pageNumber, words);
  
  words.forEach(word => {
    if (word.length > 2) { // Skip very short words
      wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
    }
  });
});

// Sort by frequency
const sortedWords = Array.from(wordFrequency.entries())
  .sort((a, b) => b[1] - a[1]);

console.log(`✅ Found ${wordFrequency.size} unique Armenian words`);
console.log(`\n🔤 Most common words (likely prayers/repeated phrases):`);
sortedWords.slice(0, 20).forEach(([word, count], idx) => {
  console.log(`   ${idx + 1}. ${word} (${count}×)`);
});

// Step 2: Identify unique markers per page
console.log('\n🎯 Finding unique page markers...');

const uniqueMarkers = [];

pageData.forEach(page => {
  const words = wordsByPage.get(page.pageNumber) || [];
  
  // Find words that appear ONLY on this page or very rarely
  const rareWords = words.filter(word => {
    const freq = wordFrequency.get(word) || 0;
    return freq <= 3 && word.length >= 4;
  });
  
  // Get first 5-10 words as a "signature"
  const signature = words.slice(0, Math.min(10, words.length));
  
  uniqueMarkers.push({
    pageNumber: page.pageNumber,
    signature,
    rareWords,
    wordCount: words.length,
    uniqueness: rareWords.length / Math.max(words.length, 1)
  });
});

// Pages with high uniqueness are easier to identify
const highlyUnique = uniqueMarkers
  .filter(m => m.uniqueness > 0.3)
  .sort((a, b) => b.uniqueness - a.uniqueness);

console.log(`✅ Found ${highlyUnique.length} highly unique pages`);
console.log(`\nTop 10 most distinctive pages:`);
highlyUnique.slice(0, 10).forEach(marker => {
  console.log(`   Page ${marker.pageNumber}: ${marker.rareWords.slice(0, 3).join(', ')}`);
});

// Step 3: Build phonetic patterns
console.log('\n🔊 Analyzing Armenian phonetics...');

// Armenian letter frequency analysis
const letterFreq = new Map();
wordFrequency.forEach((count, word) => {
  for (const char of word) {
    letterFreq.set(char, (letterFreq.get(char) || 0) + count);
  }
});

const sortedLetters = Array.from(letterFreq.entries())
  .sort((a, b) => b[1] - a[1]);

console.log(`✅ Analyzed ${sortedLetters.length} Armenian letters`);
console.log(`Most common: ${sortedLetters.slice(0, 10).map(([l]) => l).join(' ')}`);

// Step 4: Create page signatures for matching
console.log('\n🎼 Creating acoustic signatures...');

const pageSignatures = pageData.map((page, idx) => {
  const words = wordsByPage.get(page.pageNumber) || [];
  const marker = uniqueMarkers[idx];
  
  // Estimate timestamp based on page position
  const estimatedStart = (idx * 28.6); // seconds
  const estimatedEnd = ((idx + 1) * 28.6);
  
  // Create a text signature hash (simple for now)
  const textHash = words.slice(0, 5).join('|');
  
  return {
    pageNumber: page.pageNumber,
    estimatedStart,
    estimatedEnd,
    duration: estimatedEnd - estimatedStart,
    textSignature: textHash,
    wordCount: words.length,
    uniqueWords: marker.rareWords,
    commonWords: words.filter(w => (wordFrequency.get(w) || 0) > 10)
  };
});

// Save signatures
const sigPath = path.join(__dirname, 'training-data/page-signatures.json');
fs.writeFileSync(sigPath, JSON.stringify(pageSignatures, null, 2));
console.log(`✅ Saved signatures to training-data/page-signatures.json`);

// Step 5: Build training instructions for audio fingerprinting
console.log('\n📊 Creating audio fingerprint training plan...');

const fingerprintPlan = {
  sampleRate: 48000,
  windowSize: 2048,
  hopSize: 512,
  features: [
    'mfcc',           // Mel-frequency cepstral coefficients (voice characteristics)
    'spectralCentroid', // Brightness of sound
    'spectralRolloff',  // Frequency shape
    'rms',             // Volume
    'zcr'              // Zero crossing rate (noisiness)
  ],
  pages: pageSignatures.map(sig => ({
    pageNumber: sig.pageNumber,
    startTime: sig.estimatedStart,
    endTime: sig.estimatedEnd,
    expectedWords: sig.wordCount,
    textSignature: sig.textSignature
  }))
};

const planPath = path.join(__dirname, 'training-data/fingerprint-plan.json');
fs.writeFileSync(planPath, JSON.stringify(fingerprintPlan, null, 2));
console.log(`✅ Saved fingerprint plan`);

// Summary
console.log('\n📈 Learning Summary');
console.log('==================');
console.log(`Total vocabulary: ${wordFrequency.size} unique words`);
console.log(`Highly distinctive pages: ${highlyUnique.length}`);
console.log(`Common prayers: ${sortedWords.filter(([_, c]) => c > 20).length} phrases`);
console.log(`\n✅ Armenian learning complete!`);

console.log('\n📌 Next Steps:');
console.log('1. Extract audio features using Meyda at each timestamp');
console.log('2. Build fingerprint database for all 183 pages');
console.log('3. Test live matching against the recording');
console.log('4. Refine timestamps based on actual audio patterns');

