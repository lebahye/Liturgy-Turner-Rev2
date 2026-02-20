/**
 * Train Armenian Learner from Extracted Segments
 * Builds fingerprints and learns words from YouTube audio
 */

import fs from 'fs';
import { spawn } from 'child_process';
import { AudioPhonemeExtractor } from './skills/armenian-learner/lib/audio-phoneme-extractor.js';
import { PatternDatabase } from './skills/armenian-learner/lib/pattern-database.js';

console.log('=== TRAINING FROM YOUTUBE SEGMENTS ===');
console.log();

const SEGMENTS_DIR = '/app/agent/training-audio-processed';
const OUTPUT_FILE = `${SEGMENTS_DIR}/youtube-fingerprints.json`;
const NEW_PATTERNS_FILE = `${SEGMENTS_DIR}/youtube-patterns.json`;

// Get all segment files
const files = fs.readdirSync(SEGMENTS_DIR)
  .filter(f => f.endsWith('.wav'))
  .sort();

console.log(`📁 Found ${files.length} audio segments`);
console.log();

// Initialize components
const extractor = new AudioPhonemeExtractor();
const patternDb = new PatternDatabase('./skills/armenian-learner/data');

console.log(`🧠 Loaded existing patterns: ${patternDb.patterns.length} words`);
console.log();

// Helper to load audio file
async function loadAudioFile(filePath) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', filePath,
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
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
  });
}

// Process each segment
const fingerprints = [];
let newWordsLearned = 0;

for (const file of files) {
  const filePath = `${SEGMENTS_DIR}/${file}`;
  const pageNum = parseInt(file.match(/page-(\d+)/)[1]);
  
  process.stdout.write(`📖 Page ${pageNum.toString().padStart(3)}... `);
  
  try {
    // Load audio
    const audio = await loadAudioFile(filePath);
    
    if (audio.length < 44100) {
      console.log(`⚠️  Too short (${(audio.length / 44100).toFixed(2)}s)`);
      continue;
    }
    
    // Extract fingerprint
    const features = extractor.extractSignature(audio, 44100);
    
    if (!features || !features.mfcc || features.mfcc.length === 0) {
      console.log(`⚠️  Feature extraction failed`);
      continue;
    }
    
    // Save fingerprint
    fingerprints.push({
      pageNumber: pageNum,
      duration: features.duration,
      mfcc: features.mfcc,
      spectralCentroid: features.spectralCentroid,
      spectralRolloff: features.spectralRolloff,
      rms: features.rms,
      zcr: features.zcr,
      spectralFlatness: features.spectralFlatness,
      spectralKurtosis: features.spectralKurtosis,
      spectralFingerprint: features.spectralFingerprint
    });
    
    // Try to learn words from this segment (basic word detection)
    // For now just extract features - full word learning needs text alignment
    const words = features.phonemes ? features.phonemes.length : 0;
    
    console.log(`✅ ${features.duration.toFixed(1)}s, ${words} phonemes`);
    
  } catch (error) {
    console.log(`❌ ${error.message}`);
  }
}

console.log();
console.log('=== FINGERPRINTING COMPLETE ===');
console.log();
console.log(`✅ Created ${fingerprints.length} fingerprints`);
console.log();

// Save fingerprints
if (fingerprints.length > 0) {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(fingerprints, null, 2));
  console.log(`💾 Saved to: ${OUTPUT_FILE}`);
  console.log();
  
  // Compare with original fingerprints
  const originalFingerprints = JSON.parse(fs.readFileSync('/app/training-data/fingerprints.json', 'utf8'));
  console.log('📊 Comparison with Original Training:');
  console.log(`  Original: ${originalFingerprints.length} pages`);
  console.log(`  YouTube:  ${fingerprints.length} pages (sampled)`);
  console.log();
  
  // Check overlap
  const commonPages = fingerprints.filter(f => 
    originalFingerprints.some(o => o.pageNumber === f.pageNumber)
  );
  console.log(`  Common pages: ${commonPages.length}`);
  console.log();
  
  // Sample comparison
  if (commonPages.length > 0) {
    const sample = commonPages[0];
    const original = originalFingerprints.find(o => o.pageNumber === sample.pageNumber);
    
    console.log(`  Sample (Page ${sample.pageNumber}):`);
    console.log(`    YouTube duration: ${sample.duration.toFixed(2)}s`);
    console.log(`    Original duration: ${original.duration.toFixed(2)}s`);
    console.log(`    RMS YouTube: ${sample.rms.toFixed(4)}`);
    console.log(`    RMS Original: ${original.rms.toFixed(4)}`);
  }
  
  console.log();
  console.log('🎯 Next: Test V3 hybrid system with both fingerprint sets');
  console.log(`   node compare-fingerprints.mjs`);
} else {
  console.log('❌ No fingerprints created');
}
