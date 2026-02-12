#!/usr/bin/env node
/**
 * Speaker-Aware Page Tracker
 * Uses choir vs. solo voice detection to identify page boundaries
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Meyda = require('meyda');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🎤 Speaker-Aware Page Tracker');
console.log('==============================\n');

// Load page data
const pageData = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'training-data/page-analysis.json'))
);

// Extract speaker info from PDF
console.log('📋 Analyzing speaker patterns...\n');

const extractedText = fs.readFileSync(
  path.join(__dirname, 'liturgy-extracted.txt'),
  'utf8'
);

const lines = extractedText.split('\n');

// Map pages to speakers
const pageSpeakers = new Map();
let currentPage = 1;

lines.forEach(line => {
  // Page marker
  const pageMatch = line.match(/-- (\d+) of (\d+) --/);
  if (pageMatch) {
    currentPage = parseInt(pageMatch[1]);
    return;
  }
  
  // Speaker marker
  const speakerMatch = line.match(/^(CHR|CLB|DCN|ՔՀՆ|ԴՊՐ|ՍՐԿ)\.\s/);
  if (speakerMatch) {
    const speaker = speakerMatch[1];
    
    // Normalize speaker codes
    const normalized = {
      'CHR': 'choir',
      'CLB': 'celebrant', 
      'DCN': 'deacon',
      'ՔՀՆ': 'celebrant',
      'ԴՊՐ': 'celebrant',
      'ՍՐԿ': 'deacon'
    }[speaker] || 'unknown';
    
    if (!pageSpeakers.has(currentPage)) {
      pageSpeakers.set(currentPage, []);
    }
    
    const speakers = pageSpeakers.get(currentPage);
    if (!speakers.includes(normalized)) {
      speakers.push(normalized);
    }
  }
});

console.log(`✅ Mapped speakers to ${pageSpeakers.size} pages\n`);

// Analyze speaker transitions
console.log('🔄 Speaker Transitions:');
let lastSpeaker = null;
const transitions = [];

for (let i = 1; i <= 183; i++) {
  const speakers = pageSpeakers.get(i) || ['unknown'];
  const mainSpeaker = speakers[0]; // First speaker on page
  
  if (lastSpeaker && mainSpeaker !== lastSpeaker) {
    transitions.push({
      page: i,
      from: lastSpeaker,
      to: mainSpeaker
    });
    
    if (transitions.length <= 10) {
      console.log(`   Page ${i}: ${lastSpeaker} → ${mainSpeaker}`);
    }
  }
  
  lastSpeaker = mainSpeaker;
}

console.log(`   ... (${transitions.length} total transitions)\n`);

// Speaker characteristics
console.log('🎵 Expected Audio Characteristics:');
console.log('   CHOIR: Multiple voices, harmonic richness, higher spectral complexity');
console.log('   CELEBRANT: Solo male voice, clearer fundamental frequency');
console.log('   DEACON: Solo voice, similar to celebrant but different pitch/timbre\n');

// Build enhanced page signatures with speaker info
const enhancedSignatures = pageData.map((page, idx) => {
  const speakers = pageSpeakers.get(page.pageNumber) || ['unknown'];
  const mainSpeaker = speakers[0];
  
  return {
    pageNumber: page.pageNumber,
    speaker: mainSpeaker,
    multiSpeaker: speakers.length > 1,
    armenianText: page.armenianText,
    keywords: page.keywords,
    isTransition: transitions.some(t => t.page === page.pageNumber)
  };
});

// Save enhanced signatures
const outputPath = path.join(__dirname, 'training-data/speaker-signatures.json');
fs.writeFileSync(outputPath, JSON.stringify(enhancedSignatures, null, 2));
console.log(`💾 Saved speaker signatures to training-data/speaker-signatures.json`);

// Statistics
const speakerCounts = {
  choir: enhancedSignatures.filter(s => s.speaker === 'choir').length,
  celebrant: enhancedSignatures.filter(s => s.speaker === 'celebrant').length,
  deacon: enhancedSignatures.filter(s => s.speaker === 'deacon').length,
  unknown: enhancedSignatures.filter(s => s.speaker === 'unknown').length
};

console.log('\n📊 Speaker Distribution:');
console.log(`   Choir pages: ${speakerCounts.choir}`);
console.log(`   Celebrant pages: ${speakerCounts.celebrant}`);
console.log(`   Deacon pages: ${speakerCounts.deacon}`);
console.log(`   Unknown: ${speakerCounts.unknown}`);

console.log(`\n✅ Speaker analysis complete!`);

console.log('\n📌 Next Steps:');
console.log('1. Extract speaker features (spectral flux, harmonic ratio) from audio');
console.log('2. Train speaker classifier (choir vs. solo)');
console.log('3. Use speaker transitions to trigger page turns');
console.log('4. Combine with text matching for double confirmation');

console.log('\n💡 Live Strategy:');
console.log('   - Detect current speaker (choir/celebrant/deacon)');
console.log('   - When speaker changes → likely page turn');
console.log('   - Match audio features to confirm which page');
console.log('   - Advance with high confidence');
