#!/usr/bin/env node
/**
 * Test page 7 against ALL pages to see full score distribution
 */

import fs from 'fs';
import { AudioPhonemeExtractor } from './skills/armenian-learner/lib/audio-phoneme-extractor.js';

console.log('=== Full Score Distribution ===\n');

const fingerprints = JSON.parse(fs.readFileSync('/app/training-data/fingerprints-v2.json', 'utf8'));
const page7fp = fingerprints.find(f => f.pageNumber === 7);

// Manually calculate scores for all pages using the same logic as PageMatcher
function cosineSimilarity(a, b) {
  const len = Math.min(a.length, b.length);
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;
  
  for (let i = 0; i < len; i++) {
    dotProduct += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  
  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);
  
  if (magA === 0 || magB === 0) return 0;
  
  const sim = dotProduct / (magA * magB);
  return (sim + 1) / 2; // Convert -1..1 to 0..1
}

function compareFeatures(f1, f2) {
  let totalScore = 0;
  let weights = 0;
  
  // MFCC
  if (f1.mfcc && f2.mfcc) {
    const mfccSim = cosineSimilarity(f1.mfcc, f2.mfcc);
    totalScore += mfccSim * 0.6;
    weights += 0.6;
  }
  
  // Spectral centroid
  if (f1.spectralCentroid && f2.spectralCentroid) {
    const diff = Math.abs(f1.spectralCentroid - f2.spectralCentroid);
    const maxDiff = 1000;
    const sim = Math.max(0, 1 - (diff / maxDiff));
    totalScore += sim * 0.2;
    weights += 0.2;
  }
  
  // RMS
  if (f1.rms && f2.rms) {
    const diff = Math.abs(f1.rms - f2.rms);
    const maxDiff = 0.1;
    const sim = Math.max(0, 1 - (diff / maxDiff));
    totalScore += sim * 0.1;
    weights += 0.1;
  }
  
  // ZCR
  if (f1.zcr && f2.zcr) {
    const diff = Math.abs(f1.zcr - f2.zcr);
    const maxDiff = 100;
    const sim = Math.max(0, 1 - (diff / maxDiff));
    totalScore += sim * 0.1;
    weights += 0.1;
  }
  
  return weights > 0 ? totalScore / weights : 0;
}

// Calculate scores for all pages
const allScores = fingerprints.map(fp => ({
  page: fp.pageNumber,
  score: compareFeatures(page7fp.features, fp.features)
}));

// Sort by score
allScores.sort((a, b) => b.score - a.score);

console.log(`Comparing page 7 to all 183 pages:\n`);
console.log(`Top 10:`);
allScores.slice(0, 10).forEach((s, i) => {
  console.log(`  ${i + 1}. Page ${s.page}: ${(s.score * 100).toFixed(1)}%`);
});

console.log(`\nBottom 10:`);
allScores.slice(-10).forEach((s, i) => {
  console.log(`  ${183 - 9 + i}. Page ${s.page}: ${(s.score * 100).toFixed(1)}%`);
});

// Statistics
const scores = allScores.map(s => s.score);
const min = Math.min(...scores);
const max = Math.max(...scores);
const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
const median = scores[Math.floor(scores.length / 2)];

console.log(`\nStatistics:`);
console.log(`  Highest: ${(max * 100).toFixed(1)}%`);
console.log(`  Lowest: ${(min * 100).toFixed(1)}%`);
console.log(`  Average: ${(avg * 100).toFixed(1)}%`);
console.log(`  Median: ${(median * 100).toFixed(1)}%`);
console.log(`  Range: ${((max - min) * 100).toFixed(1)}%`);

// Thresholds
const above90 = scores.filter(s => s > 0.9).length;
const above80 = scores.filter(s => s > 0.8).length;
const above70 = scores.filter(s => s > 0.7).length;
const above60 = scores.filter(s => s > 0.6).length;
const above50 = scores.filter(s => s > 0.5).length;

console.log(`\nPages above threshold:`);
console.log(`  >90%: ${above90} / 183 (${(above90 / 183 * 100).toFixed(1)}%)`);
console.log(`  >80%: ${above80} / 183 (${(above80 / 183 * 100).toFixed(1)}%)`);
console.log(`  >70%: ${above70} / 183 (${(above70 / 183 * 100).toFixed(1)}%)`);
console.log(`  >60%: ${above60} / 183 (${(above60 / 183 * 100).toFixed(1)}%)`);
console.log(`  >50%: ${above50} / 183 (${(above50 / 183 * 100).toFixed(1)}%)`);

// Analysis
console.log(`\n=== Analysis ===`);
const spread = (max - min) * 100;

if (spread < 10) {
  console.log(`⚠️  PROBLEM: Only ${spread.toFixed(1)}% spread between best and worst match`);
  console.log(`   All pages are too similar - hard to distinguish`);
  console.log(`   Recommendation: Add more discriminative features or adjust weights`);
} else if (spread < 20) {
  console.log(`⚠️  Moderate spread (${spread.toFixed(1)}%)`);
  console.log(`   May work but could be more robust`);
} else {
  console.log(`✅ Good spread (${spread.toFixed(1)}%)`);
  console.log(`   Pages are well-differentiated`);
}
