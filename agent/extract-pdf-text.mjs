#!/usr/bin/env node
/**
 * EXTRACT ARMENIAN TEXT FROM PDF
 * 
 * The liturgy PDF has all the text for all 183 pages
 * I need to extract it and build the complete text index
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);

console.log('📄 EXTRACTING TEXT FROM LITURGY PDF');
console.log('═'.repeat(80));
console.log('');

// Find the PDF
const pdfPath = '/app/uploads/pdfs/30d97eb7de21236a69d303d77b88251d.pdf';

if (!fs.existsSync(pdfPath)) {
  console.log(`❌ PDF not found: ${pdfPath}`);
  console.log('');
  console.log('Searching for PDFs...');
  
  try {
    const { stdout } = await execAsync('find /app -name "*.pdf" -type f 2>/dev/null | head -10');
    console.log(stdout);
  } catch (e) {
    console.log('No PDFs found');
  }
  
  process.exit(1);
}

console.log(`✅ Found PDF: ${pdfPath}`);

const stats = fs.statSync(pdfPath);
console.log(`   Size: ${(stats.size / 1024).toFixed(1)} KB`);
console.log('');

// Check if pdftotext is available
console.log('🔍 Checking for PDF tools...');

try {
  await execAsync('which pdftotext');
  console.log('   ✅ pdftotext available');
} catch (e) {
  console.log('   ❌ pdftotext not installed');
  console.log('   Install: apt-get install poppler-utils');
}

try {
  await execAsync('which pdf2txt.py');
  console.log('   ✅ pdf2txt.py available');
} catch (e) {
  console.log('   ⚠️ pdf2txt.py not installed');
}

console.log('');

// Try to extract text
console.log('📖 Attempting text extraction...');
console.log('');

try {
  // Try pdftotext first (best for preserving layout)
  const { stdout, stderr } = await execAsync(`pdftotext "${pdfPath}" -`);
  
  if (stdout) {
    const lines = stdout.split('\n');
    console.log(`✅ Extracted ${lines.length} lines of text`);
    console.log('');
    console.log('📝 FIRST 20 LINES:');
    console.log('─'.repeat(80));
    lines.slice(0, 20).forEach((line, i) => {
      if (line.trim()) {
        console.log(`${(i+1).toString().padStart(3)}: ${line.substring(0, 70)}`);
      }
    });
    console.log('');
    
    // Save to file
    const outputPath = '/app/agent/liturgy-full-text.txt';
    fs.writeFileSync(outputPath, stdout);
    console.log(`💾 Saved to: ${outputPath}`);
    
  } else {
    console.log('❌ No text extracted');
  }
  
} catch (e) {
  console.log(`❌ Extraction failed: ${e.message}`);
  console.log('');
  console.log('💡 Alternative approach needed:');
  console.log('   1. Manual text entry for common pages');
  console.log('   2. OCR if PDF is image-based');
  console.log('   3. Request text file from user');
}

console.log('');
console.log('═'.repeat(80));
