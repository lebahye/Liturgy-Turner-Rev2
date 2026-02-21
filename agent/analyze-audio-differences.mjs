#!/usr/bin/env node
/**
 * Audio Source Analyzer - Why Did I Fail?
 * 
 * Compares YouTube training audio features vs user's captured features
 * to understand why recognition failed completely
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🔬 AUDIO SOURCE ANALYSIS - Why Did I Fail?');
console.log('═'.repeat(80));
console.log('');

// Load my training fingerprints
const fingerprintsPath = '/app/training-data/fingerprints-youtube.json';
const fingerprints = JSON.parse(fs.readFileSync(fingerprintsPath, 'utf8'));

// Get a sample of training fingerprints for comparison
const samplePages = [3, 5, 10, 15, 20];
const trainingFeatures = {
  mfcc: [],
  spectralCentroid: [],
  spectralRolloff: []
};

samplePages.forEach(page => {
  if (fingerprints[page]) {
    if (fingerprints[page].mfcc) trainingFeatures.mfcc.push(...fingerprints[page].mfcc);
    if (fingerprints[page].spectralCentroid) {
      // spectralCentroid might be array or single value
      const sc = Array.isArray(fingerprints[page].spectralCentroid) ? 
                 fingerprints[page].spectralCentroid : 
                 [fingerprints[page].spectralCentroid];
      trainingFeatures.spectralCentroid.push(...sc);
    }
    if (fingerprints[page].spectralRolloff) {
      // spectralRolloff might be array or single value
      const sr = Array.isArray(fingerprints[page].spectralRolloff) ? 
                 fingerprints[page].spectralRolloff : 
                 [fingerprints[page].spectralRolloff];
      trainingFeatures.spectralRolloff.push(...sr);
    }
  }
});

console.log('📚 Training Audio (YouTube):');
console.log(`   MFCC samples: ${trainingFeatures.mfcc.length}`);
console.log(`   MFCC range: ${Math.min(...trainingFeatures.mfcc).toFixed(2)} to ${Math.max(...trainingFeatures.mfcc).toFixed(2)}`);
console.log(`   MFCC mean: ${(trainingFeatures.mfcc.reduce((a,b) => a+b, 0) / trainingFeatures.mfcc.length).toFixed(2)}`);
console.log(`   Spectral Centroid range: ${Math.min(...trainingFeatures.spectralCentroid).toFixed(2)} to ${Math.max(...trainingFeatures.spectralCentroid).toFixed(2)}`);
console.log(`   Spectral Rolloff range: ${Math.min(...trainingFeatures.spectralRolloff).toFixed(2)} to ${Math.max(...trainingFeatures.spectralRolloff).toFixed(2)}`);
console.log('');

// Load user's captured features
const db = new Database('/app/data/liturgy-turner.db', { readonly: true });
const markers = db.prepare(`
  SELECT page_number, audio_features
  FROM page_markers
  WHERE session_id = (SELECT id FROM training_sessions ORDER BY created_at DESC LIMIT 1)
  ORDER BY page_number
  LIMIT 5
`).all();

const userFeatures = {
  mfcc: [],
  spectralCentroid: [],
  spectralRolloff: []
};

markers.forEach(marker => {
  try {
    const features = JSON.parse(marker.audio_features);
    if (features.mfcc) userFeatures.mfcc.push(...features.mfcc);
    if (features.spectralCentroid) {
      const sc = Array.isArray(features.spectralCentroid) ? 
                 features.spectralCentroid : 
                 [features.spectralCentroid];
      userFeatures.spectralCentroid.push(...sc);
    }
    if (features.spectralRolloff) {
      const sr = Array.isArray(features.spectralRolloff) ? 
                 features.spectralRolloff : 
                 [features.spectralRolloff];
      userFeatures.spectralRolloff.push(...sr);
    }
  } catch (e) {}
});

console.log('🎤 User\'s Audio (Test Session):');
console.log(`   MFCC samples: ${userFeatures.mfcc.length}`);
console.log(`   MFCC range: ${Math.min(...userFeatures.mfcc).toFixed(2)} to ${Math.max(...userFeatures.mfcc).toFixed(2)}`);
console.log(`   MFCC mean: ${(userFeatures.mfcc.reduce((a,b) => a+b, 0) / userFeatures.mfcc.length).toFixed(2)}`);
console.log(`   Spectral Centroid range: ${Math.min(...userFeatures.spectralCentroid).toFixed(2)} to ${Math.max(...userFeatures.spectralCentroid).toFixed(2)}`);
console.log(`   Spectral Rolloff range: ${Math.min(...userFeatures.spectralRolloff).toFixed(2)} to ${Math.max(...userFeatures.spectralRolloff).toFixed(2)}`);
console.log('');

// Calculate differences
console.log('📊 COMPARISON:');
console.log('─'.repeat(80));

const mfccShift = (userFeatures.mfcc.reduce((a,b) => a+b, 0) / userFeatures.mfcc.length) - 
                   (trainingFeatures.mfcc.reduce((a,b) => a+b, 0) / trainingFeatures.mfcc.length);
const scShift = (userFeatures.spectralCentroid.reduce((a,b) => a+b, 0) / userFeatures.spectralCentroid.length) -
                (trainingFeatures.spectralCentroid.reduce((a,b) => a+b, 0) / trainingFeatures.spectralCentroid.length);
const srShift = (userFeatures.spectralRolloff.reduce((a,b) => a+b, 0) / userFeatures.spectralRolloff.length) -
                (trainingFeatures.spectralRolloff.reduce((a,b) => a+b, 0) / trainingFeatures.spectralRolloff.length);

console.log(`MFCC Mean Shift: ${mfccShift > 0 ? '+' : ''}${mfccShift.toFixed(2)} ${Math.abs(mfccShift) > 5 ? '⚠️ LARGE' : '✅ OK'}`);
console.log(`Spectral Centroid Shift: ${scShift > 0 ? '+' : ''}${scShift.toFixed(2)} ${Math.abs(scShift) > 500 ? '⚠️ LARGE' : '✅ OK'}`);
console.log(`Spectral Rolloff Shift: ${srShift > 0 ? '+' : ''}${srShift.toFixed(2)} ${Math.abs(srShift) > 500 ? '⚠️ LARGE' : '✅ OK'}`);
console.log('');

// Calculate overlap
function calculateOverlap(arr1, arr2) {
  const min1 = Math.min(...arr1);
  const max1 = Math.max(...arr1);
  const min2 = Math.min(...arr2);
  const max2 = Math.max(...arr2);
  
  const overlapStart = Math.max(min1, min2);
  const overlapEnd = Math.min(max1, max2);
  
  if (overlapEnd < overlapStart) return 0; // No overlap
  
  const overlap = overlapEnd - overlapStart;
  const range1 = max1 - min1;
  const range2 = max2 - min2;
  
  return overlap / Math.max(range1, range2);
}

const mfccOverlap = calculateOverlap(trainingFeatures.mfcc, userFeatures.mfcc);
const scOverlap = calculateOverlap(trainingFeatures.spectralCentroid, userFeatures.spectralCentroid);
const srOverlap = calculateOverlap(trainingFeatures.spectralRolloff, userFeatures.spectralRolloff);

console.log('📐 FEATURE SPACE OVERLAP:');
console.log(`   MFCC: ${(mfccOverlap * 100).toFixed(1)}% ${mfccOverlap < 0.5 ? '⚠️ LOW' : '✅ GOOD'}`);
console.log(`   Spectral Centroid: ${(scOverlap * 100).toFixed(1)}% ${scOverlap < 0.5 ? '⚠️ LOW' : '✅ GOOD'}`);
console.log(`   Spectral Rolloff: ${(srOverlap * 100).toFixed(1)}% ${srOverlap < 0.5 ? '⚠️ LOW' : '✅ GOOD'}`);
console.log('');

// Diagnosis
console.log('🔍 DIAGNOSIS:');
console.log('─'.repeat(80));

const issues = [];
if (Math.abs(mfccShift) > 5) issues.push('MFCC values significantly shifted (different recording device/quality)');
if (Math.abs(scShift) > 500) issues.push('Spectral centroid shifted (different frequency characteristics)');
if (Math.abs(srShift) > 500) issues.push('Spectral rolloff shifted (different high-frequency content)');
if (mfccOverlap < 0.5) issues.push('Low MFCC overlap (features live in different spaces)');
if (scOverlap < 0.5) issues.push('Low spectral centroid overlap (very different acoustic signature)');

if (issues.length === 0) {
  console.log('✅ Audio sources are similar enough - recognition should work');
  console.log('   Issue must be elsewhere (check algorithm/weights)');
} else {
  console.log('❌ Audio sources are fundamentally different:');
  issues.forEach((issue, i) => {
    console.log(`   ${i+1}. ${issue}`);
  });
}

console.log('');
console.log('💡 CONCLUSION:');
console.log('─'.repeat(80));

if (issues.length > 2) {
  console.log('🚨 INCOMPATIBLE AUDIO SOURCES');
  console.log('');
  console.log('Your audio and my training audio are fundamentally different.');
  console.log('This is like trying to recognize a song played on a guitar');
  console.log('when I was trained on the same song played on a piano.');
  console.log('');
  console.log('The CONTENT is the same (same liturgy), but the ACOUSTIC SIGNATURE');
  console.log('is completely different (different recording equipment/environment).');
  console.log('');
  console.log('✅ SOLUTION: I need to learn YOUR specific audio source.');
  console.log('   Tomorrow: Extract your exact audio → rebuild fingerprints → retest');
} else {
  console.log('⚠️ MODERATE DIFFERENCE');
  console.log('');
  console.log('Audio sources have some differences but might be reconcilable');
  console.log('with feature normalization or adaptive thresholding.');
}

console.log('');
console.log('═'.repeat(80));

db.close();
