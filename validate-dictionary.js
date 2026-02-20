#!/usr/bin/env node
/**
 * Dictionary Validation Script
 * 
 * Checks liturgy-database.json for:
 * - Page coverage (how many pages have entries?)
 * - Keyword quality (duplicates, conflicts)
 * - Missing pages
 * - Entry distribution
 */

const fs = require('fs');
const path = require('path');

const LITURGY_DB_PATH = path.join(__dirname, '../agent/skills/liturgy-audio-controller/data/liturgy-database.json');
const TOTAL_PAGES = 50; // Adjust based on your liturgy book

function validateDictionary() {
  console.log('📖 Dictionary Validation Report');
  console.log('═'.repeat(60));
  console.log('');

  // Load database
  let database;
  try {
    database = JSON.parse(fs.readFileSync(LITURGY_DB_PATH, 'utf8'));
  } catch (error) {
    console.error('❌ Failed to load liturgy database:', error.message);
    process.exit(1);
  }

  if (!database.entries || !Array.isArray(database.entries)) {
    console.error('❌ Invalid database structure: missing entries array');
    process.exit(1);
  }

  const entries = database.entries;
  console.log(`📊 Total Entries: ${entries.length}`);
  console.log('');

  // Check page coverage
  const pagesWithEntries = new Set();
  const entriesPerPage = {};

  entries.forEach(entry => {
    if (entry.page) {
      pagesWithEntries.add(entry.page);
      entriesPerPage[entry.page] = (entriesPerPage[entry.page] || 0) + 1;
    }
  });

  const coverage = (pagesWithEntries.size / TOTAL_PAGES) * 100;
  const missingPages = [];
  for (let i = 1; i <= TOTAL_PAGES; i++) {
    if (!pagesWithEntries.has(i)) {
      missingPages.push(i);
    }
  }

  console.log('📄 Page Coverage:');
  if (coverage >= 90) {
    console.log(`  ✅ Coverage: ${pagesWithEntries.size}/${TOTAL_PAGES} pages (${coverage.toFixed(1)}%)`);
  } else if (coverage >= 70) {
    console.log(`  ⚠️  Coverage: ${pagesWithEntries.size}/${TOTAL_PAGES} pages (${coverage.toFixed(1)}%)`);
  } else {
    console.log(`  ❌ Coverage: ${pagesWithEntries.size}/${TOTAL_PAGES} pages (${coverage.toFixed(1)}%)`);
  }

  if (missingPages.length > 0) {
    console.log(`  ❌ Missing pages: ${missingPages.slice(0, 10).join(', ')}${missingPages.length > 10 ? '...' : ''}`);
  } else {
    console.log('  ✅ All pages have entries');
  }
  console.log('');

  // Entry distribution
  console.log('📊 Entry Distribution:');
  const avgEntriesPerPage = entries.length / pagesWithEntries.size;
  console.log(`  Average entries per page: ${avgEntriesPerPage.toFixed(1)}`);
  
  const weakPages = Object.entries(entriesPerPage)
    .filter(([_, count]) => count < 2)
    .map(([page]) => parseInt(page))
    .sort((a, b) => a - b);

  const strongPages = Object.entries(entriesPerPage)
    .filter(([_, count]) => count >= 5)
    .map(([page]) => parseInt(page))
    .sort((a, b) => a - b);

  if (weakPages.length > 0) {
    console.log(`  ⚠️  Weak pages (<2 entries): ${weakPages.slice(0, 10).join(', ')}${weakPages.length > 10 ? '...' : ''}`);
  }
  if (strongPages.length > 0) {
    console.log(`  ✅ Strong pages (5+ entries): ${strongPages.slice(0, 10).join(', ')}${strongPages.length > 10 ? '...' : ''}`);
  }
  console.log('');

  // Check for duplicate keywords
  console.log('🔍 Keyword Analysis:');
  const keywordToPages = {};
  let duplicateKeywords = 0;

  entries.forEach(entry => {
    if (entry.keywords && Array.isArray(entry.keywords)) {
      entry.keywords.forEach(keyword => {
        if (!keywordToPages[keyword]) {
          keywordToPages[keyword] = [];
        }
        keywordToPages[keyword].push(entry.page);
      });
    }
  });

  const conflicts = [];
  Object.entries(keywordToPages).forEach(([keyword, pages]) => {
    if (pages.length > 3) {
      duplicateKeywords++;
      conflicts.push({ keyword, pages: [...new Set(pages)] });
    }
  });

  if (duplicateKeywords === 0) {
    console.log('  ✅ No keyword conflicts detected');
  } else {
    console.log(`  ⚠️  ${duplicateKeywords} keywords appear on 3+ different pages`);
    conflicts.slice(0, 5).forEach(c => {
      console.log(`     "${c.keyword}" appears on pages: ${c.pages.slice(0, 5).join(', ')}`);
    });
  }
  console.log('');

  // Check source distribution
  console.log('📚 Entry Sources:');
  const sources = {};
  entries.forEach(entry => {
    const source = entry.source || 'original';
    sources[source] = (sources[source] || 0) + 1;
  });

  Object.entries(sources).forEach(([source, count]) => {
    const percent = ((count / entries.length) * 100).toFixed(1);
    console.log(`  ${source}: ${count} (${percent}%)`);
  });
  console.log('');

  // Overall score
  console.log('🎯 Overall Assessment:');
  let score = 0;
  const scoreComponents = [];

  // Coverage (40 points)
  const coverageScore = Math.min(40, (coverage / 100) * 40);
  score += coverageScore;
  scoreComponents.push(`Coverage: ${coverageScore.toFixed(0)}/40`);

  // Entry density (30 points)
  const densityScore = Math.min(30, (avgEntriesPerPage / 5) * 30);
  score += densityScore;
  scoreComponents.push(`Density: ${densityScore.toFixed(0)}/30`);

  // Keyword quality (20 points)
  const keywordScore = Math.max(0, 20 - (duplicateKeywords * 0.5));
  score += keywordScore;
  scoreComponents.push(`Keywords: ${keywordScore.toFixed(0)}/20`);

  // Completeness (10 points)
  const completenessScore = missingPages.length === 0 ? 10 : Math.max(0, 10 - missingPages.length);
  score += completenessScore;
  scoreComponents.push(`Completeness: ${completenessScore.toFixed(0)}/10`);

  console.log(`  ${scoreComponents.join(', ')}`);
  console.log('');

  if (score >= 85) {
    console.log(`  ✅ Score: ${score.toFixed(0)}/100 - EXCELLENT`);
    console.log('  Dictionary is production-ready');
  } else if (score >= 70) {
    console.log(`  ⚠️  Score: ${score.toFixed(0)}/100 - GOOD`);
    console.log('  Dictionary is usable, but could be improved');
  } else if (score >= 50) {
    console.log(`  ❌ Score: ${score.toFixed(0)}/100 - FAIR`);
    console.log('  Dictionary needs significant improvement');
  } else {
    console.log(`  ❌ Score: ${score.toFixed(0)}/100 - POOR`);
    console.log('  Dictionary requires major work before production use');
  }
  console.log('');

  // Recommendations
  console.log('💡 Recommendations:');
  const recommendations = [];

  if (coverage < 90) {
    recommendations.push(`Add entries for ${missingPages.length} missing pages`);
  }
  if (weakPages.length > 10) {
    recommendations.push(`Strengthen ${weakPages.length} weak pages (add more entries)`);
  }
  if (duplicateKeywords > 20) {
    recommendations.push('Review keyword conflicts (some keywords appear on many pages)');
  }
  if (avgEntriesPerPage < 3) {
    recommendations.push('Increase average entries per page (currently too sparse)');
  }

  if (recommendations.length === 0) {
    console.log('  ✅ Dictionary is in good shape - no major changes needed');
  } else {
    recommendations.forEach((rec, i) => {
      console.log(`  ${i + 1}. ${rec}`);
    });
  }

  console.log('');
  console.log('═'.repeat(60));
  console.log('');

  // Return score for programmatic use
  return {
    score: Math.round(score),
    coverage: coverage.toFixed(1),
    totalEntries: entries.length,
    pagesWithEntries: pagesWithEntries.size,
    missingPages: missingPages.length,
    avgEntriesPerPage: avgEntriesPerPage.toFixed(1),
    weakPages: weakPages.length,
    duplicateKeywords,
    recommendations: recommendations.length
  };
}

// Run validation
if (require.main === module) {
  const result = validateDictionary();
  process.exit(result.score >= 70 ? 0 : 1);
}

module.exports = { validateDictionary };
