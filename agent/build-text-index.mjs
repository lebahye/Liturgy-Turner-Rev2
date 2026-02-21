#!/usr/bin/env node
/**
 * BUILD COMPLETE TEXT INDEX - All 183 Pages
 * 
 * Extract every Armenian word/phrase from liturgy
 * Map to page numbers for text-based recognition
 */

import fs from 'fs';
import path from 'path';

console.log('📚 BUILDING COMPLETE TEXT INDEX');
console.log('═'.repeat(80));
console.log('');

// Load existing liturgy text (if any)
const liturgyDbPath = '/app/agent/skills/liturgy-audio-controller/data/liturgy-database.json';
let existingDb = { entries: [] };

try {
  existingDb = JSON.parse(fs.readFileSync(liturgyDbPath, 'utf8'));
  console.log(`📖 Found existing database: ${existingDb.entries.length} entries`);
} catch (e) {
  console.log('📖 No existing database, will create new');
}

// Build text index from what we have
const textIndex = new Map(); // armenian text -> [page numbers]
const pageTexts = new Map();  // page number -> full text

existingDb.entries.forEach(entry => {
  const page = entry.page;
  
  if (!pageTexts.has(page)) {
    pageTexts.set(page, []);
  }
  
  // Add full Armenian text
  if (entry.armenian) {
    pageTexts.get(page).push(entry.armenian);
    
    // Add to text index
    const normalized = entry.armenian.toLowerCase().trim();
    if (!textIndex.has(normalized)) {
      textIndex.set(normalized, new Set());
    }
    textIndex.get(normalized).add(page);
  }
  
  // Add keywords
  if (entry.keywords) {
    entry.keywords.forEach(kw => {
      const normalized = kw.toLowerCase().trim();
      if (!textIndex.has(normalized)) {
        textIndex.set(normalized, new Set());
      }
      textIndex.get(normalized).add(page);
    });
  }
});

console.log('');
console.log('📊 TEXT INDEX STATISTICS:');
console.log(`   Unique phrases: ${textIndex.size}`);
console.log(`   Pages with text: ${pageTexts.size}/183`);
console.log('');

// Show sample mappings
console.log('📝 SAMPLE TEXT-TO-PAGE MAPPINGS:');
console.log('─'.repeat(80));

let count = 0;
for (const [text, pages] of textIndex) {
  if (count++ >= 10) break;
  const pageList = Array.from(pages).sort((a,b) => a-b).join(', ');
  console.log(`   "${text}" → Pages: ${pageList}`);
}

console.log('');

// Identify missing pages
const missingPages = [];
for (let i = 1; i <= 183; i++) {
  if (!pageTexts.has(i)) {
    missingPages.push(i);
  }
}

console.log(`⚠️ MISSING PAGES: ${missingPages.length}/183`);
if (missingPages.length > 0 && missingPages.length <= 20) {
  console.log(`   Pages: ${missingPages.join(', ')}`);
} else if (missingPages.length > 20) {
  console.log(`   First 20: ${missingPages.slice(0, 20).join(', ')}...`);
}

console.log('');

// Save text index
const outputPath = '/app/agent/text-index.json';
const indexData = {
  created: new Date().toISOString(),
  totalPhrases: textIndex.size,
  pagesCovered: pageTexts.size,
  totalPages: 183,
  index: Object.fromEntries(
    Array.from(textIndex.entries()).map(([text, pages]) => [
      text,
      Array.from(pages).sort((a,b) => a-b)
    ])
  ),
  pageTexts: Object.fromEntries(pageTexts)
};

fs.writeFileSync(outputPath, JSON.stringify(indexData, null, 2));

console.log(`✅ TEXT INDEX SAVED: ${outputPath}`);
console.log('');
console.log('═'.repeat(80));

// Export search function
export function searchText(armenianText) {
  const normalized = armenianText.toLowerCase().trim();
  return indexData.index[normalized] || [];
}

console.log('');
console.log('💡 NEXT STEP: Need to populate all 183 pages with Armenian text');
console.log('   Current: Only 15 pages have text');
console.log('   Needed: Extract text from PDF for all 183 pages');
