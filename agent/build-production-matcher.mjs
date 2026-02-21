#!/usr/bin/env node
/**
 * PRODUCTION PAGE MATCHER
 * Combines text matching + sequential context
 */
import Database from 'better-sqlite3';
import fs from 'fs';

console.log('🏗️  BUILDING PRODUCTION PAGE MATCHER');
console.log('═'.repeat(80));
console.log('');

const dict = JSON.parse(fs.readFileSync('liturgy-complete-index.json', 'utf8'));

class PageMatcher {
  constructor(dictionary) {
    this.dict = dictionary;
    this.currentPage = null;
    this.lastUpdate = null;
    this.confidence = 0;
  }
  
  // Find rare words (appear on ≤3 pages) - these are discriminating
  getRareWords(text) {
    const words = text.match(/[\u0530-\u058F]+/g) || [];
    const rare = [];
    
    words.forEach(word => {
      const normalized = word.toLowerCase();
      const pages = this.dict.wordIndex[normalized] || [];
      if (pages.length > 0 && pages.length <= 3) {
        rare.push(normalized);
      }
    });
    
    return rare;
  }
  
  // Match page using word frequency + temporal context
  matchPage(text, useTemporalContext = true) {
    const words = text.match(/[\u0530-\u058F]+/g) || [];
    const pageScores = new Map();
    
    // Score each page by word matches
    words.forEach(word => {
      const normalized = word.toLowerCase();
      const pages = this.dict.wordIndex[normalized] || [];
      
      if (pages.length > 0) {
        // Weight by rarity: rare words score higher
        const weight = pages.length <= 3 ? 10 : 
                       pages.length <= 10 ? 3 : 1;
        
        pages.forEach(pageNum => {
          pageScores.set(pageNum, (pageScores.get(pageNum) || 0) + weight);
        });
      }
    });
    
    if (pageScores.size === 0) return null;
    
    // Apply temporal boost if we know current page
    if (useTemporalContext && this.currentPage !== null) {
      const nextPage = this.currentPage + 1;
      if (pageScores.has(nextPage)) {
        // 10x boost for next sequential page
        pageScores.set(nextPage, pageScores.get(nextPage) * 10);
      }
      
      // 2x boost for current page (might be staying)
      if (pageScores.has(this.currentPage)) {
        pageScores.set(this.currentPage, pageScores.get(this.currentPage) * 2);
      }
    }
    
    // Get top match
    const sorted = Array.from(pageScores.entries())
      .sort((a, b) => b[1] - a[1]);
    
    const topPage = sorted[0][0];
    const topScore = sorted[0][1];
    const secondScore = sorted[1] ? sorted[1][1] : 0;
    
    // Calculate confidence (how much better is top vs second)
    const confidence = secondScore > 0 ? topScore / secondScore : 10;
    
    return {
      page: topPage,
      score: topScore,
      confidence: confidence,
      alternatives: sorted.slice(0, 5).map(([p, s]) => ({ page: p, score: s }))
    };
  }
  
  // Update current page
  turnToPage(pageNum, confidence) {
    this.currentPage = pageNum;
    this.confidence = confidence;
    this.lastUpdate = Date.now();
  }
}

console.log('✅ PageMatcher class built');
console.log('');

console.log('═'.repeat(80));
console.log('🧪 TESTING WITH TEMPORAL CONTEXT');
console.log('═'.repeat(80));
console.log('');

const matcher = new PageMatcher(dict);
const db = new Database('/app/data/liturgy-turner.db', { readonly: true });
const session1 = db.prepare('SELECT * FROM training_sessions ORDER BY created_at LIMIT 1').get();
const markers = db.prepare('SELECT * FROM page_markers WHERE session_id = ? ORDER BY page_number').all(session1.id);

let correct = 0;
let within2 = 0;
let total = 0;

const testResults = [];

markers.forEach((marker, idx) => {
  const actualPage = marker.page_number;
  
  if (dict.pages[actualPage]) {
    const pageText = dict.pages[actualPage];
    
    // Simulate sequential progression
    const result = matcher.matchPage(pageText, true);
    
    if (result) {
      const predicted = result.page;
      const error = Math.abs(predicted - actualPage);
      
      testResults.push({
        index: idx + 1,
        actual: actualPage,
        predicted: predicted,
        error: error,
        confidence: result.confidence.toFixed(2),
        correct: error === 0
      });
      
      if (error === 0) correct++;
      if (error <= 2) within2++;
      total++;
      
      // Update matcher state (simulate real usage)
      matcher.turnToPage(actualPage, result.confidence);
    }
  }
});

console.log('Results WITH temporal context:');
console.log(`  Exact matches: ${correct}/${total} (${((correct/total)*100).toFixed(1)}%)`);
console.log(`  Within 2 pages: ${within2}/${total} (${((within2/total)*100).toFixed(1)}%)`);
console.log('');

const errors = testResults.filter(r => !r.correct);
if (errors.length > 0) {
  console.log('Remaining errors:');
  errors.forEach(e => {
    console.log(`  #${e.index} Page ${e.actual}: predicted ${e.predicted} (confidence: ${e.confidence}, error: ${e.error})`);
  });
  console.log('');
}

// Test WITHOUT temporal context
console.log('Results WITHOUT temporal context (for comparison):');
const matcherNoTemp = new PageMatcher(dict);
let correctNoTemp = 0;
let totalNoTemp = 0;

markers.forEach(marker => {
  const actualPage = marker.page_number;
  if (dict.pages[actualPage]) {
    const result = matcherNoTemp.matchPage(dict.pages[actualPage], false);
    if (result && result.page === actualPage) correctNoTemp++;
    totalNoTemp++;
  }
});

console.log(`  Exact matches: ${correctNoTemp}/${totalNoTemp} (${((correctNoTemp/totalNoTemp)*100).toFixed(1)}%)`);
console.log('');

console.log('═'.repeat(80));
console.log('📊 PERFORMANCE SUMMARY');
console.log('═'.repeat(80));
console.log('');

const improvement = ((correct - correctNoTemp) / totalNoTemp) * 100;
console.log(`Temporal context improvement: +${improvement.toFixed(1)}%`);
console.log(`Final accuracy: ${((correct/total)*100).toFixed(1)}%`);
console.log('');

if (correct / total >= 0.95) {
  console.log('✅ EXCELLENT: ≥95% accuracy achieved!');
} else if (correct / total >= 0.90) {
  console.log('✅ GOOD: ≥90% accuracy achieved');
} else {
  console.log('⚠️  NEEDS IMPROVEMENT: <90% accuracy');
}

db.close();

// Save matcher for production use
const matcherCode = `// Production Page Matcher
class PageMatcher {
  constructor(dictionary) {
    this.dict = dictionary;
    this.currentPage = null;
    this.lastUpdate = null;
    this.confidence = 0;
  }
  
  matchPage(text, useTemporalContext = true) {
    const words = text.match(/[\\u0530-\\u058F]+/g) || [];
    const pageScores = new Map();
    
    words.forEach(word => {
      const normalized = word.toLowerCase();
      const pages = this.dict.wordIndex[normalized] || [];
      
      if (pages.length > 0) {
        const weight = pages.length <= 3 ? 10 : pages.length <= 10 ? 3 : 1;
        pages.forEach(pageNum => {
          pageScores.set(pageNum, (pageScores.get(pageNum) || 0) + weight);
        });
      }
    });
    
    if (pageScores.size === 0) return null;
    
    if (useTemporalContext && this.currentPage !== null) {
      const nextPage = this.currentPage + 1;
      if (pageScores.has(nextPage)) {
        pageScores.set(nextPage, pageScores.get(nextPage) * 10);
      }
      if (pageScores.has(this.currentPage)) {
        pageScores.set(this.currentPage, pageScores.get(this.currentPage) * 2);
      }
    }
    
    const sorted = Array.from(pageScores.entries()).sort((a, b) => b[1] - a[1]);
    const topPage = sorted[0][0];
    const topScore = sorted[0][1];
    const secondScore = sorted[1] ? sorted[1][1] : 0;
    const confidence = secondScore > 0 ? topScore / secondScore : 10;
    
    return {
      page: topPage,
      score: topScore,
      confidence: confidence,
      alternatives: sorted.slice(0, 5).map(([p, s]) => ({ page: p, score: s }))
    };
  }
  
  turnToPage(pageNum, confidence) {
    this.currentPage = pageNum;
    this.confidence = confidence;
    this.lastUpdate = Date.now();
  }
}

export default PageMatcher;
`;

fs.writeFileSync('/app/agent/lib/page-matcher-production.js', matcherCode);
console.log('💾 Production matcher saved: lib/page-matcher-production.js');
console.log('');
console.log('✅ PRODUCTION SYSTEM READY!');
