#!/usr/bin/env node
import Database from 'better-sqlite3';
import fs from 'fs';

const dict = JSON.parse(fs.readFileSync('liturgy-complete-index.json', 'utf8'));
const db = new Database('/app/data/liturgy-turner.db', { readonly: true });

console.log('🔍 ERROR ANALYSIS');
console.log('═'.repeat(80));
console.log('');

// Analyze page 9 vs 7
console.log('ERROR 1: Page 9 predicted as 7');
console.log('─'.repeat(80));

const page9Text = dict.pages[9] || '[MISSING]';
const page7Text = dict.pages[7] || '[MISSING]';

console.log('\nPage 9 text:');
console.log(page9Text.substring(0, 200));
console.log('\nPage 7 text:');
console.log(page7Text.substring(0, 200));

// Extract words
const page9Words = page9Text.match(/[\u0530-\u058F]+/g) || [];
const page7Words = page7Text.match(/[\u0530-\u058F]+/g) || [];

console.log('\nPage 9 unique words:', new Set(page9Words.map(w => w.toLowerCase())).size);
console.log('Page 7 unique words:', new Set(page7Words.map(w => w.toLowerCase())).size);

// Find overlap
const page9Set = new Set(page9Words.map(w => w.toLowerCase()));
const page7Set = new Set(page7Words.map(w => w.toLowerCase()));
const overlap = [...page9Set].filter(w => page7Set.has(w));
console.log('Overlapping words:', overlap.length);

console.log('');
console.log('═'.repeat(80));
console.log('ERROR 2: Page 15 predicted as 7');
console.log('─'.repeat(80));

const page15Text = dict.pages[15] || '[MISSING]';

console.log('\nPage 15 text:');
console.log(page15Text.substring(0, 200));

const page15Words = page15Text.match(/[\u0530-\u058F]+/g) || [];
const page15Set = new Set(page15Words.map(w => w.toLowerCase()));
const overlap15_7 = [...page15Set].filter(w => page7Set.has(w));

console.log('\nPage 15 unique words:', page15Set.size);
console.log('Overlap with page 7:', overlap15_7.length);
console.log('');

// The problem: liturgical text has LOTS of repeated phrases
console.log('💡 ROOT CAUSE: Liturgical text has many repeated phrases');
console.log('');
console.log('Common words appear on many pages:');
const commonWords = ['տէր', 'աստուած', 'սուրբ', 'ամէն', 'քեզ'];
commonWords.forEach(word => {
  const pages = dict.wordIndex[word] || [];
  console.log(`  ${word}: ${pages.length} pages`);
});

console.log('');
console.log('SOLUTION: Need SEQUENTIAL context + temporal matching');
console.log('  - Track current page');
console.log('  - Prefer next page (temporal boost)');
console.log('  - Use RARE words for discrimination');

db.close();
