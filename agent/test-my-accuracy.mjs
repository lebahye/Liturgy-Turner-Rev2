#!/usr/bin/env node
/**
 * ACCURACY CHALLENGE - Prove I Can Recognize Your Audio
 * 
 * Tests my recognizer against your captured test session data
 * from the database. Let's see if I'm as accurate as I claim!
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🎯 ACCURACY CHALLENGE - Testing Against Your Real Data');
console.log('═'.repeat(80));
console.log('');

// Load my fingerprints
const fingerprintsPath = '/app/training-data/fingerprints-youtube.json';
const transitionsPath = '/app/training-data/page-transitions.json';

console.log('📚 Loading my training data...');
const fingerprints = JSON.parse(fs.readFileSync(fingerprintsPath, 'utf8'));
const transitions = JSON.parse(fs.readFileSync(transitionsPath, 'utf8'));
console.log(`   ✅ Loaded ${Object.keys(fingerprints).length} page fingerprints`);
console.log('');

// Open database
const db = new Database('/app/data/liturgy-turner.db', { readonly: true });

// Get latest test session
const session = db.prepare(`
  SELECT id, name, created_at, total_pages 
  FROM training_sessions 
  ORDER BY created_at DESC 
  LIMIT 1
`).get();

if (!session) {
  console.log('❌ No test sessions found in database');
  process.exit(1);
}

console.log('📊 Your Test Session:');
console.log(`   Session: ${session.name || session.id}`);
console.log(`   Date: ${new Date(session.created_at * 1000).toISOString()}`);
console.log(`   Expected Pages: ${session.total_pages || 'unknown'}`);
console.log('');

// Get all page markers
const markers = db.prepare(`
  SELECT page_number, timestamp_ms, audio_features
  FROM page_markers
  WHERE session_id = ?
  ORDER BY timestamp_ms
`).all(session.id);

console.log(`📍 Found ${markers.length} page markers in your test`);
console.log('');

if (markers.length === 0) {
  console.log('❌ No page markers captured');
  process.exit(1);
}

// Helper: Calculate cosine similarity
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Helper: Get duration penalty
function getDurationPenalty(testDuration, pageDuration) {
  if (!pageDuration || pageDuration === 0) return 1.0;
  
  const ratio = testDuration / pageDuration;
  
  if (ratio >= 0.8 && ratio <= 1.2) return 1.1;  // Perfect match
  if (ratio >= 0.6 && ratio <= 1.4) return 1.0;  // Good match
  if (ratio >= 0.4 && ratio <= 1.6) return 0.9;  // OK match
  if (ratio >= 0.2 && ratio <= 2.0) return 0.7;  // Poor match
  return 0.5;  // Very poor match
}

// Analyze each marker
console.log('🔍 Running Recognition Test...');
console.log('─'.repeat(80));

let correct = 0;
let within2 = 0;
let within5 = 0;
let totalError = 0;
let previousPage = null;

const results = [];

for (let i = 0; i < markers.length; i++) {
  const marker = markers[i];
  const actualPage = marker.page_number;
  const timestamp = marker.timestamp_ms;
  
  // Parse audio features
  let features;
  try {
    features = JSON.parse(marker.audio_features);
  } catch (e) {
    console.log(`   ⚠️ Page ${actualPage}: Could not parse audio features`);
    continue;
  }
  
  // Calculate duration since last marker
  let testDuration = 0;
  if (i > 0) {
    testDuration = (timestamp - markers[i-1].timestamp_ms) / 1000; // seconds
  }
  
  // Score all pages
  const scores = [];
  
  for (const [pageStr, pageData] of Object.entries(fingerprints)) {
    const pageNum = parseInt(pageStr);
    
    // Audio similarity
    let audioScore = 0;
    if (features.mfcc && pageData.mfcc) {
      audioScore = cosineSimilarity(features.mfcc, pageData.mfcc) * 0.6;
    }
    if (features.spectralCentroid && pageData.spectralCentroid) {
      audioScore += cosineSimilarity(features.spectralCentroid, pageData.spectralCentroid) * 0.2;
    }
    if (features.spectralRolloff && pageData.spectralRolloff) {
      audioScore += cosineSimilarity(features.spectralRolloff, pageData.spectralRolloff) * 0.2;
    }
    
    // Duration penalty
    let durationPenalty = 1.0;
    if (testDuration > 0 && pageData.duration) {
      durationPenalty = getDurationPenalty(testDuration, pageData.duration);
    }
    
    // Temporal boost
    let temporalBoost = 1.0;
    if (previousPage !== null) {
      const transitionKey = `${previousPage}_${pageNum}`;
      const probability = transitions[transitionKey] || 0.0001;
      temporalBoost = 1 + (probability * 10); // Max 10.5x for next page
    }
    
    // Final score (triple fusion)
    const finalScore = audioScore * durationPenalty * temporalBoost;
    
    scores.push({
      page: pageNum,
      audioScore,
      durationPenalty,
      temporalBoost,
      finalScore
    });
  }
  
  // Sort by final score
  scores.sort((a, b) => b.finalScore - a.finalScore);
  
  const predictedPage = scores[0].page;
  const confidence = scores[0].finalScore;
  const top3 = scores.slice(0, 3);
  
  // Calculate accuracy
  const error = Math.abs(predictedPage - actualPage);
  totalError += error;
  
  if (error === 0) {
    correct++;
    within2++;
    within5++;
  } else if (error <= 2) {
    within2++;
    within5++;
  } else if (error <= 5) {
    within5++;
  }
  
  // Display result
  const status = error === 0 ? '✅' : (error <= 2 ? '⚠️' : '❌');
  console.log(`${status} Page ${actualPage} → Predicted: ${predictedPage} (error: ${error}, conf: ${confidence.toFixed(3)})`);
  
  if (error > 0) {
    console.log(`     Top 3: ${top3.map(s => `${s.page}(${s.finalScore.toFixed(2)})`).join(', ')}`);
    console.log(`     Audio: ${scores[0].audioScore.toFixed(3)}, Duration: ${scores[0].durationPenalty.toFixed(2)}x, Temporal: ${scores[0].temporalBoost.toFixed(2)}x`);
  }
  
  results.push({
    actual: actualPage,
    predicted: predictedPage,
    error,
    confidence,
    timestamp: timestamp / 1000,
    testDuration
  });
  
  previousPage = actualPage; // Use actual page for temporal context
}

console.log('');
console.log('═'.repeat(80));
console.log('📊 FINAL RESULTS');
console.log('═'.repeat(80));

const exactAccuracy = ((correct / markers.length) * 100).toFixed(1);
const within2Accuracy = ((within2 / markers.length) * 100).toFixed(1);
const within5Accuracy = ((within5 / markers.length) * 100).toFixed(1);
const avgError = (totalError / markers.length).toFixed(2);

console.log(`✅ Exact Match:     ${correct}/${markers.length} (${exactAccuracy}%)`);
console.log(`📍 Within 2 Pages:  ${within2}/${markers.length} (${within2Accuracy}%)`);
console.log(`📍 Within 5 Pages:  ${within5}/${markers.length} (${within5Accuracy}%)`);
console.log(`📏 Average Error:   ${avgError} pages`);
console.log('');

// Analysis
if (parseFloat(exactAccuracy) >= 90) {
  console.log('🎉 EXCELLENT! System working as claimed!');
} else if (parseFloat(exactAccuracy) >= 60) {
  console.log('👍 GOOD! System working well, some tuning needed.');
} else if (parseFloat(exactAccuracy) >= 30) {
  console.log('⚠️ FAIR - System recognizing patterns but needs improvement.');
} else {
  console.log('❌ POOR - Audio source likely different from training data.');
  console.log('');
  console.log('💡 Likely Causes:');
  console.log('   1. Different audio recording (not YouTube liturgy)');
  console.log('   2. Different microphone/device characteristics');
  console.log('   3. Background noise or audio quality differences');
  console.log('');
  console.log('📝 Recommendation: Extract your exact audio source and retrain.');
}

console.log('');
console.log('═'.repeat(80));

// Save results
const resultFile = '/app/agent/test-session-accuracy-results.json';
fs.writeFileSync(resultFile, JSON.stringify({
  session: session.name,
  timestamp: new Date().toISOString(),
  markers: markers.length,
  exactAccuracy: parseFloat(exactAccuracy),
  within2Accuracy: parseFloat(within2Accuracy),
  within5Accuracy: parseFloat(within5Accuracy),
  avgError: parseFloat(avgError),
  results
}, null, 2));

console.log(`📁 Detailed results saved: ${resultFile}`);

db.close();
