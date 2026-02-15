#!/usr/bin/env node

/**
 * Annotation Template Creator
 * 
 * Creates a template file for manually marking page turn timestamps
 * in audio recordings. This ground truth data is used for training
 * and validation.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const audioFile = process.argv[2];
const totalPages = parseInt(process.argv[3]) || 50;
const outputFile = process.argv[4];

if (!audioFile) {
  console.log('Usage: node create-annotation-template.mjs <audio-file> [total-pages] [output-file]');
  console.log('');
  console.log('Example:');
  console.log('  node create-annotation-template.mjs service_2024_01_15.wav 50 annotations/service1.json');
  console.log('');
  console.log('This creates a template you fill in with actual timestamps.');
  process.exit(1);
}

const outputPath = outputFile || path.join(projectRoot, 'annotations', path.basename(audioFile, path.extname(audioFile)) + '.json');

// Create template
const template = {
  metadata: {
    audioFile: audioFile,
    totalPages: totalPages,
    createdAt: new Date().toISOString(),
    annotatedBy: 'FILL_IN_YOUR_NAME',
    notes: 'Listen to audio and mark timestamp when each page should turn',
  },
  instructions: {
    step1: 'Play the audio file',
    step2: 'For each page, note the timestamp (in milliseconds) when the page should turn',
    step3: 'Write the phrase or prayer that triggers the turn',
    step4: 'Add any notes about context (optional)',
    example: {
      page: 2,
      timestamp_ms: 45000,
      trigger_phrase: 'Տէր ողորմեա (Lord have mercy)',
      context: 'After opening prayer',
      notes: 'Clear, priest voice loud',
    },
  },
  pageTurns: [],
};

// Generate template entries for all pages
for (let page = 1; page <= totalPages; page++) {
  template.pageTurns.push({
    page: page,
    timestamp_ms: null, // FILL THIS IN
    trigger_phrase: '', // FILL THIS IN
    context: '',
    notes: '',
    confidence: 'high', // or 'medium', 'low'
  });
}

// Save template
try {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(template, null, 2));
  
  console.log('✅ Annotation template created!\n');
  console.log(`📄 File: ${outputPath}\n`);
  console.log('📝 Next steps:\n');
  console.log('1. Open the JSON file in a text editor');
  console.log('2. Play the audio file in a media player');
  console.log('3. For each page:');
  console.log('   - Note the timestamp when page should turn');
  console.log('   - Write what phrase triggered it');
  console.log('   - Add any context or notes');
  console.log('4. Save the completed annotation file');
  console.log('5. Use it for training:');
  console.log(`   npm run pre-train -- --annotations ${outputPath}`);
  console.log('');
  console.log('💡 Tip: Use a media player that shows milliseconds (VLC, Audacity)');
  console.log('');
  
  // Also create a helper CSV for easier editing
  const csvPath = outputPath.replace('.json', '.csv');
  const csvHeader = 'Page,Timestamp_MS,Trigger_Phrase,Context,Notes,Confidence\n';
  const csvRows = template.pageTurns.map(p => 
    `${p.page},,,,,high`
  ).join('\n');
  
  fs.writeFileSync(csvPath, csvHeader + csvRows);
  console.log(`📊 CSV version (easier editing): ${csvPath}\n`);
  console.log('You can edit the CSV in Excel/Sheets, then convert back to JSON.\n');
  
} catch (error) {
  console.error('❌ Error creating template:', error.message);
  process.exit(1);
}
