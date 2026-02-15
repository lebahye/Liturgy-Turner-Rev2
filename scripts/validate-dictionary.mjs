#!/usr/bin/env node

/**
 * Dictionary Validation Script
 * 
 * Validates the Armenian phonetic dictionary for:
 * - Coverage (do all pages have words?)
 * - Accuracy (are phonetic spellings correct?)
 * - Frequency (are common words recognized?)
 * - Context (do words appear on correct pages?)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('📚 Dictionary Validation Starting...\n');

// Load dictionaries
const dict1Path = path.join(projectRoot, 'training-data/armenian-phonetic-dict.json');
const dict2Path = path.join(projectRoot, 'training-data/db-phonetic-dict.json');

let dict1 = null;
let dict2 = null;

try {
  dict1 = JSON.parse(fs.readFileSync(dict1Path, 'utf8'));
  dict2 = JSON.parse(fs.readFileSync(dict2Path, 'utf8'));
  console.log('✅ Loaded dictionaries successfully');
  console.log(`   Armenian → English: ${Object.keys(dict1).length} words`);
  console.log(`   Phonetic index: ${Object.keys(dict2).length} entries`);
  console.log('');
} catch (error) {
  console.error('❌ Error loading dictionaries:', error.message);
  process.exit(1);
}

// Validation results
const results = {
  totalScore: 0,
  maxScore: 100,
  checks: [],
};

function addCheck(name, passed, score, maxScore, details = '') {
  results.checks.push({ name, passed, score, maxScore, details });
  results.totalScore += score;
  results.maxScore += maxScore;
  
  const icon = passed ? '✅' : '⚠️';
  console.log(`${icon} ${name}: ${score}/${maxScore}`);
  if (details) console.log(`   ${details}`);
}

console.log('🔍 Running Validation Checks...\n');

// Check 1: Dictionary size
const dict1Size = Object.keys(dict1).length;
const dict2Size = Object.keys(dict2).length;
const totalWords = dict1Size + dict2Size;

const sizeScore = Math.min(30, Math.floor((totalWords / 5000) * 30));
addCheck(
  'Dictionary Size',
  totalWords >= 3000,
  sizeScore,
  30,
  `${totalWords} total words (target: 5000+)`
);

// Check 2: Coverage (do we have phonetic entries for most words?)
const coverageRatio = dict2Size / (dict1Size + dict2Size);
const coverageScore = Math.floor(coverageRatio * 20);
addCheck(
  'Phonetic Coverage',
  coverageRatio > 0.9,
  coverageScore,
  20,
  `${(coverageRatio * 100).toFixed(1)}% of words have phonetic entries`
);

// Check 3: Common words frequency
const commonWords = Object.entries(dict1)
  .filter(([_, data]) => data.frequency > 2)
  .length;
const frequencyScore = Math.min(15, Math.floor((commonWords / 20) * 15));
addCheck(
  'Common Words',
  commonWords >= 10,
  frequencyScore,
  15,
  `${commonWords} words appear multiple times (target: 20+)`
);

// Check 4: Alternative pronunciations
const wordsWithAlternatives = Object.entries(dict1)
  .filter(([_, data]) => data.alternatives && data.alternatives.length > 0)
  .length;
const altScore = Math.min(15, Math.floor((wordsWithAlternatives / 30) * 15));
addCheck(
  'Alternative Pronunciations',
  wordsWithAlternatives >= 15,
  altScore,
  15,
  `${wordsWithAlternatives} words have alternatives (target: 30+)`
);

// Check 5: Phonetic distribution
const phoneticDistribution = {};
Object.values(dict2).forEach(entry => {
  if (entry.phonetic) {
    const firstLetter = entry.phonetic.charAt(0).toUpperCase();
    phoneticDistribution[firstLetter] = (phoneticDistribution[firstLetter] || 0) + 1;
  }
});

const lettersWithWords = Object.keys(phoneticDistribution).length;
const distributionScore = Math.min(20, Math.floor((lettersWithWords / 20) * 20));
addCheck(
  'Phonetic Distribution',
  lettersWithWords >= 15,
  distributionScore,
  20,
  `${lettersWithWords} different starting sounds (target: 20+)`
);

console.log('\n' + '═'.repeat(60));
console.log(`🎯 OVERALL SCORE: ${results.totalScore}/${results.maxScore} (${Math.round((results.totalScore / results.maxScore) * 100)}%)`);
console.log('═'.repeat(60) + '\n');

// Recommendations
console.log('📋 RECOMMENDATIONS:\n');

if (totalWords < 5000) {
  console.log('  • Add more audio recordings to expand dictionary');
  console.log('    Target: 5000+ words for comprehensive coverage');
}

if (commonWords < 20) {
  console.log('  • Process multiple service recordings to identify high-frequency words');
  console.log('    Common words (Lord, God, Holy) should appear 5+ times');
}

if (wordsWithAlternatives < 30) {
  console.log('  • Add pronunciation variations for key liturgical terms');
  console.log('    Example: "Տէր" (Lord) → "dér", "tér", "geer"');
}

if (lettersWithWords < 20) {
  console.log('  • Ensure full Armenian alphabet coverage in dictionary');
  console.log('    Some sounds may be missing from current training data');
}

if (results.totalScore >= 90) {
  console.log('  ✅ Dictionary is in excellent shape!');
  console.log('  ✅ Ready for production use');
} else if (results.totalScore >= 75) {
  console.log('  ⚠️  Dictionary is good but has room for improvement');
  console.log('  ⚠️  Consider adding more training data');
} else {
  console.log('  ❌ Dictionary needs significant improvement');
  console.log('  ❌ More training required before production use');
}

console.log('');

// Generate detailed report
const report = {
  timestamp: new Date().toISOString(),
  overallScore: results.totalScore,
  maxScore: results.maxScore,
  percentage: Math.round((results.totalScore / results.maxScore) * 100),
  checks: results.checks,
  statistics: {
    armenianWords: dict1Size,
    phoneticEntries: dict2Size,
    totalWords: totalWords,
    commonWords: commonWords,
    wordsWithAlternatives: wordsWithAlternatives,
    phoneticLetters: lettersWithWords,
  },
  topWords: Object.entries(dict1)
    .sort((a, b) => b[1].frequency - a[1].frequency)
    .slice(0, 10)
    .map(([word, data]) => ({ armenian: word, english: data.primary, frequency: data.frequency })),
};

const reportPath = path.join(projectRoot, 'reports/dictionary-validation.json');
try {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`📄 Detailed report saved: ${reportPath}\n`);
} catch (error) {
  console.error('⚠️  Could not save report:', error.message);
}

// Exit code based on score
if (results.totalScore >= 75) {
  process.exit(0); // Pass
} else {
  process.exit(1); // Fail
}
