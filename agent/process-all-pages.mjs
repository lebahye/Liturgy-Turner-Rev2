/**
 * Process ALL 183 Pages from YouTube Audio
 * Build complete fingerprint database
 */

import fs from 'fs';
import { spawn } from 'child_process';
import { AudioPhonemeExtractor } from './skills/armenian-learner/lib/audio-phoneme-extractor.js';

console.log('=== PROCESSING ALL 183 PAGES FROM YOUTUBE AUDIO ===\n');

const AUDIO_FILE = '/app/agent/training-audio/youtube-liturgy.wav';
const TIMESTAMPS_FILE = '/app/training-data/page-timestamps-mapped.json';
const OUTPUT_FILE = '/app/training-data/fingerprints-youtube.json';

// Load timestamps
const timestampsData = JSON.parse(fs.readFileSync(TIMESTAMPS_FILE, 'utf8'));
const pages = timestampsData.pages;

console.log(`📖 Processing ${pages.length} pages...`);
console.log(`🎵 Source: ${AUDIO_FILE}`);
console.log(`💾 Output: ${OUTPUT_FILE}\n`);

const extractor = new AudioPhonemeExtractor();

// Helper to load audio segment
async function loadAudioSegment(startTime, duration) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', AUDIO_FILE,
      '-ss', startTime.toString(),
      '-t', Math.min(duration, 120).toString(), // Cap at 2 minutes per page
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

// Process all pages
const fingerprints = [];
let processed = 0;
let failed = 0;
const startTime = Date.now();

for (let i = 0; i < pages.length; i++) {
  const page = pages[i];
  const nextPage = pages[i + 1];
  const duration = nextPage ? (nextPage.timestamp - page.timestamp) : 30;
  
  if (duration <= 0 || duration > 600) {
    console.log(`⚠️  Page ${page.pageNumber}: Invalid duration ${duration}s`);
    failed++;
    continue;
  }
  
  try {
    // Progress indicator
    if (i % 10 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const pagesPerSec = i / (elapsed || 1);
      const remaining = ((pages.length - i) / pagesPerSec).toFixed(0);
      console.log(`\n[${i}/${pages.length}] ${elapsed}s elapsed, ~${remaining}s remaining`);
    }
    
    process.stdout.write(`  Page ${page.pageNumber.toString().padStart(3)}: `);
    
    // Load audio
    const audio = await loadAudioSegment(page.timestamp, duration);
    
    if (audio.length < 44100) {
      console.log(`⚠️  Too short (${(audio.length / 44100).toFixed(1)}s)`);
      failed++;
      continue;
    }
    
    // Extract features
    const features = extractor.extractSignature(audio, 44100);
    
    if (!features || !features.mfcc || features.mfcc.length === 0) {
      console.log(`❌ Feature extraction failed`);
      failed++;
      continue;
    }
    
    // Save fingerprint
    fingerprints.push({
      pageNumber: page.pageNumber,
      duration: features.duration,
      timestamp: page.timestamp,
      mfcc: features.mfcc,
      spectralCentroid: features.spectralCentroid,
      spectralRolloff: features.spectralRolloff,
      rms: features.rms,
      zcr: features.zcr,
      spectralFlatness: features.spectralFlatness,
      spectralKurtosis: features.spectralKurtosis,
      spectralFingerprint: features.spectralFingerprint,
      source: 'youtube-83min'
    });
    
    processed++;
    console.log(`✅ ${features.duration.toFixed(1)}s`);
    
  } catch (error) {
    console.log(`❌ ${error.message}`);
    failed++;
  }
}

const totalTime = ((Date.now() - startTime) / 1000).toFixed(0);

console.log(`\n${'='.repeat(60)}`);
console.log('PROCESSING COMPLETE');
console.log(`${'='.repeat(60)}\n`);

console.log(`✅ Processed: ${processed}/${pages.length}`);
console.log(`❌ Failed: ${failed}/${pages.length}`);
console.log(`⏱️  Total time: ${totalTime}s`);
console.log(`📊 Rate: ${(processed / totalTime).toFixed(1)} pages/sec\n`);

// Save fingerprints
if (fingerprints.length > 0) {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(fingerprints, null, 2));
  console.log(`💾 Saved ${fingerprints.length} fingerprints to:`);
  console.log(`   ${OUTPUT_FILE}\n`);
  
  // Stats
  const durations = fingerprints.map(f => f.duration);
  const avgDuration = (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1);
  const minDuration = Math.min(...durations).toFixed(1);
  const maxDuration = Math.max(...durations).toFixed(1);
  
  console.log('📊 Fingerprint Stats:');
  console.log(`   Duration: ${minDuration}s - ${maxDuration}s (avg ${avgDuration}s)`);
  console.log(`   File size: ${(JSON.stringify(fingerprints).length / 1024).toFixed(0)}KB\n`);
  
  console.log('✅ Ready for testing!');
  console.log('   Next: node iterative-training.mjs (with new fingerprints)');
} else {
  console.log('❌ No fingerprints created!');
}
