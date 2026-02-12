#!/usr/bin/env node
/**
 * Sequential Word-Based Page Tracker
 * Uses phonetic text to know what SHOULD be said on each page
 * Tracks forward progression only (never backwards)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('📖 Sequential Word-Based Page Tracker');
console.log('======================================\n');

// Load data
const pageSections = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'training-data/db-page-sections.json'))
);
const dictionary = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'training-data/db-phonetic-dict.json'))
);
const speakerSigs = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'training-data/speaker-signatures.json'))
);

console.log(`📚 Loaded ${pageSections.length} pages`);
console.log(`📖 Loaded ${dictionary.length} phonetic mappings`);
console.log(`🎤 Loaded ${speakerSigs.length} speaker signatures\n`);

// Build lookup: Armenian word → Phonetic
const armenianToPhonetic = new Map();
dictionary.forEach(entry => {
  armenianToPhonetic.set(entry.armenian, entry.phonetic);
});

// Extract key trigger words for each page
console.log('🔍 Finding trigger words for each page...\n');

const pageWords = pageSections.map(section => {
  const pageNum = section.page_number;
  const armenianText = section.armenian_text || '';
  const phoneticText = section.phonetic_text || '';
  
  // Extract Armenian words
  const armenianWords = armenianText.match(/[Ա-և]+/g) || [];
  
  // Extract phonetic words
  const phoneticWords = phoneticText.match(/[A-Za-zûáéíóúâêîôûà]+/g) || [];
  
  // Find unique words that ONLY appear on this page (or rarely)
  const wordFrequency = new Map();
  armenianWords.forEach(word => {
    wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
  });
  
  // Get speaker
  const speaker = speakerSigs.find(s => s.pageNumber === pageNum)?.speaker || 'unknown';
  
  return {
    pageNumber: pageNum,
    speaker,
    armenianWords: armenianWords.slice(0, 10), // First 10 words
    phoneticWords: phoneticWords.slice(0, 10),
    fullText: {
      armenian: armenianText.substring(0, 150),
      phonetic: phoneticText.substring(0, 150)
    }
  };
});

// Find transition markers (first words of each page)
console.log('📍 Page Transition Markers:\n');

pageWords.slice(0, 20).forEach(page => {
  const firstArmenian = page.armenianWords.slice(0, 3).join(' ');
  const firstPhonetic = page.phoneticWords.slice(0, 3).join(' ');
  console.log(`Page ${page.pageNumber} (${page.speaker}):`);
  console.log(`  Armenian:  ${firstArmenian}`);
  console.log(`  Phonetic:  ${firstPhonetic}\n`);
});

// Build sequential tracking rules
console.log('📋 Sequential Tracking Rules:\n');

const trackingRules = [];

for (let i = 0; i < pageWords.length - 1; i++) {
  const currentPage = pageWords[i];
  const nextPage = pageWords[i + 1];
  
  // Rule: When on page N, listen for first words of page N+1
  const nextPageTrigger = nextPage.phoneticWords.slice(0, 5);
  const nextPageSpeaker = nextPage.speaker;
  
  trackingRules.push({
    currentPage: currentPage.pageNumber,
    nextPage: nextPage.pageNumber,
    triggerWords: nextPageTrigger,
    triggerSpeaker: nextPageSpeaker,
    currentSpeaker: currentPage.speaker,
    speakerChanges: currentPage.speaker !== nextPage.speaker
  });
}

// Show examples of good transition points
const goodTransitions = trackingRules.filter(r => 
  r.speakerChanges && r.triggerWords.length >= 3
);

console.log(`Found ${goodTransitions.length} clear transition points (speaker changes):\n`);

goodTransitions.slice(0, 10).forEach(rule => {
  console.log(`Page ${rule.currentPage} → ${rule.nextPage}:`);
  console.log(`  ${rule.currentSpeaker} finishes → ${rule.triggerSpeaker} starts`);
  console.log(`  Listen for: "${rule.triggerWords.join(' ')}"`);
  console.log();
});

// Create forward-only tracking strategy
console.log('🎯 Forward-Only Tracking Strategy:\n');

const strategy = {
  principle: "Pages only move forward, never backwards",
  algorithm: [
    "1. Know current page number",
    "2. Load next 3 pages' text (look-ahead window)",
    "3. Listen to live audio",
    "4. Detect speaker (choir/celebrant/deacon)",
    "5. If speaker changes → High alert for page turn",
    "6. Match heard phonemes to trigger words of next pages",
    "7. When confident match → Advance to that page",
    "8. NEVER go backwards"
  ],
  advantages: [
    "Sequential constraint reduces false positives dramatically",
    "Only need to check 3-5 pages ahead, not all 183",
    "Speaker changes give strong timing cues",
    "Phonetic dictionary tells us what to expect"
  ]
};

console.log('Algorithm:');
strategy.algorithm.forEach(step => console.log(`   ${step}`));

console.log('\nAdvantages:');
strategy.advantages.forEach(adv => console.log(`   ✓ ${adv}`));

// Save tracking rules
const rulesPath = path.join(__dirname, 'training-data/sequential-tracking-rules.json');
fs.writeFileSync(rulesPath, JSON.stringify(trackingRules, null, 2));
console.log(`\n💾 Saved ${trackingRules.length} tracking rules`);

// Create simplified lookup for live use
const liveTracker = {
  pages: pageWords.map(p => ({
    pageNumber: p.pageNumber,
    speaker: p.speaker,
    triggerWords: p.phoneticWords.slice(0, 5),
    armenianWords: p.armenianWords.slice(0, 5),
    preview: p.fullText.phonetic
  })),
  transitions: trackingRules.filter(r => r.speakerChanges)
};

const liveTrackerPath = path.join(__dirname, 'training-data/live-tracker-data.json');
fs.writeFileSync(liveTrackerPath, JSON.stringify(liveTracker, null, 2));
console.log(`💾 Saved live tracker data (${liveTracker.pages.length} pages)`);

console.log('\n✅ Sequential word tracker built!');

console.log('\n📌 Example Usage:');
console.log(`
// Initialize tracker
let currentPage = 1;

function onLiveAudio(audioChunk) {
  // 1. Get next 3 pages to check
  const candidatePages = [currentPage + 1, currentPage + 2, currentPage + 3];
  
  // 2. Detect current speaker
  const speaker = detectSpeaker(audioChunk);
  
  // 3. For each candidate, check if we hear its trigger words
  for (const pageNum of candidatePages) {
    const pageData = liveTracker.pages.find(p => p.pageNumber === pageNum);
    if (!pageData) continue;
    
    // 4. If speaker matches AND we detect trigger words
    if (speaker === pageData.speaker) {
      const wordsHeard = recognizePhonemes(audioChunk);
      const matchScore = matchWords(wordsHeard, pageData.triggerWords);
      
      if (matchScore > 0.7) {
        // 5. Advance to this page!
        currentPage = pageNum;
        console.log(\`📄 Advanced to page \${currentPage}\`);
        return { page: currentPage, changed: true };
      }
    }
  }
  
  return { page: currentPage, changed: false };
}
`);

console.log('\n💡 Key Insight:');
console.log('   We don\'t need perfect speech recognition!');
console.log('   Just need to detect: "Did I hear words from page N+1?"');
console.log('   Sequential constraint makes this MUCH easier than random matching.');
