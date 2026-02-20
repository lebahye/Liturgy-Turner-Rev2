/**
 * Autonomous Training Session
 * Goal: Improve Armenian learner by extracting more patterns
 */

import fs from 'fs';
import path from 'path';

console.log('=== AUTONOMOUS TRAINING SESSION ===');
console.log('Starting:', new Date().toISOString());
console.log();

// Load current state
console.log('📊 CURRENT STATE:');
const learnedPatterns = JSON.parse(fs.readFileSync('./skills/armenian-learner/data/learned-patterns.json', 'utf8'));
console.log('  Words learned:', learnedPatterns.patterns.length);

const fingerprints = JSON.parse(fs.readFileSync('/app/training-data/fingerprints.json', 'utf8'));
console.log('  Page fingerprints:', fingerprints.length);

const textDb = JSON.parse(fs.readFileSync('/app/training-data/text-matcher-db.json', 'utf8'));
console.log('  Text DB pages:', textDb.pages?.length || Object.keys(textDb).length);

const timestamps = JSON.parse(fs.readFileSync('/app/training-data/page-timestamps-mapped.json', 'utf8'));
console.log('  Page timestamps:', timestamps.length);

console.log();

// Analyze coverage
console.log('🔍 ANALYZING COVERAGE:');

// Words per page
const wordsPerPage = {};
learnedPatterns.patterns.forEach(p => {
  if (p.contexts && p.contexts.length > 0) {
    p.contexts.forEach(ctx => {
      const page = ctx.page || 'unknown';
      wordsPerPage[page] = (wordsPerPage[page] || 0) + 1;
    });
  }
});

const avgWordsPerPage = Object.values(wordsPerPage).reduce((a,b) => a+b, 0) / Object.keys(wordsPerPage).length;
console.log('  Average words per page:', avgWordsPerPage.toFixed(1));
console.log('  Pages with patterns:', Object.keys(wordsPerPage).length);
console.log('  Pages without patterns:', 183 - Object.keys(wordsPerPage).length);

// Find weak pages (few patterns)
const weakPages = Object.entries(wordsPerPage)
  .filter(([page, count]) => count < 5)
  .sort((a, b) => a[1] - b[1]);

console.log();
console.log('⚠️  WEAK PAGES (< 5 words):');
weakPages.slice(0, 10).forEach(([page, count]) => {
  console.log(`  Page ${page}: ${count} words`);
});

console.log();
console.log('📈 RECOMMENDATIONS:');
console.log('  1. Extract more patterns from weak pages');
console.log('  2. Learn common words (repeated across pages)');
console.log('  3. Focus on page transitions');
console.log('  4. Build word-to-page index for faster lookup');

console.log();
console.log('💾 SAVING ANALYSIS...');

const analysis = {
  timestamp: new Date().toISOString(),
  currentWordCount: learnedPatterns.patterns.length,
  pagesWithPatterns: Object.keys(wordsPerPage).length,
  avgWordsPerPage: avgWordsPerPage,
  weakPages: weakPages.slice(0, 20),
  recommendations: [
    'Extract more patterns from weak pages',
    'Learn common words repeated across pages',
    'Focus on page transition markers',
    'Build word-to-page index'
  ]
};

fs.writeFileSync('./memory/training-analysis.json', JSON.stringify(analysis, null, 2));
console.log('  Saved to: memory/training-analysis.json');

console.log();
console.log('✅ ANALYSIS COMPLETE');
console.log('Next: Implement hybrid word recognition system');

