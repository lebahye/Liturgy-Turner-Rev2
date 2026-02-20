#!/usr/bin/env node
/**
 * Test with noisy/imperfect audio
 * Simulate what happens when YouTube audio doesn't perfectly match fingerprints
 */

import { PageMatcher } from './skills/armenian-learner/lib/page-matcher.js';
import fs from 'fs';

console.log('=== Testing with Noisy Audio ===\n');

const fingerprints = JSON.parse(fs.readFileSync('/app/training-data/fingerprints-v2.json', 'utf8'));
const matcher = new PageMatcher();
matcher.setSensitivity(0.5); // 50% threshold

// Get page 7 fingerprint
const page7fp = fingerprints.find(f => f.pageNumber === 7);

// Simulate noisy version - add random noise to features
function addNoise(features, noiseLevel = 0.1) {
  const noisy = JSON.parse(JSON.stringify(features)); // Deep clone
  
  // Add noise to MFCC
  if (noisy.mfcc) {
    noisy.mfcc = noisy.mfcc.map(v => v + (Math.random() - 0.5) * noiseLevel);
  }
  
  // Add noise to other features
  if (noisy.spectralCentroid) {
    noisy.spectralCentroid *= (1 + (Math.random() - 0.5) * noiseLevel);
  }
  if (noisy.rms) {
    noisy.rms *= (1 + (Math.random() - 0.5) * noiseLevel);
  }
  if (noisy.zcr) {
    noisy.zcr *= (1 + (Math.random() - 0.5) * noiseLevel);
  }
  
  return noisy;
}

// Test with increasing noise levels
for (const noiseLevel of [0.05, 0.1, 0.2, 0.3]) {
  matcher.reset();
  console.log(`\n=== Noise level: ${(noiseLevel * 100).toFixed(0)}% ===`);
  
  const noisyFeatures = addNoise(page7fp.features, noiseLevel);
  const result = matcher.matchAudio(noisyFeatures);
  
  console.log(`Actual page: 7`);
  console.log(`Detected page: ${result.page}`);
  console.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
  console.log(`Triggerable: ${result.triggerable}`);
  console.log(`Top 3: ${result.topMatches.slice(0, 3).map(m => `p${m.page}:${(m.score * 100).toFixed(0)}%`).join(', ')}`);
  
  const correct = result.page === 7;
  console.log(`Result: ${correct ? '✅ CORRECT' : '❌ WRONG'}`);
}

// Test what happens with completely random audio
console.log(`\n\n=== Completely Random Audio ===`);
matcher.reset();

const randomFeatures = {
  mfcc: Array(13).fill(0).map(() => Math.random() * 2 - 1),
  spectralCentroid: Math.random() * 1000,
  rms: Math.random() * 0.1,
  zcr: Math.random() * 200
};

const result = matcher.matchAudio(randomFeatures);
console.log(`Detected page: ${result.page}`);
console.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
console.log(`Triggerable: ${result.triggerable}`);
console.log(`Top 5: ${result.topMatches.slice(0, 5).map(m => `p${m.page}:${(m.score * 100).toFixed(0)}%`).join(', ')}`);

console.log('\n✅ Noise testing complete');
