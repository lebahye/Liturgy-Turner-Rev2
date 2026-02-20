#!/usr/bin/env node

/**
 * Full Validation with Temporal Context
 * Test all 183 pages with sequential page tracking
 */

import fs from 'fs';
import { spawn } from 'child_process';
import { AudioPhonemeExtractor } from './skills/armenian-learner/lib/audio-phoneme-extractor.js';

console.log('=== FULL VALIDATION: TEMPORAL CONTEXT ===\n');

const AUDIO_FILE = '/app/agent/training-audio/youtube-liturgy.wav';
const TIMESTAMPS_FILE = '/app/training-data/page-timestamps-mapped.json';
const YOUTUBE_FINGERPRINTS = '/app/training-data/fingerprints-youtube.json';
const TRANSITIONS_FILE = '/app/training-data/page-transitions.json';

// Load data
const timestampsData = JSON.parse(fs.readFileSync(TIMESTAMPS_FILE, 'utf8'));
const pages = timestampsData.pages;
const youtubeFp = JSON.parse(fs.readFileSync(YOUTUBE_FINGERPRINTS, 'utf8'));
const transitions = JSON.parse(fs.readFileSync(TRANSITIONS_FILE, 'utf8'));

console.log(`Testing ${pages.length} pages with temporal context...\n`);

// PageMatcher with Duration + Temporal Context
class PageMatcherTemporal {
  constructor(fingerprints, transitionMatrix) {
    this.fingerprints = fingerprints;
    this.transitions = transitionMatrix.transitions;
    this.previousPage = null;
  }
  
  applyDurationPenalty(baseScore, candidateDuration, expectedDuration) {
    if (!candidateDuration || !expectedDuration) return baseScore;
    const durationRatio = Math.abs(candidateDuration - expectedDuration) / Math.max(candidateDuration, expectedDuration);
    if (durationRatio > 0.5) return baseScore * 0.3;
    else if (durationRatio > 0.3) return baseScore * 0.6;
    else if (durationRatio > 0.15) return baseScore * 0.8;
    else if (durationRatio < 0.05) return baseScore * 1.1;
    return baseScore;
  }
  
  matchAudio(features, expectedDuration) {
    const scores = this.fingerprints.map(fp => {
      // Audio similarity
      const mfccDist = this.cosineSimilarity(features.mfcc, fp.mfcc);
      const specDist = this.cosineSimilarity(features.spectralFingerprint, fp.spectralFingerprint);
      const rmsDiff = 1 - Math.abs(features.rms - fp.rms) / Math.max(features.rms, fp.rms, 0.001);
      const audioScore = (mfccDist * 0.6 + specDist * 0.3 + rmsDiff * 0.1);
      
      // Duration penalty
      const durationScore = this.applyDurationPenalty(audioScore, fp.duration, expectedDuration);
      
      // Temporal boost
      let temporalBoost = 1.0;
      if (this.previousPage && this.transitions[this.previousPage]) {
        const transProb = this.transitions[this.previousPage][fp.pageNumber] || 0.00001;
        // Strong boost for sequential pages (95% → 10x multiplier)
        temporalBoost = 1 + (transProb * 10);
      }
      
      const finalScore = durationScore * temporalBoost;
      
      return {
        page: fp.pageNumber,
        audioScore,
        durationScore,
        temporalBoost,
        confidence: finalScore
      };
    });
    
    scores.sort((a, b) => b.confidence - a.confidence);
    
    const winner = scores[0];
    this.previousPage = winner.page; // Update for next iteration
    
    return {
      page: winner.page,
      confidence: winner.confidence,
      topMatches: scores.slice(0, 5)
    };
  }
  
  reset() {
    this.previousPage = null;
  }
  
  cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB) + 0.0001);
  }
}

const extractor = new AudioPhonemeExtractor();
const pageMatcher = new PageMatcherTemporal(youtubeFp, transitions);

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

const results = {
  exact: 0,
  within2: 0,
  within5: 0,
  tested: 0,
  errorSum: 0,
  errors: [],
  confusionPairs: {}
};

const startTime = Date.now();

// Reset matcher before starting
pageMatcher.reset();

for (let i = 0; i < pages.length; i++) {
  const page = pages[i];
  const nextPage = pages[i + 1];
  const duration = nextPage ? (nextPage.timestamp - page.timestamp) : 30;
  
  if (i % 20 === 0) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const rate = i / (elapsed || 1);
    const remaining = ((pages.length - i) / rate).toFixed(0);
    console.log(`[${i}/${pages.length}] ${elapsed}s elapsed, ~${remaining}s remaining`);
  }
  
  try {
    const audio = await loadAudioSegment(page.timestamp, duration);
    const features = extractor.extractSignature(audio, 44100);
    const match = pageMatcher.matchAudio(features, duration);
    
    const detectedPage = match.page;
    const error = Math.abs(detectedPage - page.pageNumber);
    
    results.tested++;
    results.errorSum += error;
    
    if (error === 0) {
      results.exact++;
      results.within2++;
      results.within5++;
    } else {
      results.errors.push({
        page: page.pageNumber,
        detected: detectedPage,
        error,
        confidence: match.confidence,
        top5: match.topMatches.map(m => m.page)
      });
      
      const pair = `${page.pageNumber}→${detectedPage}`;
      results.confusionPairs[pair] = (results.confusionPairs[pair] || 0) + 1;
      
      if (error <= 2) results.within2++;
      if (error <= 5) results.within5++;
    }
    
  } catch (error) {
    console.error(`Error on page ${page.pageNumber}:`, error.message);
  }
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

console.log('\n============================================================');
console.log('FULL VALIDATION COMPLETE (TEMPORAL CONTEXT)');
console.log('============================================================\n');

console.log(`✅ Tested: ${results.tested} pages in ${elapsed}s`);
console.log(`📊 Rate: ${(results.tested / elapsed).toFixed(2)} pages/sec\n`);

const exactPct = (results.exact / results.tested * 100).toFixed(1);
const within2Pct = (results.within2 / results.tested * 100).toFixed(1);
const within5Pct = (results.within5 / results.tested * 100).toFixed(1);
const avgErr = (results.errorSum / results.tested).toFixed(2);

console.log('📈 Accuracy:');
console.log(`  Exact: ${results.exact}/${results.tested} (${exactPct}%)`);
console.log(`  ±2 pages: ${results.within2}/${results.tested} (${within2Pct}%)`);
console.log(`  ±5 pages: ${results.within5}/${results.tested} (${within5Pct}%)`);
console.log(`  Avg error: ${avgErr} pages\n`);

console.log(`❌ Errors: ${results.errors.length} pages\n`);

if (results.errors.length > 0 && results.errors.length <= 20) {
  console.log('Top Worst Errors:');
  const sorted = results.errors.sort((a, b) => b.error - a.error).slice(0, 10);
  sorted.forEach((e, i) => {
    console.log(`  ${i + 1}. Page ${e.page} → ${e.detected} (off by ${e.error})`);
  });
}

if (Object.keys(results.confusionPairs).length > 0) {
  console.log('\nMost Common Confusions:');
  const sorted = Object.entries(results.confusionPairs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  sorted.forEach(([pair, count]) => {
    console.log(`  ${pair}: ${count}x`);
  });
}

// Save results
const output = {
  timestamp: new Date().toISOString(),
  totalPages: results.tested,
  exactAccuracy: exactPct,
  within2Accuracy: within2Pct,
  within5Accuracy: within5Pct,
  avgError: avgErr,
  errors: results.errors,
  confusionPairs: results.confusionPairs
};

fs.writeFileSync('./full-validation-temporal-results.json', JSON.stringify(output, null, 2));
console.log('\n💾 Saved to: full-validation-temporal-results.json');
