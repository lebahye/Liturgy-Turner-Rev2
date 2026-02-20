#!/usr/bin/env node
/**
 * Test the V2 Page Matcher
 * Validate it can correctly identify pages from their audio signatures
 */

import { PageMatcher } from './skills/armenian-learner/lib/page-matcher.js';
import fs from 'fs';

console.log('=== Testing Page Matcher V2 ===\n');

// Load fingerprints
const fingerprints = JSON.parse(fs.readFileSync('/app/training-data/fingerprints-v2.json', 'utf8'));
console.log(`Loaded ${fingerprints.length} page fingerprints\n`);

// Create page matcher
const matcher = new PageMatcher();
matcher.setSensitivity(0.3); // 30% threshold for testing

// Test 1: Can it identify page 7 from page 7's features?
console.log('=== Test 1: Page 7 should match page 7 ===');
const page7fp = fingerprints.find(f => f.pageNumber === 7);
const result7 = matcher.matchAudio(page7fp.features);

console.log(`Input: Page 7 features`);
console.log(`Detected: Page ${result7.page}`);
console.log(`Confidence: ${(result7.confidence * 100).toFixed(1)}%`);
console.log(`Triggerable: ${result7.triggerable}`);
console.log(`Top 5 matches:`);
result7.topMatches.forEach((m, i) => {
  console.log(`  ${i + 1}. Page ${m.page}: ${(m.score * 100).toFixed(1)}%`);
});

const test1Pass = result7.page === 7 && result7.confidence > 0.7;
console.log(`\n✓ Test 1: ${test1Pass ? 'PASS' : 'FAIL'}\n`);

// Test 2: Can it identify page 8 from page 8's features?
console.log('=== Test 2: Page 8 should match page 8 ===');
matcher.reset(); // Clear history from Test 1
const page8fp = fingerprints.find(f => f.pageNumber === 8);
const result8 = matcher.matchAudio(page8fp.features);

console.log(`Input: Page 8 features`);
console.log(`Detected: Page ${result8.page}`);
console.log(`Confidence: ${(result8.confidence * 100).toFixed(1)}%`);
console.log(`Triggerable: ${result8.triggerable}`);
console.log(`Top 5 matches:`);
result8.topMatches.forEach((m, i) => {
  console.log(`  ${i + 1}. Page ${m.page}: ${(m.score * 100).toFixed(1)}%`);
});

const test2Pass = result8.page === 8 && result8.confidence > 0.7;
console.log(`\n✓ Test 2: ${test2Pass ? 'PASS' : 'FAIL'}\n`);

// Test 3: Temporal smoothing (should maintain prediction across frames)
console.log('=== Test 3: Temporal smoothing (3 frames of page 7) ===');
matcher.reset();

for (let i = 0; i < 3; i++) {
  const result = matcher.matchAudio(page7fp.features);
  console.log(`Frame ${i + 1}: Page ${result.page} (${(result.confidence * 100).toFixed(1)}%)`);
}

console.log('✓ Test 3: Should stabilize on page 7\n');

// Test 4: Can it detect page transition?
console.log('=== Test 4: Page transition (7 → 8) ===');
matcher.reset();
matcher.setCurrentPage = (page) => { matcher.currentPage = page; };
matcher.setCurrentPage(7);

console.log('Starting on page 7...');
const r1 = matcher.matchAudio(page7fp.features);
console.log(`  Frame 1: Page ${r1.page} (${(r1.confidence * 100).toFixed(1)}%)`);

const r2 = matcher.matchAudio(page7fp.features);
console.log(`  Frame 2: Page ${r2.page} (${(r2.confidence * 100).toFixed(1)}%)`);

console.log('\nTransitioning to page 8...');
const r3 = matcher.matchAudio(page8fp.features);
console.log(`  Frame 3: Page ${r3.page} (${(r3.confidence * 100).toFixed(1)}%)`);

const r4 = matcher.matchAudio(page8fp.features);
console.log(`  Frame 4: Page ${r4.page} (${(r4.confidence * 100).toFixed(1)}%)`);

const test4Pass = r3.page === 8 || r4.page === 8;
console.log(`\n✓ Test 4: ${test4Pass ? 'PASS' : 'FAIL'}\n`);

// Test 5: Check if similar pages have similar scores
console.log('=== Test 5: Page similarity (adjacent pages should be similar) ===');
const page50fp = fingerprints.find(f => f.pageNumber === 50);
const result50 = matcher.matchAudio(page50fp.features);

const adjacentInTop5 = result50.topMatches.slice(0, 5).some(m => 
  Math.abs(m.page - 50) <= 5 && m.page !== 50
);

console.log(`Input: Page 50 features`);
console.log(`Top 5 matches:`);
result50.topMatches.forEach((m, i) => {
  const dist = Math.abs(m.page - 50);
  console.log(`  ${i + 1}. Page ${m.page}: ${(m.score * 100).toFixed(1)}% (distance: ${dist})`);
});

console.log(`\nAdjacent pages in top 5: ${adjacentInTop5 ? 'YES' : 'NO'}`);
console.log(`✓ Test 5: ${adjacentInTop5 ? 'PASS' : 'FAIL - pages might not cluster well'}\n`);

// Summary
console.log('=== Summary ===');
const allPass = test1Pass && test2Pass && test4Pass;
console.log(`Overall: ${allPass ? '✅ WORKING' : '❌ NEEDS WORK'}`);

if (!allPass) {
  console.log('\n⚠️  Issues found:');
  if (!test1Pass) console.log('  - Page 7 self-match failed');
  if (!test2Pass) console.log('  - Page 8 self-match failed');
  if (!test4Pass) console.log('  - Page transition detection failed');
}

console.log('\nNext: Run node test-page-matcher.mjs to see results');
