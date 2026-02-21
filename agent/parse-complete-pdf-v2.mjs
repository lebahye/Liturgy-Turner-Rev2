#!/usr/bin/env node
/**
 * PARSE ALL 183 PAGES - SIMPLE APPROACH
 * Just extract ALL Armenian text per page
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
const execAsync = promisify(exec);

const pdfPath = '/app/uploads/pdfs/943e74792a5e274c136d5b3cae901820.pdf';

console.log('📖 PARSING ALL 183 PAGES - SIMPLE EXTRACTION');
console.log('═'.repeat(80));
console.log('\n');

const graparPages = new Map();
let totalExtracted = 0;

for (let pdfPage = 1; pdfPage <= 183; pdfPage++) {
  try {
    const { stdout } = await execAsync(`pdftotext -f ${pdfPage} -l ${pdfPage} "${pdfPath}" -`);
    
    // Find liturgy page number
    const pageMatch = stdout.match(/Էջ\/[Pp]age\s+(\d+)/);
    if (!pageMatch) continue;
    
    const liturgyPage = parseInt(pageMatch[1]);
    
    // Extract ALL lines with Armenian Unicode characters
    const lines = stdout.split('\n');
    const armenianLines = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip markers
      if (trimmed.includes('Էջ/') || trimmed.includes('ՈՏՔԻ ԿԱՆԳՆԻԼ') || 
          trimmed.includes('/Stand') || trimmed.includes('/STAND') ||
          trimmed.includes('ԿԱՆԳՆԻԼ') || trimmed.includes('/KNEEL')) continue;
      
      // Keep if it has Armenian Unicode
      if (/[\u0530-\u058F]{3,}/.test(trimmed)) {
        armenianLines.push(trimmed);
      }
    }
    
    if (armenianLines.length > 0) {
      const existing = graparPages.get(liturgyPage) || '';
      const newText = armenianLines.join('\n');
      graparPages.set(liturgyPage, existing ? existing + '\n' + newText : newText);
      totalExtracted++;
    }
    
    if (pdfPage % 20 === 0) {
      process.stdout.write(`  Processed ${pdfPage}/183 PDF pages, extracted ${totalExtracted} liturgy pages...\r`);
    }
  } catch (e) {}
}

console.log(`\n✅ Processed all 183 PDF pages`);
console.log(`✅ Extracted ${graparPages.size} unique liturgy pages\n`);

// Clean up
const cleanPages = new Map();
graparPages.forEach((text, pageNum) => {
  const clean = text.trim().replace(/\n\n+/g, '\n');
  if (clean.length > 10) {
    cleanPages.set(pageNum, clean);
  }
});

// Build word index
const wordIndex = new Map();
let totalWords = 0;

cleanPages.forEach((text, pageNum) => {
  const words = text.match(/[\u0530-\u058F]+/g) || [];
  words.forEach(word => {
    const normalized = word.toLowerCase();
    if (normalized.length > 2) {
      totalWords++;
      if (!wordIndex.has(normalized)) {
        wordIndex.set(normalized, new Set());
      }
      wordIndex.get(normalized).add(pageNum);
    }
  });
});

console.log('📊 FINAL STATISTICS:');
console.log(`   Liturgy pages with text: ${cleanPages.size}/183`);
console.log(`   Total Armenian words: ${totalWords}`);
console.log(`   Unique words indexed: ${wordIndex.size}`);
console.log('');

// Save
const output = {
  created: new Date().toISOString(),
  source: 'Badarak-page-turner-V3-2-21-26.pdf',
  totalPages: cleanPages.size,
  totalWords: wordIndex.size,
  pages: Object.fromEntries(cleanPages),
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

// Test coverage
const testRange = Array.from({length: 33}, (_, i) => i + 3); // 3-35
const covered = testRange.filter(p => cleanPages.has(p));
const missing = testRange.filter(p => !cleanPages.has(p));

console.log('═'.repeat(80));
console.log('🎯 YOUR TEST RANGE (pages 3-35):');
console.log('═'.repeat(80));
console.log(`   Pages tested: ${testRange.length}`);
console.log(`   Coverage: ${covered.length}/${testRange.length} (${((covered.length/testRange.length)*100).toFixed(1)}%)`);

if (missing.length > 0) {
  console.log(`   Missing pages: ${missing.join(', ')}`);
}
console.log('');

// Show samples
console.log('📝 SAMPLE PAGES:');
[3, 8, 15, 20, 35].forEach(pageNum => {
  if (cleanPages.has(pageNum)) {
    const text = cleanPages.get(pageNum);
    const preview = text.substring(0, 60).replace(/\n/g, ' ');
    console.log(`   Page ${pageNum}: ${preview}...`);
  } else {
    console.log(`   Page ${pageNum}: [no text extracted]`);
  }
});

console.log('');
console.log('✅ READY FOR TEXT-BASED MATCHING!');
