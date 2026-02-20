/**
 * Full Validation - Test ALL 183 Pages
 * Identify error patterns and confusion matrix
 */

import fs from 'fs';
import { spawn } from 'child_process';
import { AudioPhonemeExtractor } from './skills/armenian-learner/lib/audio-phoneme-extractor.js';

console.log('=== FULL VALIDATION: ALL 183 PAGES (DURATION-AWARE) ===\n');

const AUDIO_FILE = '/app/agent/training-audio/youtube-liturgy.wav';
const TIMESTAMPS_FILE = '/app/training-data/page-timestamps-mapped.json';
const YOUTUBE_FINGERPRINTS = '/app/training-data/fingerprints-youtube.json';

// Load data
const timestampsData = JSON.parse(fs.readFileSync(TIMESTAMPS_FILE, 'utf8'));
const pages = timestampsData.pages;
const youtubeFp = JSON.parse(fs.readFileSync(YOUTUBE_FINGERPRINTS, 'utf8'));

console.log(`Testing ${pages.length} pages...\n`);

// PageMatcher with YouTube fingerprints + Duration Awareness
class PageMatcherYouTube {
  constructor(fingerprints) {
    this.fingerprints = fingerprints;
  }
  
  applyDurationPenalty(baseScore, candidateDuration, expectedDuration) {
    if (!candidateDuration || !expectedDuration) {
      return baseScore;
    }
    
    const durationRatio = Math.abs(candidateDuration - expectedDuration) / Math.max(candidateDuration, expectedDuration);
    
    if (durationRatio > 0.5) {
      return baseScore * 0.3; // 70% penalty
    } else if (durationRatio > 0.3) {
      return baseScore * 0.6; // 40% penalty
    } else if (durationRatio > 0.15) {
      return baseScore * 0.8; // 20% penalty
    } else if (durationRatio < 0.05) {
      return baseScore * 1.1; // 10% bonus
    }
    
    return baseScore;
  }
  
  matchAudio(features, expectedDuration) {
    const scores = this.fingerprints.map(fp => {
      const mfccDist = this.cosineSimilarity(features.mfcc, fp.mfcc);
      const specDist = this.cosineSimilarity(features.spectralFingerprint, fp.spectralFingerprint);
      const rmsDiff = 1 - Math.abs(features.rms - fp.rms) / Math.max(features.rms, fp.rms, 0.001);
      
      const audioScore = (mfccDist * 0.6 + specDist * 0.3 + rmsDiff * 0.1);
      const finalScore = this.applyDurationPenalty(audioScore, fp.duration, expectedDuration);
      
      return {
        page: fp.pageNumber,
        confidence: finalScore
      };
    });
    
    scores.sort((a, b) => b.confidence - a.confidence);
    
    return {
      page: scores[0].page,
      confidence: scores[0].confidence,
      topMatches: scores.slice(0, 5)
    };
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
const pageMatcher = new PageMatcherYouTube(youtubeFp);

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
    console.log(`❌ Page ${page.pageNumber}: ${error.message}`);
  }
}

const totalTime = ((Date.now() - startTime) / 1000).toFixed(0);

console.log(`\n${'='.repeat(60)}`);
console.log('FULL VALIDATION COMPLETE');
console.log(`${'='.repeat(60)}\n`);

console.log(`✅ Tested: ${results.tested} pages in ${totalTime}s`);
console.log(`📊 Rate: ${(results.tested / totalTime).toFixed(2)} pages/sec\n`);

console.log('📈 Accuracy:');
console.log(`  Exact: ${results.exact}/${results.tested} (${(results.exact / results.tested * 100).toFixed(1)}%)`);
console.log(`  ±2 pages: ${results.within2}/${results.tested} (${(results.within2 / results.tested * 100).toFixed(1)}%)`);
console.log(`  ±5 pages: ${results.within5}/${results.tested} (${(results.within5 / results.tested * 100).toFixed(1)}%)`);
console.log(`  Avg error: ${(results.errorSum / results.tested).toFixed(2)} pages\n`);

console.log(`❌ Errors: ${results.errors.length} pages`);

if (results.errors.length > 0) {
  console.log('\nTop 10 Worst Errors:');
  results.errors.sort((a, b) => b.error - a.error);
  results.errors.slice(0, 10).forEach((e, i) => {
    console.log(`  ${i + 1}. Page ${e.page} → ${e.detected} (off by ${e.error})`);
  });
  
  console.log('\nMost Common Confusions:');
  const sortedPairs = Object.entries(results.confusionPairs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  sortedPairs.forEach(([pair, count]) => {
    console.log(`  ${pair}: ${count}x`);
  });
}

// Save results
fs.writeFileSync('/app/agent/full-validation-results.json', JSON.stringify({
  timestamp: new Date().toISOString(),
  totalPages: results.tested,
  exactAccuracy: (results.exact / results.tested * 100).toFixed(1),
  within2Accuracy: (results.within2 / results.tested * 100).toFixed(1),
  within5Accuracy: (results.within5 / results.tested * 100).toFixed(1),
  avgError: (results.errorSum / results.tested).toFixed(2),
  errors: results.errors,
  confusionPairs: results.confusionPairs
}, null, 2));

console.log('\n💾 Saved to: full-validation-results.json');
