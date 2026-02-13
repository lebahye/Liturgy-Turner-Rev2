#!/usr/bin/env node
/**
 * Manual Training Mode
 * User plays audio and manually advances pages
 * System learns the actual timing and builds accurate fingerprints
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('📖 Manual Training Mode');
console.log('=======================\n');
console.log('This mode lets you manually page-turn while playing audio');
console.log('The system will learn the actual timing of each page turn.\n');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let currentPage = 1;
let startTime = null;
let pageTimestamps = [];

console.log('Instructions:');
console.log('1. Start playing the audio on your phone/computer');
console.log('2. Press ENTER to mark when you START listening (page 1)');
console.log('3. Press ENTER each time you turn to the NEXT page');
console.log('4. Press Q + ENTER when done\n');
console.log('Press ENTER when ready to start...');

function waitForInput() {
  return new Promise((resolve) => {
    rl.question('', (answer) => {
      resolve(answer.trim().toLowerCase());
    });
  });
}

(async () => {
  // Wait for start
  await waitForInput();
  startTime = Date.now();
  console.log('\n✅ Started! Press ENTER for each page turn...\n');
  console.log(`Page ${currentPage} - 0:00`);
  
  pageTimestamps.push({
    pageNumber: currentPage,
    timestamp: 0,
    confidence: 1.0,
    source: 'manual'
  });
  
  while (true) {
    const input = await waitForInput();
    
    if (input === 'q') {
      break;
    }
    
    // Record page turn
    const elapsedMs = Date.now() - startTime;
    const elapsedSec = elapsedMs / 1000;
    const minutes = Math.floor(elapsedSec / 60);
    const seconds = Math.floor(elapsedSec % 60);
    
    currentPage++;
    
    pageTimestamps.push({
      pageNumber: currentPage,
      timestamp: elapsedSec,
      confidence: 1.0,
      source: 'manual'
    });
    
    console.log(`Page ${currentPage} - ${minutes}:${seconds.toString().padStart(2, '0')}`);
    
    if (currentPage >= 183) {
      console.log('\n✅ Reached final page!');
      break;
    }
  }
  
  rl.close();
  
  console.log('\n\n📊 Training Session Summary');
  console.log('===========================');
  console.log(`Pages marked: ${pageTimestamps.length}`);
  console.log(`Duration: ${Math.floor((Date.now() - startTime) / 60000)} minutes\n`);
  
  if (pageTimestamps.length > 1) {
    // Calculate average page duration
    const durations = [];
    for (let i = 1; i < pageTimestamps.length; i++) {
      const duration = pageTimestamps[i].timestamp - pageTimestamps[i - 1].timestamp;
      durations.push(duration);
    }
    
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    
    console.log('Page Duration Statistics:');
    console.log(`  Average: ${avgDuration.toFixed(1)}s`);
    console.log(`  Minimum: ${minDuration.toFixed(1)}s`);
    console.log(`  Maximum: ${maxDuration.toFixed(1)}s\n`);
    
    // Show distribution
    console.log('First 10 pages:');
    pageTimestamps.slice(0, 10).forEach(pt => {
      const time = `${Math.floor(pt.timestamp / 60)}:${Math.floor(pt.timestamp % 60).toString().padStart(2, '0')}`;
      console.log(`  Page ${pt.pageNumber}: ${time}`);
    });
    
    // Save timestamps
    const outputPath = path.join(__dirname, 'training-data/manual-page-timestamps.json');
    fs.writeFileSync(outputPath, JSON.stringify({
      recordedAt: new Date().toISOString(),
      totalPages: pageTimestamps.length,
      durationSec: pageTimestamps[pageTimestamps.length - 1].timestamp,
      timestamps: pageTimestamps
    }, null, 2));
    
    console.log(`\n✅ Saved to training-data/manual-page-timestamps.json`);
    
    console.log('\n📌 Next Steps:');
    console.log('1. Re-extract fingerprints using these accurate timestamps');
    console.log('2. Run: node rebuild-fingerprints-from-manual.mjs');
    console.log('3. Test the improved tracker');
  } else {
    console.log('⚠️ Not enough data collected');
  }
})();
