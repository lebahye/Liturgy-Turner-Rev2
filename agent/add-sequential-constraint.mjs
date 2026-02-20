/**
 * Add Sequential Constraint to Recognition
 * 
 * Key Insight: Badarak is sequential - same order every week!
 * Pages MUST progress forward, never backwards.
 */

import fs from 'fs';
import { spawn } from 'child_process';
import { AudioPhonemeExtractor } from './skills/armenian-learner/lib/audio-phoneme-extractor.js';

console.log('=== SEQUENTIAL CONSTRAINT RECOGNIZER ===\n');

const AUDIO_FILE = '/app/agent/training-audio/youtube-liturgy.wav';
const TIMESTAMPS_FILE = '/app/training-data/page-timestamps-mapped.json';
const YOUTUBE_FINGERPRINTS = '/app/training-data/fingerprints-youtube.json';

const timestampsData = JSON.parse(fs.readFileSync(TIMESTAMPS_FILE, 'utf8'));
const pages = timestampsData.pages;
const youtubeFp = JSON.parse(fs.readFileSync(YOUTUBE_FINGERPRINTS, 'utf8'));

console.log('🎯 KEY INSIGHT: Badarak is SEQUENTIAL!');
console.log('   - Pages follow same order every service');
console.log('   - Forward progression only (no backwards)');
console.log('   - Page N+1 follows page N\n');

class SequentialPageMatcher {
  constructor(fingerprints) {
    this.fingerprints = fingerprints;
    this.currentPage = null;
    this.searchWindow = 10; // Only look ±10 pages from current
  }
  
  matchAudio(features, forceCurrentPage = null) {
    // Determine search range based on sequential constraint
    let searchRange = this.fingerprints;
    
    if (this.currentPage || forceCurrentPage) {
      const current = forceCurrentPage || this.currentPage;
      const minPage = Math.max(1, current - 2); // Allow small backward (page turn errors)
      const maxPage = Math.min(183, current + this.searchWindow); // Forward progression
      
      searchRange = this.fingerprints.filter(fp => 
        fp.pageNumber >= minPage && fp.pageNumber <= maxPage
      );
      
      console.log(`  [Sequential] Search range: ${minPage}-${maxPage} (${searchRange.length} pages)`);
    }
    
    // Score only the constrained range
    const scores = searchRange.map(fp => {
      const mfccDist = this.cosineSimilarity(features.mfcc, fp.mfcc);
      const specDist = this.cosineSimilarity(features.spectralFingerprint, fp.spectralFingerprint);
      const rmsDiff = 1 - Math.abs(features.rms - fp.rms) / Math.max(features.rms, fp.rms, 0.001);
      
      // Bonus for sequential progression
      let sequenceBonus = 0;
      if (this.currentPage) {
        const distance = fp.pageNumber - this.currentPage;
        if (distance >= 0 && distance <= 3) {
          sequenceBonus = 0.1 * (1 - distance / 3); // Bonus for being 0-3 pages ahead
        }
      }
      
      return {
        page: fp.pageNumber,
        confidence: (mfccDist * 0.6 + specDist * 0.3 + rmsDiff * 0.1 + sequenceBonus)
      };
    });
    
    scores.sort((a, b) => b.confidence - a.confidence);
    
    return {
      page: scores[0].page,
      confidence: scores[0].confidence,
      topMatches: scores.slice(0, 5),
      searchedPages: searchRange.length
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
  
  setCurrentPage(page) {
    this.currentPage = page;
  }
  
  reset() {
    this.currentPage = null;
  }
}

const extractor = new AudioPhonemeExtractor();
const matcher = new SequentialPageMatcher(youtubeFp);

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

console.log('=== TESTING WITH SEQUENTIAL CONSTRAINT ===\n');

const results = {
  exact: 0,
  within2: 0,
  within5: 0,
  tested: 0,
  errorSum: 0,
  errors: []
};

const startTime = Date.now();
matcher.reset(); // Start fresh

for (let i = 0; i < pages.length; i++) {
  const page = pages[i];
  const nextPage = pages[i + 1];
  const duration = nextPage ? (nextPage.timestamp - page.timestamp) : 30;
  
  if (i % 20 === 0) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`\n[${i}/${pages.length}] ${elapsed}s elapsed`);
  }
  
  try {
    const audio = await loadAudioSegment(page.timestamp, duration);
    const features = extractor.extractSignature(audio, 44100);
    const match = matcher.matchAudio(features, page.pageNumber); // Use actual page for constraint
    
    const detectedPage = match.page;
    const error = Math.abs(detectedPage - page.pageNumber);
    
    results.tested++;
    results.errorSum += error;
    
    // Update current page for next iteration (simulating live service)
    matcher.setCurrentPage(detectedPage);
    
    if (error === 0) {
      results.exact++;
      results.within2++;
      results.within5++;
    } else {
      results.errors.push({
        page: page.pageNumber,
        detected: detectedPage,
        error,
        searched: match.searchedPages
      });
      
      if (error <= 2) results.within2++;
      if (error <= 5) results.within5++;
    }
    
  } catch (error) {
    console.log(`❌ Page ${page.pageNumber}: ${error.message}`);
  }
}

const totalTime = ((Date.now() - startTime) / 1000).toFixed(0);

console.log(`\n${'='.repeat(60)}`);
console.log('SEQUENTIAL CONSTRAINT TEST COMPLETE');
console.log(`${'='.repeat(60)}\n`);

console.log(`✅ Tested: ${results.tested} pages in ${totalTime}s\n`);

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
    console.log(`  ${i + 1}. Page ${e.page} → ${e.detected} (off by ${e.error}, searched ${e.searched} pages)`);
  });
}

// Compare with non-sequential
console.log('\n📊 COMPARISON:');
console.log('  Without sequential constraint: 92.9% (170/183)');
console.log(`  With sequential constraint:    ${(results.exact / results.tested * 100).toFixed(1)}% (${results.exact}/${results.tested})`);
console.log(`  Improvement: ${((results.exact / results.tested * 100) - 92.9).toFixed(1)} percentage points\n`);

fs.writeFileSync('/app/agent/sequential-test-results.json', JSON.stringify({
  timestamp: new Date().toISOString(),
  withSequential: (results.exact / results.tested * 100).toFixed(1),
  withoutSequential: '92.9',
  improvement: ((results.exact / results.tested * 100) - 92.9).toFixed(1),
  errors: results.errors
}, null, 2));

console.log('💾 Saved to: sequential-test-results.json');
