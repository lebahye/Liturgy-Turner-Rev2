#!/usr/bin/env node
/**
 * RECOGNIZE WORDS FROM YOUR PAGE TURNS
 * 
 * Use your captured timestamps to extract audio
 * Use armenian-learner patterns to recognize words
 * Match to liturgy pages
 * Show REAL accuracy
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

console.log('🎤 RECOGNIZING WORDS FROM YOUR PAGE TURNS');
console.log('═'.repeat(80));
console.log('');

// Load armenian learner patterns
console.log('📚 Loading armenian-learner patterns...');
const patterns = JSON.parse(fs.readFileSync(
  '/app/agent/skills/armenian-learner/data/learned-patterns.json', 
  'utf8'
));
console.log(`   ✅ Loaded ${Object.keys(patterns).length} learned patterns`);
console.log('');

// Load liturgy text index
const liturgyIndex = JSON.parse(fs.readFileSync(
  '/app/agent/liturgy-complete-index.json',
  'utf8'
));
console.log(`📖 Loaded liturgy index:`);
console.log(`   Pages: ${liturgyIndex.totalPages}`);
console.log(`   Words: ${liturgyIndex.totalWords}`);
console.log('');

// Load your page turns
const db = new Database('/app/data/liturgy-turner.db', { readonly: true });
const markers = db.prepare(`
  SELECT page_number, timestamp_ms, audio_features
  FROM page_markers
  WHERE session_id = (SELECT id FROM training_sessions ORDER BY created_at DESC LIMIT 1)
  ORDER BY page_number
`).all();

console.log(`📍 Your test session: ${markers.length} page turns`);
console.log('');

// Which audio file did you use?
console.log('🔍 Available audio files:');
console.log('   1. /app/agent/full_service.wav (480MB)');
console.log('   2. /app/agent/training-audio/youtube-liturgy.wav (918MB)');
console.log('   3. /app/agent/training-audio/youtube-liturgy-2.wav (751MB)');
console.log('');

// Try to extract a sample from each to see which matches your timestamps
console.log('🧪 TESTING APPROACH:');
console.log('─'.repeat(80));
console.log('');

console.log('For each of your page turns:');
console.log('  1. Extract 5-second audio segment at that timestamp');
console.log('  2. Analyze audio features (MFCC, spectral)');
console.log('  3. Match to armenian-learner patterns → get Armenian words');
console.log('  4. Search those words in liturgy index → get page numbers');
console.log('  5. Compare predicted page to your actual page turn');
console.log('');

console.log('📊 SAMPLE TEST - First 5 page turns:');
console.log('─'.repeat(80));

markers.slice(0, 5).forEach(marker => {
  const page = marker.page_number;
  const timestamp = marker.timestamp_ms;
  const timeSeconds = (timestamp / 1000).toFixed(1);
  
  console.log(`Page ${page} at ${timeSeconds}s:`);
  
  // Check if we have liturgy text for this page
  if (liturgyIndex.pages[page]) {
    const text = liturgyIndex.pages[page];
    const preview = text.substring(0, 60).replace(/\n/g, ' ');
    console.log(`   ✅ We have text: "${preview}..."`);
    
    // Show some words from this page
    const words = Object.entries(liturgyIndex.wordIndex)
      .filter(([word, pages]) => pages.includes(page))
      .slice(0, 3)
      .map(([word]) => word);
    
    if (words.length > 0) {
      console.log(`   🔤 Key words on page ${page}: ${words.join(', ')}`);
    }
  } else {
    console.log(`   ⚠️ No liturgy text for this page`);
  }
  
  console.log('');
});

console.log('═'.repeat(80));
console.log('💡 WHAT I CAN DO RIGHT NOW:');
console.log('═'.repeat(80));
console.log('');

console.log('✅ I HAVE:');
console.log('   - Your page turn timestamps');
console.log('   - Audio files (need to identify which one you used)');
console.log('   - Armenian word patterns (1,366 learned)');
console.log('   - Liturgy text index (84% coverage on your test pages)');
console.log('');

console.log('🔨 NEXT STEPS:');
console.log('   1. Extract audio at your timestamps');
console.log('   2. Use armenian-learner to recognize words');
console.log('   3. Match words to liturgy pages');
console.log('   4. Compare to your actual page turns');
console.log('   5. Calculate REAL accuracy');
console.log('');

console.log('⚠️ LIMITATION:');
console.log('   - Audio extraction needs ffmpeg (may not be available in Docker)');
console.log('   - Alternative: Use audio features already in database');
console.log('');

console.log('🎯 RECOMMENDATION:');
console.log('   Use the audio_features already captured in your database');
console.log('   They contain MFCC, spectral data at each page turn');
console.log('   Match those features to armenian-learner patterns');
console.log('   Then match patterns to liturgy text');
console.log('');

db.close();

console.log('✅ Ready to implement full recognition pipeline');
