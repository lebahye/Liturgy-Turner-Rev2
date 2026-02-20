#!/usr/bin/env node
/**
 * Analyze score distribution
 * See if the scoring function is too generous
 */

import { PageMatcher } from './skills/armenian-learner/lib/page-matcher.js';
import fs from 'fs';

console.log('=== Score Distribution Analysis ===\n');

const fingerprints = JSON.parse(fs.readFileSync('/app/training-data/fingerprints-v2.json', 'utf8'));
const matcher = new PageMatcher();

// Test page 7 against all pages
const page7fp = fingerprints.find(f => f.pageNumber === 7);
const result = matcher.matchAudio(page7fp.features);

console.log('Testing page 7 against all 183 pages:\n');

// Analyze the distribution
const scores = result.topMatches.map(m => m.score);
const sorted = [...scores].sort((a, b) => b - a);

console.log(`Highest score: ${(sorted[0] * 100).toFixed(1)}% (should be 100% - page 7 itself)`);
console.log(`Median score: ${(sorted[Math.floor(scores.length / 2)] * 100).toFixed(1)}%`);
console.log(`Lowest score: ${(sorted[sorted.length - 1] * 100).toFixed(1)}%`);
console.log(`Average score: ${((scores.reduce((a, b) => a + b, 0) / scores.length) * 100).toFixed(1)}%`);

// Count how many pages are above different thresholds
const above90 = scores.filter(s => s > 0.9).length;
const above80 = scores.filter(s => s > 0.8).length;
const above70 = scores.filter(s => s > 0.7).length;
const above50 = scores.filter(s => s > 0.5).length;

console.log(`\nPages above threshold:`);
console.log(`  >90%: ${above90} / 183 (${(above90 / 183 * 100).toFixed(1)}%)`);
console.log(`  >80%: ${above80} / 183 (${(above80 / 183 * 100).toFixed(1)}%)`);
console.log(`  >70%: ${above70} / 183 (${(above70 / 183 * 100).toFixed(1)}%)`);
console.log(`  >50%: ${above50} / 183 (${(above50 / 183 * 100).toFixed(1)}%)`);

// Check if adjacent pages score higher
console.log(`\n=== Adjacent Page Analysis ===`);
const adjacentScores = [];
for (let offset = 1; offset <= 10; offset++) {
  const nearbyPage = fingerprints.find(f => f.pageNumber === 7 + offset);
  if (nearbyPage) {
    const match = result.topMatches.find(m => m.page === 7 + offset);
    if (match) {
      adjacentScores.push({ offset, score: match.score });
    }
  }
}

console.log('Pages 8-17 (adjacent to page 7):');
adjacentScores.forEach(({ offset, score }) => {
  console.log(`  Page ${7 + offset} (+${offset}): ${(score * 100).toFixed(1)}%`);
});

// Check if there's a correlation
const hasGradient = adjacentScores.every((curr, i) => {
  if (i === 0) return true;
  return curr.score <= adjacentScores[i - 1].score;
});

console.log(`\nScores decrease with distance: ${hasGradient ? 'YES ✅' : 'NO ⚠️'}`);

console.log('\n=== Recommendation ===');
if (above90 > 50) {
  console.log('⚠️  Too many pages score >90%');
  console.log('   This could cause false positives with noisy audio');
  console.log('   Consider adjusting feature weights or adding more discriminative features');
} else if (above70 > 100) {
  console.log('⚠️  Many pages score >70%');
  console.log('   Sensitivity threshold should be >70% to avoid false triggers');
} else {
  console.log('✅ Score distribution looks reasonable');
}
