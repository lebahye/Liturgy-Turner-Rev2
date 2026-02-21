#!/usr/bin/env node
/**
 * EXTRACT ALL 183 PDF PAGES
 * Use PDF page numbers (1-183), NOT liturgy book page numbers
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
const execAsync = promisify(exec);

const pdfPath = '/app/uploads/pdfs/943e74792a5e274c136d5b3cae901820.pdf';

console.log('📖 EXTRACTING ALL 183 PDF PAGES (BY PDF PAGE NUMBER)');
console.log('═'.repeat(80));
console.log('');
console.log('PDF Page Number = physical page position in PDF file');
console.log('NOT the "Էջ/Page X" book references written in the text');
console.log('');

const pages = {
  grapar: new Map(),
  phonetic: new Map(),
  english: new Map()
};

console.log('🔍 Processing PDF pages 1-183...\n');

for (let pdfPageNum = 1; pdfPageNum <= 183; pdfPageNum++) {
  try {
    const { stdout } = await execAsync(`pdftotext -f ${pdfPageNum} -l ${pdfPageNum} "${pdfPath}" -`);
    
    const lines = stdout.split('\n');
    const graparLines = [];
    const phoneticLines = [];
    const englishLines = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip empty and markers
      if (!trimmed || trimmed.length < 3) continue;
      if (trimmed.includes('ՈՏՔԻ ԿԱՆԳՆԻԼ') || trimmed.includes('/Stand') ||
          trimmed.includes('/STAND') || trimmed.includes('/SIT') ||
          trimmed.includes('/KNEEL') || trimmed.includes('ԿԱՆԳՆԻԼ') ||
          trimmed.includes('ՆՍՏԻԼ') || trimmed.includes('ԿԱՄ')) continue;
      
      // Armenian Unicode = Grapar
      const hasArmenianUnicode = /[\u0530-\u058F]{3,}/.test(trimmed);
      
      // Phonetic: speaker label + Latin + no English patterns
      const phoneticPattern = /^(CLB|DCN|CHR|PRS|ACL)\./;
      const isPhonetic = phoneticPattern.test(trimmed) && 
                        !hasArmenianUnicode && 
                        /[aeiouyé]{2,}/.test(trimmed) &&
                        !/\b(the|and|of|to|for|in|with|you|your|our|is|are|be|have|has|from|at|by)\b/.test(trimmed.toLowerCase());
      
      // English: speaker label OR common English words
      const englishPattern = /^(CLB|DCN|CHR|PRS|ACL|TOGETHER)\./;
      const hasEnglishWords = /\b(the|and|of|to|for|in|with|you|your|our|is|are|be|have|has|from|at|by|Lord|God|holy|heaven|mercy|glory|amen)\b/.test(trimmed);
      const isEnglish = (englishPattern.test(trimmed) || hasEnglishWords) && 
                       !hasArmenianUnicode && 
                       !isPhonetic;
      
      if (hasArmenianUnicode) {
        graparLines.push(trimmed);
      } else if (isPhonetic) {
        phoneticLines.push(trimmed);
      } else if (isEnglish) {
        englishLines.push(trimmed);
      }
    }
    
    // Store by PDF page number
    if (graparLines.length > 0) {
      pages.grapar.set(pdfPageNum, graparLines.join('\n'));
    }
    if (phoneticLines.length > 0) {
      pages.phonetic.set(pdfPageNum, phoneticLines.join('\n'));
    }
    if (englishLines.length > 0) {
      pages.english.set(pdfPageNum, englishLines.join('\n'));
    }
    
    if (pdfPageNum % 20 === 0) {
      process.stdout.write(`  Processed ${pdfPageNum}/183 PDF pages...\r`);
    }
  } catch (e) {
    console.error(`Error on PDF page ${pdfPageNum}:`, e.message);
  }
}

console.log('\n✅ Extraction complete!\n');

console.log('📊 EXTRACTION STATISTICS (BY PDF PAGE):');
console.log(`   Grapar pages:   ${pages.grapar.size}/183`);
console.log(`   Phonetic pages: ${pages.phonetic.size}/183`);
console.log(`   English pages:  ${pages.english.size}/183`);
console.log('');

// Build word indexes
const graparWords = new Map();
const phoneticWords = new Map();
const englishWords = new Map();

pages.grapar.forEach((text, pdfPageNum) => {
  const words = text.match(/[\u0530-\u058F]+/g) || [];
  words.forEach(word => {
    const normalized = word.toLowerCase();
    if (normalized.length > 2) {
      if (!graparWords.has(normalized)) {
        graparWords.set(normalized, new Set());
      }
      graparWords.get(normalized).add(pdfPageNum);
    }
  });
});

pages.phonetic.forEach((text, pdfPageNum) => {
  const cleaned = text.replace(/^(CLB|DCN|CHR|PRS|ACL|TOGETHER)\.\s*/gm, '');
  const words = cleaned.match(/[a-zA-Zûétsó]+/g) || [];
  words.forEach(word => {
    const normalized = word.toLowerCase();
    if (normalized.length > 2) {
      if (!phoneticWords.has(normalized)) {
        phoneticWords.set(normalized, new Set());
      }
      phoneticWords.get(normalized).add(pdfPageNum);
    }
  });
});

pages.english.forEach((text, pdfPageNum) => {
  const cleaned = text.replace(/^(CLB|DCN|CHR|PRS|ACL|TOGETHER)\.\s*/gm, '');
  const words = cleaned.match(/[a-zA-Z]+/g) || [];
  words.forEach(word => {
    const normalized = word.toLowerCase();
    if (normalized.length > 2) {
      if (!englishWords.has(normalized)) {
        englishWords.set(normalized, new Set());
      }
      englishWords.get(normalized).add(pdfPageNum);
    }
  });
});

console.log('📚 WORD INDEX STATISTICS:');
console.log(`   Grapar words:   ${graparWords.size}`);
console.log(`   Phonetic words: ${phoneticWords.size}`);
console.log(`   English words:  ${englishWords.size}`);
console.log('');

// Save dictionary indexed by PDF page number
const dict = {
  created: new Date().toISOString(),
  source: 'Badarak-page-turner-V3-2-21-26.pdf',
  note: 'Indexed by PDF page number (1-183), not liturgy book page numbers',
  totalPdfPages: 183,
  pagesWithText: {
    grapar: pages.grapar.size,
    phonetic: pages.phonetic.size,
    english: pages.english.size
  },
  pages: Object.fromEntries(pages.grapar),
  phonetic: Object.fromEntries(pages.phonetic),
  english: Object.fromEntries(pages.english),
  wordIndex: Object.fromEntries(
    Array.from(graparWords.entries()).map(([word, pgs]) => [
      word,
      Array.from(pgs).sort((a,b) => a-b)
    ])
  ),
  phoneticIndex: Object.fromEntries(
    Array.from(phoneticWords.entries()).map(([word, pgs]) => [
      word,
      Array.from(pgs).sort((a,b) => a-b)
    ])
  ),
  englishIndex: Object.fromEntries(
    Array.from(englishWords.entries()).map(([word, pgs]) => [
      word,
      Array.from(pgs).sort((a,b) => a-b)
    ])
  )
};

fs.writeFileSync('/app/agent/pdf-pages-dictionary.json', JSON.stringify(dict, null, 2));

console.log('💾 SAVED: pdf-pages-dictionary.json');
console.log('');

// Show sample pages
console.log('📝 SAMPLE PDF PAGES:');
console.log('─'.repeat(80));
[1, 10, 50, 100, 150, 183].forEach(pdfPageNum => {
  console.log(`\nPDF Page ${pdfPageNum}:`);
  if (pages.grapar.has(pdfPageNum)) {
    const preview = pages.grapar.get(pdfPageNum).substring(0, 80).replace(/\n/g, ' ');
    console.log(`  Grapar: ${preview}...`);
  } else {
    console.log(`  Grapar: [no text]`);
  }
});

console.log('');
console.log('✅ ALL 183 PDF PAGES EXTRACTED!');
