#!/usr/bin/env node
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

const pdfPath = '/app/uploads/pdfs/943e74792a5e274c136d5b3cae901820.pdf';

console.log('🔍 ANALYZING PDF ENCODING...\n');

let cleanPages = 0;
let garbledPages = 0;
const samplePages = { clean: [], garbled: [] };

for (let page = 1; page <= 183; page++) {
  try {
    const { stdout } = await execAsync(`pdftotext -f ${page} -l ${page} "${pdfPath}" -`);
    
    // Check if it contains proper Unicode Armenian (U+0530-058F)
    const hasUnicodeArmenian = /[\u0530-\u058F]/.test(stdout);
    // Check for garbled encoding (Latin extended, etc)
    const hasGarbled = /[ÀÁÂÃÄÅÆÇÈÉÊË]/.test(stdout);
    
    if (hasUnicodeArmenian && !hasGarbled) {
      cleanPages++;
      if (samplePages.clean.length < 3) samplePages.clean.push(page);
    } else if (hasGarbled) {
      garbledPages++;
      if (samplePages.garbled.length < 3) samplePages.garbled.push(page);
    }
    
    if (page % 20 === 0) process.stdout.write(`  Checked ${page}/183...\r`);
  } catch (e) {}
}

console.log('\n\n📊 RESULTS:');
console.log(`   Clean Unicode Armenian: ${cleanPages} pages`);
console.log(`   Garbled encoding: ${garbledPages} pages`);
console.log(`   No text: ${183 - cleanPages - garbledPages} pages`);
console.log(`\n   Clean sample: ${samplePages.clean.join(', ')}`);
console.log(`   Garbled sample: ${samplePages.garbled.join(', ')}`);
