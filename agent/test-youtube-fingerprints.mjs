/**
 * Test Accuracy with NEW YouTube Fingerprints
 * Now training audio = testing audio!
 */

import fs from 'fs';
import { spawn } from 'child_process';
import { AudioPhonemeExtractor } from './skills/armenian-learner/lib/audio-phoneme-extractor.js';
import { PatternDatabase } from './skills/armenian-learner/lib/pattern-database.js';
import { LiveRecognizerV3Hybrid } from './skills/armenian-learner/lib/live-recognizer-v3-hybrid.js';

console.log('=== TESTING WITH YOUTUBE FINGERPRINTS ===\n');

const AUDIO_FILE = '/app/agent/training-audio/youtube-liturgy.wav';
const TIMESTAMPS_FILE = '/app/training-data/page-timestamps-mapped.json';
const YOUTUBE_FINGERPRINTS = '/app/training-data/fingerprints-youtube.json';

// Load data
const timestampsData = JSON.parse(fs.readFileSync(TIMESTAMPS_FILE, 'utf8'));
const pages = timestampsData.pages;
const youtubeFp = JSON.parse(fs.readFileSync(YOUTUBE_FINGERPRINTS, 'utf8'));

console.log(`📚 YouTube fingerprints: ${youtubeFp.length} pages`);

// Create PageMatcher with YouTube fingerprints
class PageMatcherYouTube {
  constructor(fingerprints) {
    this.fingerprints = fingerprints;
    this.sensitivity = 0.5;
  }
  
  matchAudio(features) {
    const scores = this.fingerprints.map(fp => {
      const mfccDist = this.cosineSimilarity(features.mfcc, fp.mfcc);
      const specDist = this.cosineSimilarity(features.spectralFingerprint, fp.spectralFingerprint);
      const rmsDiff = 1 - Math.abs(features.rms - fp.rms) / Math.max(features.rms, fp.rms, 0.001);
      
      return {
        page: fp.pageNumber,
        confidence: (mfccDist * 0.6 + specDist * 0.3 + rmsDiff * 0.1)
      };
    });
    
    scores.sort((a, b) => b.confidence - a.confidence);
    
    return {
      page: scores[0].page,
      confidence: scores[0].confidence,
      topMatches: scores.slice(0, 20)
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
  
  reset() {}
}

// Initialize with YouTube fingerprints
const extractor = new AudioPhonemeExtractor();
const patternDb = new PatternDatabase('./skills/armenian-learner/data');
const pageMatcher = new PageMatcherYouTube(youtubeFp);
const v3 = new LiveRecognizerV3Hybrid(extractor, pageMatcher, patternDb);

console.log('✅ Using YouTube-based page matcher\n');

// Test pages
const TEST_PAGES = [1, 5, 7, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180];

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

console.log('=== TESTING ACCURACY ===\n');

const results = {
  exact: 0,
  within2: 0,
  within5: 0,
  tested: 0,
  errorSum: 0
};

for (const testPage of TEST_PAGES) {
  const pageInfo = pages.find(p => p.pageNumber === testPage);
  if (!pageInfo) continue;

  const nextPage = pages.find(p => p.pageNumber === testPage + 1);
  const duration = nextPage ? (nextPage.timestamp - pageInfo.timestamp) : 30;

  try {
    const audio = await loadAudioSegment(pageInfo.timestamp, duration);
    const features = extractor.extractSignature(audio, 44100);
    const pageMatch = pageMatcher.matchAudio(features);
    
    const detectedPage = pageMatch.page;
    const confidence = pageMatch.confidence;
    const error = Math.abs(detectedPage - testPage);
    
    results.tested++;
    results.errorSum += error;
    
    if (error === 0) {
      results.exact++;
      results.within2++;
      results.within5++;
      console.log(`✅ Page ${testPage}: CORRECT! (${(confidence * 100).toFixed(0)}%)`);
    } else if (error <= 2) {
      results.within2++;
      results.within5++;
      console.log(`⚠️  Page ${testPage}: Off by ${error} → ${detectedPage} (${(confidence * 100).toFixed(0)}%)`);
    } else if (error <= 5) {
      results.within5++;
      console.log(`❌ Page ${testPage}: Off by ${error} → ${detectedPage}`);
    } else {
      console.log(`❌ Page ${testPage}: WAY OFF by ${error} → ${detectedPage}`);
    }
  } catch (error) {
    console.log(`❌ Page ${testPage}: Error - ${error.message}`);
  }
}

console.log('\n=== RESULTS ===\n');
console.log(`Tested: ${results.tested} pages`);
console.log(`Exact matches: ${results.exact}/${results.tested} (${(results.exact / results.tested * 100).toFixed(1)}%)`);
console.log(`Within 2 pages: ${results.within2}/${results.tested} (${(results.within2 / results.tested * 100).toFixed(1)}%)`);
console.log(`Within 5 pages: ${results.within5}/${results.tested} (${(results.within5 / results.tested * 100).toFixed(1)}%)`);
console.log(`Average error: ${(results.errorSum / results.tested).toFixed(2)} pages\n`);

// Save results
fs.writeFileSync('/app/agent/youtube-test-results.json', JSON.stringify({
  timestamp: new Date().toISOString(),
  results,
  exactAccuracy: (results.exact / results.tested * 100).toFixed(1)
}, null, 2));

console.log('💾 Results saved to youtube-test-results.json');
