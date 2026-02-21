#!/usr/bin/env node
/**
 * PARSE GRAPAR + PHONETIC SECTIONS
 * Build complete dictionary with both
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
const execAsync = promisify(exec);

const pdfPath = '/app/uploads/pdfs/943e74792a5e274c136d5b3cae901820.pdf';

console.log('📖 EXTRACTING GRAPAR + PHONETIC SECTIONS');
console.log('═'.repeat(80));
console.log('');

const pages = {
  grapar: new Map(),
  phonetic: new Map()
};

console.log('🔍 Processing all 183 PDF pages...\n');

for (let pdfPage = 1; pdfPage <= 183; pdfPage++) {
  try {
    const { stdout } = await execAsync(`pdftotext -f ${pdfPage} -l ${pdfPage} "${pdfPath}" -`);
    
    // Find liturgy page number
    const pageMatch = stdout.match(/Էջ\/[Pp]age\s+(\d+)/);
    if (!pageMatch) continue;
    
    const liturgyPage = parseInt(pageMatch[1]);
    const lines = stdout.split('\n');
    
    const graparLines = [];
    const phoneticLines = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip markers and empty lines
      if (!trimmed || trimmed.includes('Էջ/') || 
          trimmed.includes('ՈՏՔԻ ԿԱՆԳՆԻԼ') || trimmed.includes('/Stand') ||
          trimmed.includes('/STAND') || trimmed.includes('/SIT') ||
          trimmed.includes('/KNEEL') || trimmed.includes('ԿԱՆԳՆԻԼ') ||
          trimmed.includes('ՆՍՏԻԼ')) continue;
      
      // Armenian Unicode = Grapar
      const hasArmenianUnicode = /[\u0530-\u058F]{3,}/.test(trimmed);
      
      // Phonetic: starts with speaker label (CLB., DCN., CHR., etc) + has Latin letters
      const phoneticPattern = /^(CLB|DCN|CHR|PRS|ACL|TOGETHER|ՄԻԱՍԻՆ)\./;
      const isPhonetic = phoneticPattern.test(trimmed) && 
                        !hasArmenianUnicode && 
                        /[a-z]{3,}/.test(trimmed);
      
      if (hasArmenianUnicode) {
        graparLines.push(trimmed);
      } else if (isPhonetic) {
        phoneticLines.push(trimmed);
      }
    }
    
    // Store results
    if (graparLines.length > 0) {
      const existing = pages.grapar.get(liturgyPage) || '';
      pages.grapar.set(liturgyPage, existing ? existing + '\n' + graparLines.join('\n') : graparLines.join('\n'));
    }
    if (phoneticLines.length > 0) {
      const existing = pages.phonetic.get(liturgyPage) || '';
      pages.phonetic.set(liturgyPage, existing ? existing + '\n' + phoneticLines.join('\n') : phoneticLines.join('\n'));
    }
    
    if (pdfPage % 20 === 0) {
      process.stdout.write(`  Processed ${pdfPage}/183 pages...\r`);
    }
  } catch (e) {}
}

console.log('\n✅ Extraction complete!\n');

// Clean up
['grapar', 'phonetic'].forEach(section => {
  const cleaned = new Map();
  pages[section].forEach((text, pageNum) => {
    const clean = text.trim().replace(/\n\n+/g, '\n');
    if (clean.length > 5) {
      cleaned.set(pageNum, clean);
    }
  });
  pages[section] = cleaned;
});

console.log('📊 EXTRACTION STATISTICS:');
console.log(`   Grapar pages: ${pages.grapar.size}`);
console.log(`   Phonetic pages: ${pages.phonetic.size}`);
console.log('');

// Build word indexes
const graparWords = new Map();
const phoneticWords = new Map();

pages.grapar.forEach((text, pageNum) => {
  const words = text.match(/[\u0530-\u058F]+/g) || [];
  words.forEach(word => {
    const normalized = word.toLowerCase();
    if (normalized.length > 2) {
      if (!graparWords.has(normalized)) {
        graparWords.set(normalized, new Set());
      }
      graparWords.get(normalized).add(pageNum);
    }
  });
});

pages.phonetic.forEach((text, pageNum) => {
  // Extract phonetic words (remove speaker labels)
  const cleaned = text.replace(/^(CLB|DCN|CHR|PRS|ACL|TOGETHER|ՄԻԱՍԻՆ)\.\s*/gm, '');
  const words = cleaned.match(/[a-zA-Zûétsó]+/g) || [];
  words.forEach(word => {
    const normalized = word.toLowerCase();
    if (normalized.length > 2) {
      if (!phoneticWords.has(normalized)) {
        phoneticWords.set(normalized, new Set());
      }
      phoneticWords.get(normalized).add(pageNum);
    }
  });
});

console.log('📚 WORD INDEX STATISTICS:');
console.log(`   Grapar words: ${graparWords.size}`);
console.log(`   Phonetic words: ${phoneticWords.size}`);
console.log('');

// Build paired dictionary
const pairedPages = [];
const allPageNums = new Set([...pages.grapar.keys(), ...pages.phonetic.keys()]);

allPageNums.forEach(pageNum => {
  pairedPages.push({
    page: pageNum,
    grapar: pages.grapar.get(pageNum) || '',
    phonetic: pages.phonetic.get(pageNum) || ''
  });
});

pairedPages.sort((a, b) => a.page - b.page);

// Save complete dictionary
const output = {
  created: new Date().toISOString(),
  source: 'Badarak-page-turner-V3-2-21-26.pdf',
  totalPages: allPageNums.size,
  statistics: {
    graparPages: pages.grapar.size,
    phoneticPages: pages.phonetic.size,
    graparWords: graparWords.size,
    phoneticWords: phoneticWords.size
  },
  pages: pairedPages,
  indexes: {
    grapar: Object.fromEntries(
      Array.from(graparWords.entries()).map(([word, pgs]) => [
        word,
        Array.from(pgs).sort((a,b) => a-b)
      ])
    ),
    phonetic: Object.fromEntries(
      Array.from(phoneticWords.entries()).map(([word, pgs]) => [
        word,
        Array.from(pgs).sort((a,b) => a-b)
      ])
    )
  }
};

fs.writeFileSync('/app/agent/liturgy-complete-dictionary.json', JSON.stringify(output, null, 2));

console.log('💾 SAVED: liturgy-complete-dictionary.json');
console.log('');

// Show samples
console.log('📝 SAMPLE PAIRED PAGES:');
console.log('─'.repeat(80));

[1, 3, 8, 10, 20].forEach(pageNum => {
  const page = pairedPages.find(p => p.page === pageNum);
  if (page) {
    console.log(`\n📖 Page ${pageNum}:`);
    if (page.grapar) {
      const preview = page.grapar.substring(0, 70).replace(/\n/g, ' ');
      console.log(`   Grapar:   ${preview}...`);
    }
    if (page.phonetic) {
      const preview = page.phonetic.substring(0, 70).replace(/\n/g, ' ');
      console.log(`   Phonetic: ${preview}...`);
    }
  }
});

console.log('');
console.log('─'.repeat(80));

// Test coverage
const testRange = Array.from({length: 33}, (_, i) => i + 3);
const graparCovered = testRange.filter(p => pages.grapar.has(p));
const phoneticCovered = testRange.filter(p => pages.phonetic.has(p));

console.log('🎯 YOUR TEST RANGE (pages 3-35):');
console.log('─'.repeat(80));
console.log(`   Grapar coverage:   ${graparCovered.length}/33 (${((graparCovered.length/33)*100).toFixed(1)}%)`);
console.log(`   Phonetic coverage: ${phoneticCovered.length}/33 (${((phoneticCovered.length/33)*100).toFixed(1)}%)`);

const graparMissing = testRange.filter(p => !pages.grapar.has(p));
const phoneticMissing = testRange.filter(p => !pages.phonetic.has(p));

if (graparMissing.length > 0) {
  console.log(`   Grapar missing:    ${graparMissing.join(', ')}`);
}
if (phoneticMissing.length > 0) {
  console.log(`   Phonetic missing:  ${phoneticMissing.join(', ')}`);
}

console.log('');
console.log('✅ COMPLETE DICTIONARY READY!');
