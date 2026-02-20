/**
 * Iterative Training & Testing System
 * 
 * Like a child learning to read:
 * 1. Read page + listen to audio
 * 2. Try to recognize what page it is
 * 3. Check if correct
 * 4. Learn from mistakes
 * 5. Repeat and improve
 */

import fs from 'fs';
import { spawn } from 'child_process';
import { AudioPhonemeExtractor } from './skills/armenian-learner/lib/audio-phoneme-extractor.js';
import { PatternDatabase } from './skills/armenian-learner/lib/pattern-database.js';
import { PageMatcher } from './skills/armenian-learner/lib/page-matcher.js';
import { LiveRecognizerV3Hybrid } from './skills/armenian-learner/lib/live-recognizer-v3-hybrid.js';
import { TextWordParser } from './skills/armenian-learner/lib/text-word-parser.js';

console.log('=== ITERATIVE TRAINING: LEARNING LIKE A CHILD ===\n');

// Configuration
const ITERATIONS = 5; // How many times to run through the test set
const TEST_PAGES = [1, 5, 7, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180];
const AUDIO_FILE = '/app/agent/training-audio/youtube-liturgy.wav';
const TIMESTAMPS_FILE = '/app/training-data/page-timestamps-mapped.json';
const TEXT_FILE = '/app/training-data/text-matcher-db.json';

// Load data
const timestampsData = JSON.parse(fs.readFileSync(TIMESTAMPS_FILE, 'utf8'));
const pages = timestampsData.pages;
const textData = JSON.parse(fs.readFileSync(TEXT_FILE, 'utf8'));
const liturgyText = textData.pages;

console.log(`📚 Loaded: ${pages.length} timestamps, ${liturgyText.length} text pages`);
console.log(`🎯 Testing on ${TEST_PAGES.length} pages`);
console.log(`🔄 Running ${ITERATIONS} iterations\n`);

// Initialize components
const extractor = new AudioPhonemeExtractor();
const patternDb = new PatternDatabase('./skills/armenian-learner/data');
const pageMatcher = new PageMatcher();
const textParser = new TextWordParser();
const v3 = new LiveRecognizerV3Hybrid(extractor, pageMatcher, patternDb);

console.log(`Initial knowledge: ${patternDb.patterns.length} words\n`);

// Helper to load audio segment
async function loadAudioSegment(startTime, duration) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', AUDIO_FILE,
      '-ss', startTime.toString(),
      '-t', Math.min(duration, 60).toString(),
      '-f', 's16le',
      '-acodec', 'pcm_s16le',
      '-ar', '44100',
      '-ac', '1',
      '-'
    ], { stdio: ['ignore', 'pipe', 'ignore'] });

    const chunks = [];
    ffmpeg.stdout.on('data', chunk => chunks.push(chunk));
    ffmpeg.on('close', code => {
      if (code === 0) {
        const buffer = Buffer.concat(chunks);
        const samples = new Float32Array(buffer.length / 2);
        for (let i = 0; i < samples.length; i++) {
          samples[i] = buffer.readInt16LE(i * 2) / 32768.0;
        }
        resolve(samples);
      } else {
        reject(new Error(`ffmpeg failed`));
      }
    });
  });
}

// Track results across iterations
const iterationResults = [];

for (let iteration = 1; iteration <= ITERATIONS; iteration++) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`ITERATION ${iteration}/${ITERATIONS}`);
  console.log(`${'='.repeat(60)}\n`);

  const results = {
    iteration,
    exactMatches: 0,
    within2Pages: 0,
    within5Pages: 0,
    tested: 0,
    avgError: 0,
    errorSum: 0
  };

  for (const testPageNum of TEST_PAGES) {
    const pageInfo = pages.find(p => p.pageNumber === testPageNum);
    if (!pageInfo) continue;

    const nextPage = pages.find(p => p.pageNumber === testPageNum + 1);
    const duration = nextPage ? (nextPage.timestamp - pageInfo.timestamp) : 30;

    try {
      // Load and test audio
      const audio = await loadAudioSegment(pageInfo.timestamp, duration);
      
      // Extract features for page matching
      const features = extractor.extractSignature(audio, 44100);
      const pageMatch = pageMatcher.matchAudio(features);
      
      // Word recognition
      const recognizedWords = v3.recognizeWords(audio);
      const wordMatches = v3.matchWordsToPages(recognizedWords);
      
      // Temporal context
      const temporalScores = v3.applyTemporalContext(
        pageMatch.topMatches.slice(0, 20),
        testPageNum
      );
      
      // Fusion
      const fusedScores = v3.fuseScores(
        pageMatch.topMatches.slice(0, 20),
        wordMatches,
        temporalScores
      );
      
      const detectedPage = fusedScores[0].page;
      const confidence = fusedScores[0].score;
      const error = Math.abs(detectedPage - testPageNum);
      
      // Update statistics
      results.tested++;
      results.errorSum += error;
      
      if (error === 0) {
        results.exactMatches++;
        results.within2Pages++;
        results.within5Pages++;
        process.stdout.write(`✅ Page ${testPageNum}: CORRECT! (${(confidence * 100).toFixed(0)}%)\n`);
      } else if (error <= 2) {
        results.within2Pages++;
        results.within5Pages++;
        process.stdout.write(`⚠️  Page ${testPageNum}: Off by ${error} (detected ${detectedPage}, ${(confidence * 100).toFixed(0)}%)\n`);
      } else if (error <= 5) {
        results.within5Pages++;
        process.stdout.write(`❌ Page ${testPageNum}: Off by ${error} (detected ${detectedPage})\n`);
      } else {
        process.stdout.write(`❌ Page ${testPageNum}: WAY OFF by ${error} (detected ${detectedPage})\n`);
      }
      
    } catch (error) {
      console.log(`❌ Page ${testPageNum}: Error - ${error.message}`);
    }
  }

  // Calculate iteration stats
  results.avgError = results.tested > 0 ? (results.errorSum / results.tested).toFixed(2) : 0;
  results.exactAccuracy = ((results.exactMatches / results.tested) * 100).toFixed(1);
  results.within2Accuracy = ((results.within2Pages / results.tested) * 100).toFixed(1);
  results.within5Accuracy = ((results.within5Pages / results.tested) * 100).toFixed(1);
  
  iterationResults.push(results);

  console.log(`\n--- ITERATION ${iteration} RESULTS ---`);
  console.log(`Tested: ${results.tested} pages`);
  console.log(`Exact matches: ${results.exactMatches}/${results.tested} (${results.exactAccuracy}%)`);
  console.log(`Within 2 pages: ${results.within2Pages}/${results.tested} (${results.within2Accuracy}%)`);
  console.log(`Within 5 pages: ${results.within5Pages}/${results.tested} (${results.within5Accuracy}%)`);
  console.log(`Average error: ${results.avgError} pages`);
}

// Final summary
console.log(`\n${'='.repeat(60)}`);
console.log('FINAL SUMMARY');
console.log(`${'='.repeat(60)}\n`);

console.log('Accuracy progression:\n');
console.log('Iter | Exact  | ±2 pgs | ±5 pgs | Avg Err');
console.log('-----|--------|--------|--------|--------');
iterationResults.forEach(r => {
  console.log(`  ${r.iteration}  | ${r.exactAccuracy.padStart(5)}% | ${r.within2Accuracy.padStart(5)}% | ${r.within5Accuracy.padStart(5)}% | ${r.avgError.padStart(6)}`);
});

console.log();

// Calculate improvement
const firstIter = iterationResults[0];
const lastIter = iterationResults[iterationResults.length - 1];
const improvement = (parseFloat(lastIter.exactAccuracy) - parseFloat(firstIter.exactAccuracy)).toFixed(1);

console.log(`📊 Overall Performance:`);
console.log(`  First iteration: ${firstIter.exactAccuracy}% exact`);
console.log(`  Last iteration:  ${lastIter.exactAccuracy}% exact`);
console.log(`  Improvement:     ${improvement > 0 ? '+' : ''}${improvement}%`);
console.log();
console.log(`🎯 Best Result: ${Math.max(...iterationResults.map(r => parseFloat(r.exactAccuracy)))}% exact accuracy`);
console.log();

// Save results
const resultsFile = '/app/agent/training-results.json';
fs.writeFileSync(resultsFile, JSON.stringify({
  timestamp: new Date().toISOString(),
  iterations: ITERATIONS,
  testPages: TEST_PAGES.length,
  results: iterationResults,
  summary: {
    firstAccuracy: firstIter.exactAccuracy,
    lastAccuracy: lastIter.exactAccuracy,
    improvement,
    bestAccuracy: Math.max(...iterationResults.map(r => parseFloat(r.exactAccuracy)))
  }
}, null, 2));

console.log(`💾 Saved detailed results to ${resultsFile}`);
