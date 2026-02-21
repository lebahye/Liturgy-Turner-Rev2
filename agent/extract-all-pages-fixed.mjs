#!/usr/bin/env node
/**
 * EXTRACT ALL 183 PAGES - FIXED
 * PDF page numbers != Liturgy page numbers
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);

console.log('📖 EXTRACTING ALL 183 PAGES (CORRECTED)');
console.log('═'.repeat(80));
console.log('');

const pdfPath = '/app/agent/liturgy.pdf';
const pages = new Map();

console.log('🔍 Scanning all PDF pages...');
console.log('');

// Extract text from each PDF page and find its liturgy page number
for (let pdfPage = 1; pdfPage <= 183; pdfPage++) {
  try {
    const { stdout } = await execAsync(`pdftotext -f ${pdfPage} -l ${pdfPage} "${pdfPath}" -`);
    
    // Find liturgy page number
    const match = stdout.match(/Էջ\/Page\s+(\d+)/);
    
    if (match) {
      const liturgyPage = parseInt(match[1]);
      
      // Extract Armenian text
      const lines = stdout.split('\n');
      const armenianLines = lines.filter(line => {
        const trimmed = line.trim();
        if (trimmed.includes('Էջ/Page')) return false;
        if (trimmed.includes('ՈՏՔԻ ԿԱՆԳՆԻԼ') || trimmed.includes('/Stand')) return false;
        return /[\u0530-\u058F]/.test(trimmed);
      });
      
      if (armenianLines.length > 0) {
        const existing = pages.get(liturgyPage) || '';
        pages.set(liturgyPage, existing + '\n' + armenianLines.join('\n'));
      }
      
      if (pdfPage % 20 === 0) {
        console.log(`   Processed ${pdfPage}/183 PDF pages...`);
      }
    }
  } catch (e) {
    // Skip pages with errors
  }
}

console.log(`✅ Completed scanning all 183 PDF pages`);
console.log(`✅ Extracted text for ${pages.size} liturgy pages`);
console.log('');

// Clean up and save
const cleanedPages = new Map();
pages.forEach((text, pageNum) => {
  const cleaned = text.trim().replace(/\n\n+/g, '\n');
  if (cleaned.length > 0) {
    cleanedPages.set(pageNum, cleaned);
  }
});

// Build index
const wordIndex = new Map();
cleanedPages.forEach((text, pageNum) => {
  const words = text.match(/[\u0530-\u058F]+/g) || [];
  words.forEach(word => {
    const normalized = word.toLowerCase();
    if (normalized.length > 2) {
      if (!wordIndex.has(normalized)) {
        wordIndex.set(normalized, new Set());
      }
      wordIndex.get(normalized).add(pageNum);
    }
  });
});

const output = {
  created: new Date().toISOString(),
  source: 'PDF extraction - corrected mapping',
  totalPages: cleanedPages.size,
  totalWords: wordIndex.size,
  pages: Object.fromEntries(cleanedPages),
  wordIndex: Object.fromEntries(
    Array.from(wordIndex.entries()).map(([word, pgs]) => [
      word,
      Array.from(pgs).sort((a,b) => a-b)
    ])
  )
};

fs.writeFileSync('/app/agent/liturgy-complete-index.json', JSON.stringify(output, null, 2));

console.log('═'.repeat(80));
console.log('📊 FINAL STATISTICS');
console.log('═'.repeat(80));
console.log(`   Liturgy pages extracted: ${cleanedPages.size}/183`);
console.log(`   Words indexed: ${wordIndex.size}`);
console.log('');

// Show coverage for your test range
const testPages = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35];
const covered = testPages.filter(p => cleanedPages.has(p));
console.log(`🎯 YOUR TEST RANGE (pages 3-35):`);
console.log(`   Covered: ${covered.length}/${testPages.length} (${((covered.length/testPages.length)*100).toFixed(1)}%)`);

const missing = testPages.filter(p => !cleanedPages.has(p));
if (missing.length > 0) {
  console.log(`   Missing: ${missing.join(', ')}`);
}

console.log('');
console.log('💾 SAVED: liturgy-complete-index.json');
console.log('✅ READY FOR TEXT MATCHING!');
