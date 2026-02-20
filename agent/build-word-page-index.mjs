/**
 * Build Word-to-Page Index
 * Maps each Armenian word to pages where it appears
 */

import fs from 'fs';

console.log('=== BUILDING WORD-TO-PAGE INDEX ===');
console.log();

// Load text database
const textDb = JSON.parse(fs.readFileSync('/app/training-data/text-matcher-db.json', 'utf8'));
console.log('📖 Loaded text database');
console.log('  Pages:', textDb.pages.length);

// Build index: word -> [page numbers]
const wordToPages = {};
let totalWords = 0;

textDb.pages.forEach((page, idx) => {
  const pageNum = page.page;
  const words = page.words || [];
  
  words.forEach(word => {
    if (!wordToPages[word]) {
      wordToPages[word] = [];
    }
    if (!wordToPages[word].includes(pageNum)) {
      wordToPages[word].push(pageNum);
    }
    totalWords++;
  });
});

const uniqueWords = Object.keys(wordToPages).length;
console.log();
console.log('📊 INDEX STATISTICS:');
console.log('  Unique words:', uniqueWords);
console.log('  Total word occurrences:', totalWords);
console.log('  Average occurrences per word:', (totalWords / uniqueWords).toFixed(1));

// Analyze word distribution
const wordFrequencies = Object.entries(wordToPages)
  .map(([word, pages]) => ({ word, pageCount: pages.length }))
  .sort((a, b) => b.pageCount - a.pageCount);

console.log();
console.log('🔝 MOST COMMON WORDS (appear on many pages):');
wordFrequencies.slice(0, 20).forEach(({word, pageCount}) => {
  console.log(`  ${word}: ${pageCount} pages`);
});

console.log();
console.log('🎯 UNIQUE WORDS (appear on few pages):');
const uniqueToPage = wordFrequencies.filter(w => w.pageCount <= 3);
console.log(`  ${uniqueToPage.length} words appear on ≤3 pages`);
uniqueToPage.slice(0, 10).forEach(({word, pageCount}) => {
  const pages = wordToPages[word].join(', ');
  console.log(`  ${word}: pages ${pages}`);
});

// Calculate words per page
const wordsPerPage = {};
textDb.pages.forEach(page => {
  wordsPerPage[page.page] = (page.words || []).length;
});

const avgWordsPerPage = Object.values(wordsPerPage).reduce((a,b) => a+b, 0) / Object.keys(wordsPerPage).length;
console.log();
console.log('📄 WORDS PER PAGE:');
console.log('  Average:', avgWordsPerPage.toFixed(1));
console.log('  Min:', Math.min(...Object.values(wordsPerPage)));
console.log('  Max:', Math.max(...Object.values(wordsPerPage)));

// Save index
const indexData = {
  timestamp: new Date().toISOString(),
  wordToPages,
  statistics: {
    uniqueWords,
    totalOccurrences: totalWords,
    avgOccurrencesPerWord: totalWords / uniqueWords,
    avgWordsPerPage,
    commonWords: wordFrequencies.slice(0, 50),
    uniqueWords: uniqueToPage.slice(0, 50)
  }
};

fs.writeFileSync('./memory/word-page-index.json', JSON.stringify(indexData, null, 2));
console.log();
console.log('💾 SAVED INDEX:');
console.log('  File: memory/word-page-index.json');
console.log('  Size:', (fs.statSync('./memory/word-page-index.json').size / 1024).toFixed(1), 'KB');

console.log();
console.log('✅ INDEX COMPLETE');

