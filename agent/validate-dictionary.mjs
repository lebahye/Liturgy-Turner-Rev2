#!/usr/bin/env node
/**
 * Dictionary Validator - Health Check for liturgy-database.json
 * Analyzes coverage, identifies weak/missing pages, detects conflicts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = path.join(__dirname, 'skills/liturgy-audio-controller/data/liturgy-database.json');

console.log('📖 Dictionary Validation Report');
console.log('═'.repeat(80));
console.log('');

// Load database
let db;
try {
  db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
} catch (error) {
  console.error(`❌ Failed to load database: ${error.message}`);
  process.exit(1);
}

const entries = db.entries || [];
const totalPages = 183; // Armenian liturgy book

console.log(`📊 Total Entries: ${entries.length}`);
console.log('');

// 1. Page Coverage Analysis
const pagesWithEntries = new Set();
const pageEntryCount = new Map();

entries.forEach(entry => {
  if (entry.page) {
    pagesWithEntries.add(entry.page);
    pageEntryCount.set(entry.page, (pageEntryCount.get(entry.page) || 0) + 1);
  }
});

const coverage = pagesWithEntries.size;
const coveragePercent = ((coverage / totalPages) * 100).toFixed(1);

console.log('📄 Page Coverage:');
console.log(`   ✓ Coverage: ${coverage}/${totalPages} pages (${coveragePercent}%)`);

// Find missing pages
const missingPages = [];
for (let i = 1; i <= totalPages; i++) {
  if (!pagesWithEntries.has(i)) {
    missingPages.push(i);
  }
}

if (missingPages.length > 0) {
  console.log(`   ❌ Missing pages: ${missingPages.slice(0, 20).join(', ')}${missingPages.length > 20 ? '...' : ''}`);
  console.log(`      (Total: ${missingPages.length} pages with no entries)`);
} else {
  console.log(`   ✅ All pages covered!`);
}

console.log('');

// 2. Entry Distribution
const weakPages = [];  // <2 entries
const strongPages = []; // 5+ entries

for (let i = 1; i <= totalPages; i++) {
  const count = pageEntryCount.get(i) || 0;
  if (count === 0) continue; // Already counted as missing
  if (count < 2) weakPages.push({ page: i, count });
  if (count >= 5) strongPages.push({ page: i, count });
}

console.log('📈 Entry Distribution:');
console.log(`   ⚠️ Weak pages (<2 entries): ${weakPages.length}`);
if (weakPages.length > 0 && weakPages.length <= 10) {
  weakPages.forEach(({ page, count }) => {
    console.log(`      Page ${page}: ${count} entry`);
  });
} else if (weakPages.length > 10) {
  console.log(`      ${weakPages.slice(0, 5).map(p => `${p.page}(${p.count})`).join(', ')}...`);
}

console.log(`   ✅ Strong pages (5+ entries): ${strongPages.length}`);
if (strongPages.length > 0 && strongPages.length <= 10) {
  strongPages.forEach(({ page, count }) => {
    console.log(`      Page ${page}: ${count} entries`);
  });
}

console.log('');

// 3. Keyword Conflict Analysis
const keywordToPages = new Map();

entries.forEach(entry => {
  if (entry.keywords && Array.isArray(entry.keywords)) {
    entry.keywords.forEach(keyword => {
      if (!keywordToPages.has(keyword)) {
        keywordToPages.set(keyword, new Set());
      }
      keywordToPages.get(keyword).add(entry.page);
    });
  }
});

const conflicts = [];
keywordToPages.forEach((pages, keyword) => {
  if (pages.size > 5) { // Keyword appears on >5 different pages
    conflicts.push({ keyword, pageCount: pages.size });
  }
});

conflicts.sort((a, b) => b.pageCount - a.pageCount);

console.log('🔍 Keyword Conflicts:');
if (conflicts.length === 0) {
  console.log(`   ✅ No major conflicts (no keywords appear on >5 pages)`);
} else {
  console.log(`   ⚠️ ${conflicts.length} keywords appear on many pages (may reduce accuracy):`);
  conflicts.slice(0, 5).forEach(({ keyword, pageCount }) => {
    console.log(`      "${keyword}" → ${pageCount} pages`);
  });
}

console.log('');

// 4. Overall Score
let score = 100;

// Coverage penalty (0-40 points)
if (coveragePercent < 50) score -= 40;
else if (coveragePercent < 70) score -= 30;
else if (coveragePercent < 90) score -= 20;
else if (coveragePercent < 100) score -= 10;

// Weak pages penalty (0-20 points)
const weakPagePercent = (weakPages.length / totalPages) * 100;
if (weakPagePercent > 30) score -= 20;
else if (weakPagePercent > 20) score -= 15;
else if (weakPagePercent > 10) score -= 10;
else if (weakPagePercent > 5) score -= 5;

// Conflict penalty (0-20 points)
if (conflicts.length > 50) score -= 20;
else if (conflicts.length > 30) score -= 15;
else if (conflicts.length > 15) score -= 10;
else if (conflicts.length > 5) score -= 5;

// Entry count bonus
const avgEntriesPerPage = entries.length / totalPages;
if (avgEntriesPerPage >= 5) score += 10;
else if (avgEntriesPerPage >= 3) score += 5;

score = Math.max(0, Math.min(100, score));

console.log('🎯 Overall Assessment:');
console.log(`   Score: ${score}/100`);

if (score >= 90) {
  console.log(`   Rating: ✅ EXCELLENT`);
} else if (score >= 75) {
  console.log(`   Rating: 👍 GOOD`);
} else if (score >= 60) {
  console.log(`   Rating: ⚠️ FAIR`);
} else {
  console.log(`   Rating: ❌ POOR`);
}

console.log('');

// 5. Recommendations
console.log('💡 Recommendations:');
const recommendations = [];

if (missingPages.length > 0) {
  recommendations.push(`Add entries for ${missingPages.length} missing pages`);
}

if (weakPages.length > totalPages * 0.1) {
  recommendations.push(`Strengthen ${weakPages.length} pages with <2 entries`);
}

if (conflicts.length > 10) {
  recommendations.push(`Review ${conflicts.length} high-conflict keywords for disambiguation`);
}

if (avgEntriesPerPage < 2) {
  recommendations.push(`Increase average entries per page (current: ${avgEntriesPerPage.toFixed(1)})`);
}

if (recommendations.length === 0) {
  console.log(`   ✅ Dictionary is in excellent shape!`);
} else {
  recommendations.forEach((rec, i) => {
    console.log(`   ${i + 1}. ${rec}`);
  });
}

console.log('');
console.log('═'.repeat(80));
console.log(`✅ Validation complete - Database has ${entries.length} entries covering ${coverage}/${totalPages} pages`);
