#!/usr/bin/env node
/**
 * Extract Armenian-to-Phonetic mappings from the PDF text
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔤 Extracting Armenian Phonetics from PDF');
console.log('==========================================\n');

const extractedText = fs.readFileSync(
  path.join(__dirname, 'liturgy-extracted.txt'),
  'utf8'
);

const lines = extractedText.split('\n');

// The PDF has pattern:
// CHR. <phonetic text>
// CHR. <English translation>
// ԴՊՐ. <Armenian text>

const phonetics = [];
const dictionary = new Map();

for (let i = 0; i < lines.length - 2; i++) {
  const line1 = lines[i].trim();
  const line2 = lines[i + 1].trim();
  const line3 = lines[i + 2].trim();
  
  // Look for pattern: phonetic line, English line, Armenian line
  const phoneticMatch = line1.match(/^(CHR|DCN|CLB|SRK|ՔՀՆ|ԴՊՐ|ՍՐԿ)\.\s+(.+)$/);
  const armenianMatch = line3.match(/^(ՔՀՆ|ԴՊՐ|ՍՐԿ)\.\s+([Ա-և].+)$/);
  
  if (phoneticMatch && armenianMatch) {
    const phonetic = phoneticMatch[2].trim();
    const armenian = armenianMatch[2].trim();
    
    // Extract Armenian words and their phonetic equivalents
    const armenianWords = armenian.match(/[Ա-և]+/g) || [];
    const phoneticWords = phonetic.match(/[A-Za-zûáéíóúâêîôûà]+/g) || [];
    
    if (armenianWords.length > 0 && phoneticWords.length > 0) {
      phonetics.push({
        armenian,
        phonetic,
        armenianWords: armenianWords.slice(0, 5),
        phoneticWords: phoneticWords.slice(0, 5)
      });
      
      // Build word-level dictionary (best effort alignment)
      const minLen = Math.min(armenianWords.length, phoneticWords.length);
      for (let j = 0; j < minLen; j++) {
        const armWord = armenianWords[j];
        const phonWord = phoneticWords[j];
        
        if (!dictionary.has(armWord)) {
          dictionary.set(armWord, []);
        }
        dictionary.get(armWord).push(phonWord);
      }
    }
  }
}

console.log(`✅ Found ${phonetics.length} phonetic pairs`);
console.log(`✅ Built dictionary with ${dictionary.size} Armenian words\n`);

// Consolidate dictionary (most common phonetic for each word)
const consolidatedDict = {};
dictionary.forEach((phonetics, armenian) => {
  // Count frequency
  const freq = new Map();
  phonetics.forEach(p => freq.set(p, (freq.get(p) || 0) + 1));
  
  // Get most common
  const sorted = Array.from(freq.entries()).sort((a, b) => b[1] - a[1]);
  const mostCommon = sorted[0][0];
  const alternatives = sorted.slice(1, 3).map(([p]) => p);
  
  consolidatedDict[armenian] = {
    primary: mostCommon,
    alternatives,
    frequency: sorted[0][1]
  };
});

// Save dictionary
const dictPath = path.join(__dirname, 'training-data/armenian-phonetic-dict.json');
fs.writeFileSync(dictPath, JSON.stringify(consolidatedDict, null, 2));
console.log(`💾 Saved dictionary to training-data/armenian-phonetic-dict.json`);

// Show examples
console.log('\n📖 Sample Dictionary Entries:');
const samples = Object.entries(consolidatedDict).slice(0, 20);
samples.forEach(([arm, phon]) => {
  console.log(`   ${arm} → ${phon.primary} (${phon.frequency}×)`);
});

// Analyze phoneme patterns
console.log('\n🔊 Analyzing Phoneme Patterns...');

// Armenian letter to phoneme mapping
const letterPhonemes = new Map();

Object.entries(consolidatedDict).forEach(([armenian, phonetic]) => {
  const armChars = armenian.split('');
  const phonWord = phonetic.primary;
  
  // Simple heuristic: map first Armenian char to first phoneme cluster
  if (armChars.length > 0 && phonWord.length > 0) {
    const firstChar = armChars[0];
    const firstPhoneme = phonWord.substring(0, 2); // First 2 chars of phonetic
    
    if (!letterPhonemes.has(firstChar)) {
      letterPhonemes.set(firstChar, new Map());
    }
    
    const phonMap = letterPhonemes.get(firstChar);
    phonMap.set(firstPhoneme, (phonMap.get(firstPhoneme) || 0) + 1);
  }
});

console.log('\n📊 Common Letter-to-Phoneme Mappings:');
const topLetters = Array.from(letterPhonemes.entries())
  .slice(0, 15)
  .map(([letter, phonMap]) => {
    const topPhon = Array.from(phonMap.entries())
      .sort((a, b) => b[1] - a[1])[0];
    return { letter, phoneme: topPhon[0], count: topPhon[1] };
  });

topLetters.forEach(({ letter, phoneme, count }) => {
  console.log(`   ${letter} → ${phoneme} (${count}×)`);
});

console.log('\n✅ Phonetic extraction complete!');
console.log('\n📌 Next: Use phonetics to improve audio matching');
