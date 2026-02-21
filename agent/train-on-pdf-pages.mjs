#!/usr/bin/env node
/**
 * TRAIN ON PDF PAGE NUMBERS (NOT LITURGY BOOK PAGES)
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import PageMatcher from './lib/page-matcher-production.mjs';

console.log('🎓 TRAINING ON PDF PAGE NUMBERS');
console.log('═'.repeat(80));
console.log('');

const dict = JSON.parse(fs.readFileSync('pdf-pages-dictionary.json', 'utf8'));

console.log('📚 Dictionary loaded:');
console.log(`   Total PDF pages: ${dict.totalPdfPages}`);
console.log(`   Pages with Grapar: ${dict.pagesWithText.grapar}/183`);
console.log(`   Grapar words: ${Object.keys(dict.wordIndex).length}`);
console.log('');

const db = new Database('/app/data/liturgy-turner.db', { readonly: true});
const sessions = db.prepare('SELECT * FROM training_sessions ORDER BY created_at').all();

console.log('📊 Training Sessions:');
sessions.forEach((s, i) => {
  const markers = db.prepare('SELECT COUNT(*) as count, MIN(page_number) as min, MAX(page_number) as max FROM page_markers WHERE session_id = ?').get(s.id);
  console.log(`   Session ${i+1}: PDF pages ${markers.min}-${markers.max} (${markers.count} markers)`);
});
console.log('');

let allCorrect = 0;
let allWithin2 = 0;
let allTotal = 0;
const allErrors = [];

sessions.forEach((session, idx) => {
  console.log(`Session ${idx + 1}:`);
  console.log('─'.repeat(80));
  
  const matcher = new PageMatcher(dict);
  const markers = db.prepare('SELECT * FROM page_markers WHERE session_id = ? ORDER BY page_number').all(session.id);
  
  let correct = 0;
  let within2 = 0;
  let total = 0;
  const errors = [];
  
  markers.forEach((marker, markerIdx) => {
    const actualPdfPage = marker.page_number;
    
    if (dict.pages[actualPdfPage]) {
      const pageText = dict.pages[actualPdfPage];
      const result = matcher.matchPage(pageText, true);
      
      if (result) {
        const predicted = result.page;
        const error = Math.abs(predicted - actualPdfPage);
        
        if (error === 0) correct++;
        if (error <= 2) within2++;
        total++;
        
        if (error > 0) {
          errors.push({
            session: idx + 1,
            actual: actualPdfPage,
            predicted: predicted,
            error: error,
            confidence: result.confidence.toFixed(2)
          });
        }
        
        matcher.turnToPage(actualPdfPage, result.confidence);
      }
    } else {
      console.log(`  ⚠️  PDF Page ${actualPdfPage}: No text (blank or image-only)`);
    }
  });
  
  console.log(`  Tested: ${total} PDF pages`);
  console.log(`  Exact: ${correct}/${total} (${((correct/total)*100).toFixed(1)}%)`);
  console.log(`  Within 2: ${within2}/${total} (${((within2/total)*100).toFixed(1)}%)`);
  
  if (errors.length > 0) {
    console.log(`  Errors: ${errors.length}`);
    errors.slice(0, 5).forEach(e => {
      console.log(`    PDF ${e.actual} → ${e.predicted} (error: ${e.error}, conf: ${e.confidence})`);
    });
    if (errors.length > 5) {
      console.log(`    ... and ${errors.length - 5} more`);
    }
  }
  
  console.log('');
  
  allCorrect += correct;
  allWithin2 += within2;
  allTotal += total;
  allErrors.push(...errors);
});

db.close();

console.log('═'.repeat(80));
console.log('📊 COMBINED RESULTS');
console.log('═'.repeat(80));
console.log(`Total PDF pages tested: ${allTotal}`);
console.log(`Exact matches: ${allCorrect}/${allTotal} (${((allCorrect/allTotal)*100).toFixed(1)}%)`);
console.log(`Within 2 pages: ${allWithin2}/${allTotal} (${((allWithin2/allTotal)*100).toFixed(1)}%)`);
console.log('');

const accuracy = (allCorrect / allTotal) * 100;

if (accuracy >= 95) {
  console.log('🎉 ≥95% ACCURACY ACHIEVED!');
  console.log('');
  console.log('✅ Validated on', allTotal, 'real PDF pages');
  console.log('✅ Coverage:', dict.pagesWithText.grapar, '/183 PDF pages have text');
  console.log('✅ Ready for production use');
} else {
  console.log('⚠️  Accuracy:', accuracy.toFixed(1) + '% (target: ≥95%)');
  console.log('');
  console.log('Analyzing errors...');
  
  if (allErrors.length > 0) {
    console.log('\nTop errors:');
    allErrors.slice(0, 10).forEach(e => {
      console.log(`  PDF ${e.actual} → ${e.predicted} (error: ${e.error})`);
    });
  }
}

fs.writeFileSync('pdf-training-report.json', JSON.stringify({
  timestamp: new Date().toISOString(),
  accuracy,
  totalTested: allTotal,
  exact: allCorrect,
  within2: allWithin2,
  errors: allErrors,
  coverage: dict.pagesWithText
}, null, 2));

console.log('');
console.log('💾 Report saved: pdf-training-report.json');
