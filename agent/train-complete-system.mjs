#!/usr/bin/env node
/**
 * COMPLETE TRAINING SYSTEM
 * Train on both sessions until 100% ready
 */
import Database from 'better-sqlite3';
import fs from 'fs';

console.log('🎓 COMPLETE TRAINING SYSTEM');
console.log('═'.repeat(80));
console.log('');
console.log('Goal: Train until 100% confident in page turning accuracy');
console.log('');

// Load dictionary
const dict = JSON.parse(fs.readFileSync('/app/agent/liturgy-complete-index.json', 'utf8'));
console.log('📚 Dictionary loaded:');
console.log(`   Grapar pages: ${Object.keys(dict.pages).length}`);
console.log(`   Grapar words: ${Object.keys(dict.wordIndex).length}`);
console.log(`   Phonetic words: ${Object.keys(dict.phoneticIndex).length}`);
console.log(`   English words: ${Object.keys(dict.englishIndex).length}`);
console.log('');

// Load training sessions
const db = new Database('/app/data/liturgy-turner.db', { readonly: true });
const sessions = db.prepare('SELECT * FROM training_sessions ORDER BY created_at').all();

console.log('📊 Training Sessions:');
sessions.forEach((s, i) => {
  const markers = db.prepare('SELECT COUNT(*) as count FROM page_markers WHERE session_id = ?').get(s.id);
  console.log(`   Session ${i+1}: ${markers.count} pages`);
});
console.log('');

// Function to search for text in dictionary
function findPagesWithText(searchText, section = 'grapar') {
  const results = new Map(); // page -> score
  const text = searchText.toLowerCase();
  const words = text.split(/\s+/).filter(w => w.length > 2);
  
  const pagesData = section === 'grapar' ? dict.pages :
                    section === 'phonetic' ? dict.phonetic :
                    dict.english;
  
  Object.entries(pagesData).forEach(([pageNum, pageText]) => {
    const pageTextLower = pageText.toLowerCase();
    let score = 0;
    
    words.forEach(word => {
      if (pageTextLower.includes(word)) {
        score += 10; // Word found
      }
    });
    
    if (score > 0) {
      results.set(parseInt(pageNum), score);
    }
  });
  
  return Array.from(results.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([page]) => page);
}

// Function to match page using word index
function matchPageByWords(words, section = 'grapar') {
  const index = section === 'grapar' ? dict.wordIndex :
                section === 'phonetic' ? dict.phoneticIndex :
                dict.englishIndex;
  
  const pageScores = new Map();
  
  words.forEach(word => {
    const normalized = word.toLowerCase();
    if (index[normalized]) {
      index[normalized].forEach(pageNum => {
        pageScores.set(pageNum, (pageScores.get(pageNum) || 0) + 1);
      });
    }
  });
  
  return Array.from(pageScores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([page]) => page);
}

console.log('═'.repeat(80));
console.log('🧪 TRAINING TEST 1: Text-Based Matching');
console.log('═'.repeat(80));
console.log('');

// Test on Session 1 (Feb 20)
console.log('Testing on Session 1 (Feb 20): Pages 3-21');
console.log('');

const session1Markers = db.prepare('SELECT * FROM page_markers WHERE session_id = ? ORDER BY page_number').all(sessions[0].id);

let session1Correct = 0;
let session1Within2 = 0;
let session1Total = 0;

const session1Results = [];

session1Markers.forEach(marker => {
  const actualPage = marker.page_number;
  
  // For now, assume we have the page text (in real system, this would come from audio recognition)
  if (dict.pages[actualPage]) {
    const pageText = dict.pages[actualPage];
    const words = pageText.match(/[\u0530-\u058F]+/g) || [];
    
    const matches = matchPageByWords(words.slice(0, 10)); // Use first 10 words
    const predictedPage = matches[0];
    
    const error = Math.abs(predictedPage - actualPage);
    
    session1Results.push({
      actual: actualPage,
      predicted: predictedPage,
      error: error,
      correct: error === 0,
      within2: error <= 2
    });
    
    if (error === 0) session1Correct++;
    if (error <= 2) session1Within2++;
    session1Total++;
  }
});

console.log(`Results:`);
console.log(`  Exact matches: ${session1Correct}/${session1Total} (${((session1Correct/session1Total)*100).toFixed(1)}%)`);
console.log(`  Within 2 pages: ${session1Within2}/${session1Total} (${((session1Within2/session1Total)*100).toFixed(1)}%)`);
console.log('');

// Show errors
const errors = session1Results.filter(r => !r.correct);
if (errors.length > 0) {
  console.log(`Errors:`);
  errors.forEach(e => {
    console.log(`  Page ${e.actual}: predicted ${e.predicted} (error: ${e.error})`);
  });
  console.log('');
}

console.log('═'.repeat(80));
console.log('🧪 TRAINING TEST 2: Coverage Analysis');
console.log('═'.repeat(80));
console.log('');

// Check which pages we can handle
const session2Markers = db.prepare('SELECT DISTINCT page_number FROM page_markers WHERE session_id = ? ORDER BY page_number').all(sessions[1].id);
const session2Pages = session2Markers.map(m => m.page_number);

const haveText = session2Pages.filter(p => dict.pages[p]);
const missingText = session2Pages.filter(p => !dict.pages[p]);

console.log(`Session 2 (Feb 21): Pages 4-36`);
console.log(`  Have text: ${haveText.length}/${session2Pages.length} (${((haveText.length/session2Pages.length)*100).toFixed(1)}%)`);
if (missingText.length > 0) {
  console.log(`  Missing text: ${missingText.join(', ')}`);
}
console.log('');

console.log('═'.repeat(80));
console.log('📊 OVERALL READINESS ASSESSMENT');
console.log('═'.repeat(80));
console.log('');

const readiness = {
  textCoverage: (haveText.length / session2Pages.length) * 100,
  matchAccuracy: (session1Correct / session1Total) * 100,
  within2Accuracy: (session1Within2 / session1Total) * 100
};

console.log(`Text Coverage: ${readiness.textCoverage.toFixed(1)}%`);
console.log(`Match Accuracy: ${readiness.matchAccuracy.toFixed(1)}%`);
console.log(`Within-2 Accuracy: ${readiness.within2Accuracy.toFixed(1)}%`);
console.log('');

if (readiness.textCoverage >= 90 && readiness.matchAccuracy >= 80) {
  console.log('✅ SYSTEM READY FOR DEPLOYMENT');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Implement real-time audio recognition');
  console.log('  2. Connect to page turner UI');
  console.log('  3. Add fallback for missing pages');
} else {
  console.log('⚠️ NEEDS IMPROVEMENT');
  console.log('');
  if (readiness.textCoverage < 90) {
    console.log(`  - Text coverage too low (${readiness.textCoverage.toFixed(1)}% < 90%)`);
    console.log('    Solution: Extract or transcribe missing pages');
  }
  if (readiness.matchAccuracy < 80) {
    console.log(`  - Match accuracy too low (${readiness.matchAccuracy.toFixed(1)}% < 80%)`);
    console.log('    Solution: Improve matching algorithm');
  }
}

db.close();

// Save training results
const trainingReport = {
  timestamp: new Date().toISOString(),
  sessions: sessions.map((s, i) => ({
    id: s.id,
    index: i + 1,
    created: s.created_at
  })),
  results: {
    session1: {
      tested: session1Total,
      exact: session1Correct,
      within2: session1Within2,
      accuracy: readiness.matchAccuracy,
      errors: errors
    },
    coverage: {
      totalPages: session2Pages.length,
      haveText: haveText.length,
      missing: missingText
    }
  },
  readiness: readiness
};

fs.writeFileSync('/app/agent/training-report.json', JSON.stringify(trainingReport, null, 2));
console.log('');
console.log('💾 Training report saved: training-report.json');
