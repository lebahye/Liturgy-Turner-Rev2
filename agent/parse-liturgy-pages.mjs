#!/usr/bin/env node
/**
 * PARSE LITURGY TEXT INTO 183 PAGES
 * 
 * Extract Armenian text for each page from the full PDF text
 * Build complete text index for ALL pages
 */

import fs from 'fs';

console.log('📖 PARSING LITURGY INTO 183 PAGES');
console.log('═'.repeat(80));
console.log('');

// Load full text
const fullText = fs.readFileSync('/app/agent/liturgy-full-text.txt', 'utf8');
const lines = fullText.split('\n');

console.log(`📄 Total lines: ${lines.length}`);
console.log('');

// Look for page markers in format "Էջ/Page 1" or just page numbers
const pagePattern = /Էջ\/Page\s+(\d+)|^Page\s+(\d+)|^\s*(\d+)\s*$/;
const armenianPattern = /[\u0530-\u058F]+/; // Armenian Unicode range

const pages = new Map();
let currentPage = null;
let pageText = [];

console.log('🔍 Scanning for pages...');

lines.forEach((line, i) => {
  const trimmed = line.trim();
  
  // Check if this line contains a page number
  const match = trimmed.match(pagePattern);
  if (match) {
    const pageNum = parseInt(match[1] || match[2] || match[3]);
    
    // Save previous page if we had one
    if (currentPage !== null && pageText.length > 0) {
      const text = pageText.filter(t => t.trim()).join('\n');
      if (text) {
        pages.set(currentPage, text);
      }
    }
    
    // Start new page
    if (pageNum >= 1 && pageNum <= 183) {
      currentPage = pageNum;
      pageText = [];
    }
  } else if (currentPage !== null) {
    // Add to current page if it has Armenian text
    if (armenianPattern.test(trimmed)) {
      pageText.push(trimmed);
    }
  }
});

// Save last page
if (currentPage !== null && pageText.length > 0) {
  const text = pageText.filter(t => t.trim()).join('\n');
  if (text) {
    pages.set(currentPage, text);
  }
}

console.log(`✅ Found text for ${pages.size} pages`);
console.log('');

// Show sample
console.log('📝 SAMPLE PAGES:');
console.log('─'.repeat(80));

[1, 8, 30, 45].forEach(pageNum => {
  if (pages.has(pageNum)) {
    const text = pages.get(pageNum);
    console.log(`Page ${pageNum}:`);
    console.log(`   ${text.substring(0, 100)}...`);
    console.log('');
  }
});

// Build text index
console.log('🔨 BUILDING TEXT INDEX...');

const textIndex = new Map();

pages.forEach((text, pageNum) => {
  // Split into phrases (by newline and punctuation)
  const phrases = text.split(/[\n:\.։]/);
  
  phrases.forEach(phrase => {
    const trimmed = phrase.trim();
    if (trimmed && armenianPattern.test(trimmed)) {
      const normalized = trimmed.toLowerCase();
      
      if (!textIndex.has(normalized)) {
        textIndex.set(normalized, new Set());
      }
      textIndex.get(normalized).add(pageNum);
      
      // Also index individual words
      const words = trimmed.split(/\s+/);
      words.forEach(word => {
        if (word.length > 2 && armenianPattern.test(word)) {
          const normWord = word.toLowerCase();
          if (!textIndex.has(normWord)) {
            textIndex.set(normWord, new Set());
          }
          textIndex.get(normWord).add(pageNum);
        }
      });
    }
  });
});

console.log(`✅ Indexed ${textIndex.size} unique phrases/words`);
console.log('');

// Save results
const output = {
  created: new Date().toISOString(),
  source: 'PDF extraction',
  totalPages: pages.size,
  totalPhrases: textIndex.size,
  pages: Object.fromEntries(pages),
  index: Object.fromEntries(
    Array.from(textIndex.entries()).map(([text, pages]) => [
      text,
      Array.from(pages).sort((a,b) => a-b)
    ])
  )
};

const outputPath = '/app/agent/liturgy-text-index-complete.json';
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

console.log(`💾 SAVED: ${outputPath}`);
console.log('');
console.log('═'.repeat(80));
console.log('📊 FINAL STATISTICS');
console.log('═'.repeat(80));
console.log(`   Pages with text: ${pages.size}/183`);
console.log(`   Unique phrases/words: ${textIndex.size}`);
console.log(`   Coverage: ${((pages.size/183)*100).toFixed(1)}%`);
console.log('');

if (pages.size < 183) {
  const missing = [];
  for (let i = 1; i <= 183; i++) {
    if (!pages.has(i)) missing.push(i);
  }
  console.log(`⚠️ Missing ${missing.length} pages`);
  if (missing.length <= 20) {
    console.log(`   Pages: ${missing.join(', ')}`);
  }
}

console.log('');
console.log('✅ READY FOR TEXT-BASED PAGE MATCHING!');
