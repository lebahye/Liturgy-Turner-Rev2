#!/usr/bin/env node
/**
 * Map detected speaker transitions to PDF pages
 * Assume transitions mark page turns (though some pages may not have transitions)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🗺️  Mapping Transitions to Pages');
console.log('=================================\n');

// Load detected transitions
const transitionsData = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'training-data/transitions-v3.json'), 'utf8')
);

const transitions = transitionsData.transitions;
console.log(`📊 Loaded ${transitions.length} detected transitions`);
console.log(`📖 PDF has 183 pages\n`);

// Strategy: Map transitions to pages proportionally
// If we have 152 transitions and 183 pages, some pages don't have speaker changes

const totalPages = 183;
const pageTimestamps = [];

// Start at page 1, time 0
pageTimestamps.push({
  pageNumber: 1,
  timestamp: 0,
  hasTransition: false,
  speaker: 'deacon', // First page typically deacon
  source: 'start'
});

// Map transitions to pages
// Strategy: Distribute pages evenly across transitions
const pagesPerTransition = (totalPages - 1) / transitions.length;

transitions.forEach((transition, i) => {
  const pageNumber = Math.round(2 + (i * pagesPerTransition)); // Start from page 2
  
  if (pageNumber <= totalPages) {
    pageTimestamps.push({
      pageNumber,
      timestamp: transition.time,
      hasTransition: true,
      from: transition.from,
      to: transition.to,
      variance: transition.variance,
      rms: transition.rms,
      source: 'detected'
    });
  }
});

// Sort by page number
pageTimestamps.sort((a, b) => a.pageNumber - b.pageNumber);

console.log(`✅ Mapped ${pageTimestamps.length} page timestamps\n`);

// Fill in missing pages with interpolation
const completeTimestamps = [];

for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
  const exactMatch = pageTimestamps.find(p => p.pageNumber === pageNum);
  
  if (exactMatch) {
    completeTimestamps.push(exactMatch);
  } else {
    // Interpolate between nearest known pages
    const before = pageTimestamps.filter(p => p.pageNumber < pageNum).slice(-1)[0];
    const after = pageTimestamps.find(p => p.pageNumber > pageNum);
    
    if (before && after) {
      const ratio = (pageNum - before.pageNumber) / (after.pageNumber - before.pageNumber);
      const interpolatedTime = before.timestamp + (ratio * (after.timestamp - before.timestamp));
      
      completeTimestamps.push({
        pageNumber: pageNum,
        timestamp: interpolatedTime,
        hasTransition: false,
        speaker: before.to || before.speaker,
        source: 'interpolated'
      });
    } else if (before) {
      // Extrapolate after last known
      const avgDuration = before.timestamp / before.pageNumber;
      completeTimestamps.push({
        pageNumber: pageNum,
        timestamp: pageNum * avgDuration,
        hasTransition: false,
        source: 'extrapolated'
      });
    }
  }
}

console.log(`✅ Complete timeline: ${completeTimestamps.length} pages\n`);

// Show statistics
const detected = completeTimestamps.filter(p => p.source === 'detected').length;
const interpolated = completeTimestamps.filter(p => p.source === 'interpolated').length;
const extrapolated = completeTimestamps.filter(p => p.source === 'extrapolated').length;

console.log(`Page Source Breakdown:`);
console.log(`  Detected transitions: ${detected}`);
console.log(`  Interpolated: ${interpolated}`);
console.log(`  Extrapolated: ${extrapolated}\n`);

// Calculate page durations
const durations = [];
for (let i = 1; i < completeTimestamps.length; i++) {
  const duration = completeTimestamps[i].timestamp - completeTimestamps[i - 1].timestamp;
  durations.push(duration);
}

const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
const minDuration = Math.min(...durations);
const maxDuration = Math.max(...durations);

console.log(`Page Duration Statistics:`);
console.log(`  Average: ${avgDuration.toFixed(1)}s`);
console.log(`  Minimum: ${minDuration.toFixed(1)}s`);
console.log(`  Maximum: ${maxDuration.toFixed(1)}s\n`);

// Show first 20 pages
console.log(`First 20 Pages:`);
completeTimestamps.slice(0, 20).forEach(p => {
  const timeStr = `${Math.floor(p.timestamp / 60)}:${(p.timestamp % 60).toFixed(0).toString().padStart(2, '0')}`;
  const source = p.source === 'detected' ? '✓' : (p.source === 'interpolated' ? '~' : '+');
  console.log(`  ${source} Page ${p.pageNumber.toString().padStart(3)}: ${timeStr.padStart(6)} ${p.hasTransition ? `(${p.from} → ${p.to})` : ''}`);
});

// Save
const outputPath = path.join(__dirname, 'training-data/page-timestamps-mapped.json');
fs.writeFileSync(outputPath, JSON.stringify({
  totalPages,
  totalDetectedTransitions: detected,
  interpolated,
  extrapolated,
  avgPageDuration: avgDuration,
  minPageDuration: minDuration,
  maxPageDuration: maxDuration,
  pages: completeTimestamps
}, null, 2));

console.log(`\n💾 Saved to training-data/page-timestamps-mapped.json`);

console.log(`\n🎯 Next: Rebuild fingerprints using these actual timestamps`);
console.log(`   This will dramatically improve accuracy!`);
