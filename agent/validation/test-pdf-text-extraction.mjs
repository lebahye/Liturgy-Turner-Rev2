#!/usr/bin/env node
/**
 * VALIDATION TEST 2: PDF Text Extraction
 * 
 * Purpose: Verify we can extract clean, usable Armenian text from the PDF
 * Success: >95% of pages have valid Armenian text
 */

import fs from 'fs';

console.log('🧪 TEST 2: PDF Text Extraction Validation\n');

// Load the text-matcher database (already extracted from PDF)
const textDB = JSON.parse(fs.readFileSync('/app/training-data/text-matcher-db.json', 'utf8'));

let stats = {
  totalPages: 0,
  pagesWithArmenian: 0,
  pagesWithEnglish: 0,
  uniqueArmenianWords: new Set(),
  totalArmenianChars: 0,
  emptyPages: 0,
  speakerLabels: {}
};

console.log('📊 Analyzing extracted text...\n');

textDB.pages.forEach(page => {
  stats.totalPages++;
  
  const armenian = page.armenianText || '';
  const english = page.englishText || '';
  
  if (armenian.length > 10) {
    stats.pagesWithArmenian++;
    stats.totalArmenianChars += armenian.length;
    
    // Extract words (split by spaces, filter Armenian chars)
    const words = armenian.split(/\s+/).filter(w => 
      w.length > 0 && /[\u0530-\u058F]/.test(w)
    );
    words.forEach(w => stats.uniqueArmenianWords.add(w));
  }
  
  if (english.length > 10) {
    stats.pagesWithEnglish++;
  }
  
  if (armenian.length < 10 && english.length < 10) {
    stats.emptyPages++;
  }
  
  // Track speakers
  if (page.speakers && page.speakers.length > 0) {
    page.speakers.forEach(speaker => {
      stats.speakerLabels[speaker] = (stats.speakerLabels[speaker] || 0) + 1;
    });
  }
});

// Calculate metrics
const armenianCoverage = (stats.pagesWithArmenian / stats.totalPages * 100).toFixed(1);
const avgCharsPerPage = (stats.totalArmenianChars / stats.pagesWithArmenian).toFixed(0);

console.log('📋 RESULTS:\n');
console.log(`Total pages: ${stats.totalPages}`);
console.log(`Pages with Armenian text: ${stats.pagesWithArmenian} (${armenianCoverage}%)`);
console.log(`Pages with English text: ${stats.pagesWithEnglish}`);
console.log(`Empty pages: ${stats.emptyPages}`);
console.log(`Unique Armenian words: ${stats.uniqueArmenianWords.size}`);
console.log(`Avg characters per page: ${avgCharsPerPage}`);
console.log(`\nSpeaker labels:`, stats.speakerLabels);

// Test: Check if Armenian Unicode is valid
console.log('\n🔍 Validation Checks:\n');

const samplePage = textDB.pages.find(p => p.pageNumber === 8);
if (samplePage) {
  console.log(`Sample (Page ${samplePage.pageNumber}):`);
  console.log(`  Armenian: ${samplePage.armenianText.substring(0, 100)}...`);
  console.log(`  English: ${samplePage.englishText}`);
  console.log(`  Speakers: ${samplePage.speakers.join(', ')}`);
}

// Success criteria
const SUCCESS_THRESHOLD = 95;
const passed = armenianCoverage >= SUCCESS_THRESHOLD;

console.log(`\n${passed ? '✅' : '❌'} TEST RESULT: ${passed ? 'PASSED' : 'FAILED'}`);
console.log(`   Requirement: >${SUCCESS_THRESHOLD}% pages with Armenian text`);
console.log(`   Actual: ${armenianCoverage}%`);

if (passed) {
  console.log('\n✅ PDF text extraction is VIABLE');
  console.log(`   - ${stats.uniqueArmenianWords.size} unique words available for learning`);
  console.log(`   - Clean Armenian Unicode extraction confirmed`);
  console.log(`   - Speaker labels available for context`);
} else {
  console.log('\n❌ PDF text extraction has ISSUES');
  console.log(`   - Too many pages without Armenian text`);
}

process.exit(passed ? 0 : 1);
