/**
 * Extract Armenian words from text database
 */

import fs from 'fs';

console.log('=== EXTRACTING ARMENIAN WORDS ===');
console.log();

const textDb = JSON.parse(fs.readFileSync('/app/training-data/text-matcher-db.json', 'utf8'));
console.log('📖 Loaded', textDb.pages.length, 'pages');

// Extract words from Armenian text
const wordToPages = {};
let totalWords = 0;

textDb.pages.forEach(page => {
  const pageNum = page.pageNumber;
  const armenianText = page.armenianText || '';
  
  // Split into words (Armenian characters only)
  const words = armenianText
    .split(/[\s\t\n,.։;:!?()«»\[\]]+/)
    .filter(w => w.match(/[\u0531-\u058F]+/)) // Armenian Unicode range
    .filter(w => w.length > 1); // Skip single letters
  
  words.forEach(word => {
    if (!wordToPages[word]) {
      wordToPages[word] = new Set();
    }
    wordToPages[word].add(pageNum);
    totalWords++;
  });
});

// Convert Sets to Arrays
Object.keys(wordToPages).forEach(word => {
  wordToPages[word] = Array.from(wordToPages[word]).sort((a,b) => a-b);
});

const uniqueWords = Object.keys(wordToPages).length;
console.log('📊 EXTRACTION RESULTS:');
console.log('  Unique Armenian words:', uniqueWords);
console.log('  Total occurrences:', totalWords);
console.log('  Average per word:', (totalWords / uniqueWords).toFixed(1));

// Compare with learned patterns
const learnedPatterns = JSON.parse(fs.readFileSync('./skills/armenian-learner/data/learned-patterns.json', 'utf8'));
const learnedWords = new Set(learnedPatterns.patterns.map(p => p.armenianWord));

const wordsInText = new Set(Object.keys(wordToPages));
const overlap = [...learnedWords].filter(w => wordsInText.has(w));

console.log();
console.log('🔍 COMPARISON WITH LEARNED PATTERNS:');
console.log('  Words learned from audio:', learnedWords.size);
console.log('  Words in liturgy text:', wordsInText.size);
console.log('  Overlap (learned AND in text):', overlap.length);
console.log('  Only in audio:', learnedWords.size - overlap.length);
console.log('  Only in text:', wordsInText.size - overlap.length);

// Most common words
const wordFreqs = Object.entries(wordToPages)
  .map(([word, pages]) => ({ word, count: pages.length, pages }))
  .sort((a, b) => b.count - a.count);

console.log();
console.log('🔝 TOP 20 COMMON WORDS:');
wordFreqs.slice(0, 20).forEach(({word, count}) => {
  const learned = learnedWords.has(word) ? '✅' : '❌';
  console.log(`  ${learned} ${word}: ${count} pages`);
});

console.log();
console.log('🎯 UNIQUE DISCRIMINATING WORDS (1-3 pages):');
const discriminating = wordFreqs.filter(w => w.count >= 1 && w.count <= 3);
console.log(`  Found ${discriminating.length} discriminating words`);
discriminating.slice(0, 15).forEach(({word, count, pages}) => {
  const learned = learnedWords.has(word) ? '✅' : '❌';
  console.log(`  ${learned} ${word}: pages [${pages.join(', ')}]`);
});

// Save enhanced index
const index = {
  timestamp: new Date().toISOString(),
  wordToPages,
  statistics: {
    uniqueWords,
    totalOccurrences: totalWords,
    learnedWords: learnedWords.size,
    overlapWithLearned: overlap.length,
    discriminatingWords: discriminating.length
  },
  topCommon: wordFreqs.slice(0, 100).map(w => ({ word: w.word, pageCount: w.count })),
  discriminating: discriminating.slice(0, 200).map(w => ({ word: w.word, pages: w.pages }))
};

fs.writeFileSync('./memory/armenian-word-index.json', JSON.stringify(index, null, 2));
const sizeMB = (fs.statSync('./memory/armenian-word-index.json').size / 1024 / 1024).toFixed(2);
console.log();
console.log('💾 SAVED ENHANCED INDEX:');
console.log('  File: memory/armenian-word-index.json');
console.log('  Size:', sizeMB, 'MB');

console.log();
console.log('✅ WORD EXTRACTION COMPLETE');

