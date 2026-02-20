/**
 * Full Processing Pipeline for YouTube Audio
 * Extracts fingerprints and learns new patterns
 */

import fs from 'fs';
import { spawn } from 'child_process';

console.log('=== FULL AUDIO PROCESSING PIPELINE ===');
console.log();

const AUDIO_FILE = '/app/agent/training-audio/youtube-liturgy.wav';
const TIMESTAMPS_FILE = '/app/training-data/page-timestamps-mapped.json';
const OUTPUT_DIR = '/app/agent/training-audio-processed';

// Create output directory
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log('📁 Input:  ', AUDIO_FILE);
console.log('📄 Timestamps:', TIMESTAMPS_FILE);
console.log('💾 Output: ', OUTPUT_DIR);
console.log();

// Load timestamps
const timestampsData = JSON.parse(fs.readFileSync(TIMESTAMPS_FILE, 'utf8'));
const pages = timestampsData.pages;

console.log(`📖 Processing ${pages.length} pages...`);
console.log();

// Helper to extract audio segment
async function extractSegment(startTime, duration, outputPath) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', AUDIO_FILE,
      '-ss', startTime.toString(),
      '-t', duration.toString(),
      '-ac', '1', // mono
      '-ar', '44100', // 44.1kHz
      '-y', // overwrite
      outputPath
    ], { stdio: 'ignore' });

    ffmpeg.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
}

// Process pages in batches
const SAMPLE_PAGES = [1, 5, 10, 20, 30, 50, 75, 100, 125, 150, 175, 183]; // Sample pages for testing
console.log(`🎯 Sampling ${SAMPLE_PAGES.length} pages for initial processing`);
console.log();

let processed = 0;
let failed = 0;

for (const pageNum of SAMPLE_PAGES) {
  const pageInfo = pages.find(p => p.pageNumber === pageNum);
  if (!pageInfo) {
    console.log(`⚠️  Page ${pageNum}: No timestamp info`);
    failed++;
    continue;
  }

  const nextPage = pages.find(p => p.pageNumber === pageNum + 1);
  const duration = nextPage ? (nextPage.timestamp - pageInfo.timestamp) : 30;

  const outputPath = `${OUTPUT_DIR}/page-${pageNum.toString().padStart(3, '0')}.wav`;

  try {
    process.stdout.write(`📖 Page ${pageNum.toString().padStart(3)} (${pageInfo.timestamp}s, ${duration.toFixed(1)}s)... `);
    
    await extractSegment(pageInfo.timestamp, duration, outputPath);
    
    // Verify file exists and has reasonable size
    const stats = fs.statSync(outputPath);
    if (stats.size > 1000) {
      console.log(`✅ ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
      processed++;
    } else {
      console.log(`⚠️  Too small (${stats.size}B)`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ ${error.message}`);
    failed++;
  }
}

console.log();
console.log('=== EXTRACTION COMPLETE ===');
console.log();
console.log(`✅ Processed: ${processed}/${SAMPLE_PAGES.length}`);
console.log(`❌ Failed: ${failed}/${SAMPLE_PAGES.length}`);
console.log();

if (processed > 0) {
  console.log('📦 Next Steps:');
  console.log('  1. Run armenian-learner training on extracted segments');
  console.log('  2. Build fingerprints for all pages');
  console.log('  3. Test V3 hybrid system on new fingerprints');
  console.log('  4. Compare accuracy with original training data');
  console.log();
  console.log(`   cd /app/agent && node train-from-segments.mjs`);
} else {
  console.log('❌ No segments extracted - check audio file and timestamps');
}
