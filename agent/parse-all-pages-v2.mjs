#!/usr/bin/env node
/**
 * PARSE ALL 183 PAGES - Version 2
 * Better parsing to extract all pages from PDF
 */

import fs from 'fs';

console.log('📖 PARSING ALL 183 PAGES - V2');
console.log('═'.repeat(80));
console.log('');

const fullText = fs.readFileSync('/app/agent/liturgy-full-text.txt', 'utf8');
const lines = fullText.split('\n');

console.log(`📄 Total lines: ${lines.length}`);

// Find all page markers
const pageMarkers = [];
lines.forEach((line, i) => {
  if (line.includes('Էջ/Page')) {
    const match = line.match(/Էջ\/Page\s+(\d+)/);
    if (match) {
      pageMarkers.push({
        page: parseInt(match[1]),
        lineNum: i
      });
    }
  }
});

console.log(`✅ Found ${pageMarkers.length} page markers`);
console.log('');

// Extract text between page markers
const armenianPattern = /[\u0530-\u058F]+/;
const pages = new Map();

for (let i = 0; i < pageMarkers.length; i++) {
  const currentPage = pageMarkers[i].page;
  const startLine = pageMarkers[i].lineNum;
  const endLine = i < pageMarkers.length - 1 ? pageMarkers[i + 1].lineNum : lines.length;
  
  const pageLines = [];
  
  for (let j = startLine; j < endLine; j++) {
    const line = lines[j].trim();
    
    // Skip page markers and English-only lines
    if (line.includes('Էջ/Page')) continue;
    if (line.includes('ՈՏՔԻ ԿԱՆԳՆԻԼ') || line.includes('/Stand')) continue;
    
    // Keep lines with Armenian text
    if (armenianPattern.test(line)) {
      pageLines.push(line);
    }
  }
  
  if (pageLines.length > 0) {
    pages.set(currentPage, pageLines.join('\n'));
  }
}

console.log(`✅ Extracted text for ${pages.size}/183 pages`);
console.log('');

// Show sample
console.log('📝 SAMPLE PAGES:');
console.log('─'.repeat(80));

[1, 3, 8, 10, 20, 30, 45].forEach(pageNum => {
  if (pages.has(pageNum)) {
    const text = pages.get(pageNum);
    const preview = text.substring(0, 80).replace(/\n/g, ' ');
    console.log(`Page ${pageNum}: ${preview}...`);
  } else {
    console.log(`Page ${pageNum}: [no text]`);
  }
});

console.log('');

// Build comprehensive text index
console.log('🔨 BUILDING TEXT INDEX...');

const textIndex = new Map();
const wordIndex = new Map();

pages.forEach((text, pageNum) => {
  // Index full phrases
  const phrases = text.split(/[\n։\.]/);
  
  phrases.forEach(phrase => {
    const trimmed = phrase.trim();
    if (trimmed.length > 3 && armenianPattern.test(trimmed)) {
      const normalized = trimmed.toLowerCase();
      
      if (!textIndex.has(normalized)) {
        textIndex.set(normalized, new Set());
      }
      textIndex.get(normalized).add(pageNum);
      
      // Index individual words
      const words = trimmed.split(/\s+/);
      words.forEach(word => {
        const cleanWord = word.replace(/[,։\.]/g, '').trim();
        if (cleanWord.length > 2 && armenianPattern.test(cleanWord)) {
          const normWord = cleanWord.toLowerCase();
          if (!wordIndex.has(normWord)) {
            wordIndex.set(normWord, new Set());
          }
          wordIndex.get(normWord).add(pageNum);
        }
      });
    }
  });
});

console.log(`✅ Indexed ${textIndex.size} phrases`);
console.log(`✅ Indexed ${wordIndex.size} unique words`);
console.log('');

// Save results
const output = {
  created: new Date().toISOString(),
  source: 'PDF extraction v2',
  totalPages: pages.size,
  totalPhrases: textIndex.size,
  totalWords: wordIndex.size,
  pages: Object.fromEntries(pages),
  phraseIndex: Object.fromEntries(
    Array.from(textIndex.entries()).map(([text, pgs]) => [
      text,
      Array.from(pgs).sort((a,b) => a-b)
    ])
  ),
  wordIndex: Object.fromEntries(
    Array.from(wordIndex.entries()).map(([word, pgs]) => [
      word,
      Array.from(pgs).sort((a,b) => a-b)
    ])
  )
};

fs.writeFileSync('/app/agent/liturgy-complete-index.json', JSON.stringify(output, null, 2));

console.log('💾 SAVED: liturgy-complete-index.json');
console.log('');

console.log('═'.repeat(80));
console.log('📊 FINAL STATISTICS');
console.log('═'.repeat(80));
console.log(`   Pages covered: ${pages.size}/183 (${((pages.size/183)*100).toFixed(1)}%)`);
console.log(`   Phrases indexed: ${textIndex.size}`);
console.log(`   Words indexed: ${wordIndex.size}`);

// Find missing pages
const missing = [];
for (let i = 1; i <= 183; i++) {
  if (!pages.has(i)) missing.push(i);
}

if (missing.length > 0) {
  console.log(`   Missing: ${missing.length} pages`);
  if (missing.length <= 30) {
    console.log(`   Pages: ${missing.join(', ')}`);
  }
}

console.log('');

// Show most common words (for debugging)
const wordFreq = Array.from(wordIndex.entries())
  .map(([word, pgs]) => ({ word, pages: pgs.size }))
  .sort((a, b) => b.pages - a.pages)
  .slice(0, 10);

console.log('🔤 TOP 10 MOST COMMON WORDS:');
wordFreq.forEach(({ word, pages }) => {
  console.log(`   ${word} (${pages} pages)`);
});

console.log('');
console.log('✅ READY FOR TEXT MATCHING!');
