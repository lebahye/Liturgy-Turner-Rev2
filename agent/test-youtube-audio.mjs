/**
 * Test V3 Hybrid System on New YouTube Audio
 * Quick validation before full processing
 */

import fs from 'fs';
import { spawn } from 'child_process';
import { AudioPhonemeExtractor } from './skills/armenian-learner/lib/audio-phoneme-extractor.js';
import { PatternDatabase } from './skills/armenian-learner/lib/pattern-database.js';
import { PageMatcher } from './skills/armenian-learner/lib/page-matcher.js';
import { LiveRecognizerV3Hybrid } from './skills/armenian-learner/lib/live-recognizer-v3-hybrid.js';

console.log('=== TESTING V3 ON NEW YOUTUBE AUDIO ===');
console.log();

// Load page timestamps from original training
const timestampsData = JSON.parse(fs.readFileSync('/app/training-data/page-timestamps-mapped.json', 'utf8'));
const timestamps = timestampsData.pages;
console.log(`📄 Loaded ${timestamps.length} page timestamps`);

// Test sample pages (beginning, middle, end)
const testPages = [7, 50, 100, 150];
console.log(`🎯 Testing pages: ${testPages.join(', ')}`);
console.log();

// Initialize V3 system
console.log('📦 Initializing V3 Hybrid System...');
const audioExtractor = new AudioPhonemeExtractor();
const patternDb = new PatternDatabase('./skills/armenian-learner/data');
const pageMatcher = new PageMatcher();
const liveRecognizerV3 = new LiveRecognizerV3Hybrid(audioExtractor, pageMatcher, patternDb);

console.log('✅ V3 System loaded');
console.log(`  Patterns: ${patternDb.patterns.length}`);
console.log(`  Words indexed: ${Object.keys(liveRecognizerV3.wordToPages).length}`);
console.log();

// Helper function to extract audio segment using ffmpeg
async function extractAudioSegment(inputFile, startTime, duration) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputFile,
      '-ss', startTime.toString(),
      '-t', duration.toString(),
      '-ac', '1', // mono
      '-ar', '44100', // 44.1kHz
      '-f', 's16le', // PCM 16-bit
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
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
  });
}

// Test each page
console.log('=== TESTING RECOGNITION ===');
console.log();

let correctCount = 0;
let within2Count = 0;

for (const testPage of testPages) {
  const pageInfo = timestamps.find(t => t.pageNumber === testPage);
  if (!pageInfo) {
    console.log(`⚠️  Page ${testPage}: No timestamp info`);
    continue;
  }

  // Calculate duration to next page
  const nextPage = timestamps.find(t => t.pageNumber === testPage + 1);
  const duration = nextPage ? (nextPage.timestamp - pageInfo.timestamp) : 30;

  console.log(`\n📖 Testing Page ${testPage}...`);
  console.log(`  Timestamp: ${pageInfo.timestamp}s`);
  console.log(`  Duration: ${duration.toFixed(1)}s`);

  try {
    // Extract audio sample (use smaller power of 2: 2^17 = 131072 samples = ~3s at 44.1kHz)
    const targetSamples = 131072; // Power of 2
    const sampleDuration = targetSamples / 44100;
    const startTime = pageInfo.timestamp + duration / 2 - sampleDuration / 2;
    
    console.log(`  Extracting ${sampleDuration.toFixed(2)}s sample from ${startTime.toFixed(1)}s...`);
    let audioSample = await extractAudioSegment(
      '/app/agent/training-audio/youtube-liturgy.wav',
      startTime,
      sampleDuration
    );
    
    // Trim or pad to exact power of 2
    if (audioSample.length > targetSamples) {
      audioSample = audioSample.slice(0, targetSamples);
    } else if (audioSample.length < targetSamples) {
      const padded = new Float32Array(targetSamples);
      padded.set(audioSample);
      audioSample = padded;
    }
    
    console.log(`  Prepared ${audioSample.length} samples (power of 2)`);

    // Run V3 recognition stages
    console.log(`  Running V3 recognition...`);
    
    // Stage 1: Extract features and do page-level matching
    const features = audioExtractor.extractSignature(audioSample, 44100);
    const pageMatch = pageMatcher.matchAudio(features);
    
    // Stage 2: Word recognition
    const recognizedWords = liveRecognizerV3.recognizeWords(audioSample);
    const wordMatches = liveRecognizerV3.matchWordsToPages(recognizedWords);
    
    // Stage 3: Temporal context
    const temporalScores = liveRecognizerV3.applyTemporalContext(
      pageMatch.topMatches.slice(0, 20),
      testPage // Use actual page as "current" for testing
    );
    
    // Stage 4: Fusion
    const fusedScores = liveRecognizerV3.fuseScores(
      pageMatch.topMatches.slice(0, 20),
      wordMatches,
      temporalScores
    );
    
    const result = fusedScores[0];

    console.log(`  → Detected: Page ${result.page} (${(result.score * 100).toFixed(1)}% confidence)`);
    console.log(`    Page-level: ${(result.pageScore * 100).toFixed(0)}%`);
    console.log(`    Word match: ${(result.wordScore * 100).toFixed(0)}% (${recognizedWords.length} words)`);
    console.log(`    Temporal: ${(result.temporalScore * 100).toFixed(0)}%`);

    // Check accuracy
    const error = Math.abs(result.page - testPage);
    if (error === 0) {
      console.log(`  ✅ CORRECT!`);
      correctCount++;
      within2Count++;
    } else if (error <= 2) {
      console.log(`  ⚠️  Within 2 pages (off by ${error})`);
      within2Count++;
    } else {
      console.log(`  ❌ WRONG (off by ${error} pages)`);
    }

    // Show top 5 candidates
    if (fusedScores.length > 1) {
      console.log(`  Top candidates:`);
      fusedScores.slice(0, 5).forEach((c, i) => {
        const marker = c.page === testPage ? '← TARGET' : '';
        console.log(`    ${i + 1}. Page ${c.page}: ${(c.score * 100).toFixed(1)}% ${marker}`);
      });
    }

  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
  }
}

console.log();
console.log('=== RESULTS ===');
console.log();
console.log(`Tested: ${testPages.length} pages`);
console.log(`Exact matches: ${correctCount}/${testPages.length} (${(correctCount / testPages.length * 100).toFixed(1)}%)`);
console.log(`Within 2 pages: ${within2Count}/${testPages.length} (${(within2Count / testPages.length * 100).toFixed(1)}%)`);
console.log();

if (correctCount / testPages.length >= 0.75) {
  console.log('✅ STRONG BASELINE PERFORMANCE');
  console.log('   V3 works well on new audio without additional training!');
} else if (within2Count / testPages.length >= 0.75) {
  console.log('⚠️  MODERATE PERFORMANCE');
  console.log('   V3 is close but needs tuning or more training.');
} else {
  console.log('❌ NEEDS WORK');
  console.log('   V3 struggles with new audio. Full processing needed.');
}

console.log();
console.log('Next: Run full processing (Option A) to improve accuracy');
