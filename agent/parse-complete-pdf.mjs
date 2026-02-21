#!/usr/bin/env node
/**
 * PARSE ALL 183 PAGES - THREE SECTIONS
 * Grapar Armenian / Phonetic Armenian / English
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
const execAsync = promisify(exec);

const pdfPath = '/app/uploads/pdfs/943e74792a5e274c136d5b3cae901820.pdf';

console.log('📖 PARSING ALL 183 PAGES - THREE SECTIONS');
console.log('═'.repeat(80));
console.log('');

const pages = {
  grapar: new Map(),    // Original Armenian
  phonetic: new Map(),  // Transliteration
  english: new Map()    // Translation
};

console.log('🔍 Extracting text from all pages...\n');

for (let pdfPage = 1; pdfPage <= 183; pdfPage++) {
  try {
    const { stdout } = await execAsync(`pdftotext -f ${pdfPage} -l ${pdfPage} "${pdfPath}" -`);
    
    // Find liturgy page number
    const pageMatch = stdout.match(/Էջ\/[Pp]age\s+(\d+)/);
    if (!pageMatch) continue;
    
    const liturgyPage = parseInt(pageMatch[1]);
    const lines = stdout.split('\n');
    
    // Separate into three sections
    const graparLines = [];
    const phoneticLines = [];
    const englishLines = [];
    
    let currentSection = null;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip markers
      if (!trimmed || trimmed.includes('Էջ/') || trimmed.includes('ՈՏՔԻ ԿԱՆԳՆԻԼ') || 
          trimmed.includes('/Stand') || trimmed.includes('/STAND')) continue;
      
      // Detect section by content
      const hasArmenianUnicode = /[\u0530-\u058F]/.test(trimmed);
      const hasLatinUpper = /^[A-Z]{2,}\./.test(trimmed); // CLB., DCN., CHR., PRS.
      const startsWithSpeaker = /^(ՔՀՆ|ՍՐԿ|ԴՊՐ|CLB|DCN|CHR|PRS|TOGETHER|ՄԻԱՍԻՆ)/.test(trimmed);
      
      if (hasArmenianUnicode && startsWithSpeaker) {
        // Grapar Armenian
        graparLines.push(trimmed);
        currentSection = 'grapar';
      } else if (hasLatinUpper && startsWithSpeaker && /[aeo]/.test(trimmed)) {
        // Phonetic (has vowels, looks like transliteration)
        phoneticLines.push(trimmed);
        currentSection = 'phonetic';
      } else if (hasLatinUpper || (currentSection === 'english' && trimmed.length > 10)) {
        // English
        englishLines.push(trimmed);
        currentSection = 'english';
      } else if (currentSection && trimmed.length > 5) {
        // Continue current section
        if (currentSection === 'grapar') graparLines.push(trimmed);
        else if (currentSection === 'phonetic') phoneticLines.push(trimmed);
        else englishLines.push(trimmed);
      }
    }
    
    // Store results
    if (graparLines.length > 0) {
      const existing = pages.grapar.get(liturgyPage) || '';
      pages.grapar.set(liturgyPage, existing + '\n' + graparLines.join('\n'));
    }
    if (phoneticLines.length > 0) {
      const existing = pages.phonetic.get(liturgyPage) || '';
      pages.phonetic.set(liturgyPage, existing + '\n' + phoneticLines.join('\n'));
    }
    if (englishLines.length > 0) {
      const existing = pages.english.get(liturgyPage) || '';
      pages.english.set(liturgyPage, existing + '\n' + englishLines.join('\n'));
    }
    
    if (pdfPage % 10 === 0) {
      process.stdout.write(`  Processed ${pdfPage}/183 pages...\r`);
    }
  } catch (e) {}
}

console.log('\n✅ Extraction complete!\n');

// Clean up pages
['grapar', 'phonetic', 'english'].forEach(section => {
  const cleaned = new Map();
  pages[section].forEach((text, pageNum) => {
    const clean = text.trim().replace(/\n\n+/g, '\n');
    if (clean.length > 0) {
      cleaned.set(pageNum, clean);
    }
  });
  pages[section] = cleaned;
});

console.log('📊 STATISTICS:');
console.log(`   Grapar pages: ${pages.grapar.size}`);
console.log(`   Phonetic pages: ${pages.phonetic.size}`);
console.log(`   English pages: ${pages.english.size}`);
console.log('');

// Build word index from Grapar
const wordIndex = new Map();
pages.grapar.forEach((text, pageNum) => {
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

console.log(`   Unique Grapar words: ${wordIndex.size}`);
console.log('');

// Save complete index
const output = {
  created: new Date().toISOString(),
  source: 'Badarak-page-turner-V3-2-21-26.pdf',
  totalPages: Math.max(pages.grapar.size, pages.phonetic.size, pages.english.size),
  sections: {
    grapar: Object.fromEntries(pages.grapar),
    phonetic: Object.fromEntries(pages.phonetic),
    english: Object.fromEntries(pages.english)
  },
  wordIndex: Object.fromEntries(
    Array.from(wordIndex.entries()).map(([word, pgs]) => [
      word,
      Array.from(pgs).sort((a,b) => a-b)
    ])
  )
};

fs.writeFileSync('/app/agent/liturgy-complete-index-v3.json', JSON.stringify(output, null, 2));

console.log('💾 SAVED: liturgy-complete-index-v3.json');
console.log('');

// Test on your range
const testRange = [3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35];
const graparCovered = testRange.filter(p => pages.grapar.has(p));

console.log('🎯 YOUR TEST RANGE (pages 3-35):');
console.log(`   Grapar coverage: ${graparCovered.length}/${testRange.length} (${((graparCovered.length/testRange.length)*100).toFixed(1)}%)`);

const missing = testRange.filter(p => !pages.grapar.has(p));
if (missing.length > 0) {
  console.log(`   Missing: ${missing.join(', ')}`);
}
console.log('');
console.log('✅ READY FOR TEXT MATCHING!');
