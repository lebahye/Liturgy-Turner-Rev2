#!/usr/bin/env node
/**
 * VALIDATION TEST 5: Failure Analysis
 * 
 * Purpose: Understand WHY we're at 59% accuracy, not 99%
 * What patterns exist in the failures?
 */

import fs from 'fs';

console.log('🧪 TEST 5: Failure Analysis (Why 59% not 99%?)\n');

// Load test results
const testResults = JSON.parse(fs.readFileSync('/app/training-data/test-results-v2.json', 'utf8'));

// Categorize errors
let analysis = {
  totalTests: testResults.length,
  perfect: 0,
  within1: 0,
  within2: 0,
  within3: 0,
  moreThan3: 0,
  errorDistribution: {},
  highConfidenceWrong: [], // High confidence but wrong
  lowConfidenceRight: [], // Low confidence but right
  timingErrors: [], // Errors based on timing
  confidenceByAccuracy: {}
};

console.log('📊 Analyzing 157 test points...\n');

testResults.forEach(test => {
  const error = Math.abs(test.error);
  
  if (error === 0) {
    analysis.perfect++;
  } else if (error === 1) {
    analysis.within1++;
  } else if (error === 2) {
    analysis.within2++;
  } else if (error === 3) {
    analysis.within3++;
  } else {
    analysis.moreThan3++;
  }
  
  // Track error distribution
  analysis.errorDistribution[error] = (analysis.errorDistribution[error] || 0) + 1;
  
  // High confidence but wrong
  if (test.confidence > 0.8 && error > 0) {
    analysis.highConfidenceWrong.push({
      time: test.time,
      detected: test.detectedPage,
      expected: test.expectedPage,
      confidence: test.confidence,
      error: error
    });
  }
  
  // Low confidence but right
  if (test.confidence < 0.6 && error === 0) {
    analysis.lowConfidenceRight.push({
      time: test.time,
      page: test.detectedPage,
      confidence: test.confidence
    });
  }
  
  // Timing-based errors (when timeDiff is large)
  if (test.timeDiff > 20 && error > 0) {
    analysis.timingErrors.push({
      time: test.time,
      detected: test.detectedPage,
      expected: test.expectedPage,
      timeDiff: test.timeDiff,
      error: error
    });
  }
  
  // Confidence by accuracy
  const accuracyBucket = error === 0 ? 'correct' : error <= 2 ? 'close' : 'wrong';
  if (!analysis.confidenceByAccuracy[accuracyBucket]) {
    analysis.confidenceByAccuracy[accuracyBucket] = [];
  }
  analysis.confidenceByAccuracy[accuracyBucket].push(test.confidence);
});

// Calculate statistics
const exactAccuracy = (analysis.perfect / analysis.totalTests * 100).toFixed(1);
const within2Accuracy = ((analysis.perfect + analysis.within1 + analysis.within2) / analysis.totalTests * 100).toFixed(1);

console.log('📋 ACCURACY BREAKDOWN:\n');
console.log(`Exact matches: ${analysis.perfect} / ${analysis.totalTests} (${exactAccuracy}%)`);
console.log(`Within 1 page: ${analysis.within1} additional`);
console.log(`Within 2 pages: ${analysis.within2} additional`);
console.log(`Within 3 pages: ${analysis.within3} additional`);
console.log(`More than 3 pages off: ${analysis.moreThan3}`);
console.log(`\n📊 Cumulative accuracy:`);
console.log(`  Exact: ${exactAccuracy}%`);
console.log(`  Within 2 pages: ${within2Accuracy}%`);

console.log('\n🔍 ROOT CAUSE ANALYSIS:\n');

// Average confidence by accuracy
const avgConfCorrect = analysis.confidenceByAccuracy.correct.reduce((a,b)=>a+b,0) / analysis.confidenceByAccuracy.correct.length;
const avgConfClose = analysis.confidenceByAccuracy.close?.reduce((a,b)=>a+b,0) / (analysis.confidenceByAccuracy.close?.length || 1);
const avgConfWrong = analysis.confidenceByAccuracy.wrong?.reduce((a,b)=>a+b,0) / (analysis.confidenceByAccuracy.wrong?.length || 1);

console.log('Confidence scores by accuracy:');
console.log(`  Correct pages: ${avgConfCorrect.toFixed(3)} avg confidence`);
console.log(`  Close (1-2 off): ${avgConfClose.toFixed(3)} avg confidence`);
console.log(`  Wrong (3+ off): ${avgConfWrong.toFixed(3)} avg confidence`);

console.log(`\n⚠️ High confidence but WRONG: ${analysis.highConfidenceWrong.length} cases`);
if (analysis.highConfidenceWrong.length > 0) {
  console.log('  Sample:');
  analysis.highConfidenceWrong.slice(0, 3).forEach(err => {
    console.log(`    Time ${err.time}s: Detected p${err.detected}, actually p${err.expected} (conf: ${err.confidence.toFixed(2)})`);
  });
}

console.log(`\n⏰ Timing-based errors: ${analysis.timingErrors.length} cases`);
if (analysis.timingErrors.length > 0) {
  console.log('  (Large time gap between expected and detected)');
  const avgTimeDiff = analysis.timingErrors.reduce((sum, e) => sum + e.timeDiff, 0) / analysis.timingErrors.length;
  console.log(`  Average time difference: ${avgTimeDiff.toFixed(1)}s`);
}

console.log('\n💡 KEY INSIGHTS:\n');

// Insight 1: Are we close most of the time?
if (parseFloat(within2Accuracy) > 90) {
  console.log('✅ We are CLOSE most of the time (95% within 2 pages)');
  console.log('   → Problem is PRECISION, not fundamental approach');
  console.log('   → Better features/matching can fix this');
}

// Insight 2: Confidence calibration
const confGap = avgConfCorrect - avgConfWrong;
if (confGap < 0.2) {
  console.log('⚠️  Confidence scores poorly calibrated');
  console.log('   → Can\'t distinguish correct from wrong predictions');
  console.log('   → Need better confidence calculation');
}

// Insight 3: Timing matters
const timingPercentage = (analysis.timingErrors.length / analysis.totalTests * 100).toFixed(1);
if (parseFloat(timingPercentage) > 20) {
  console.log('⚠️  Many errors when time gap is large (${timingPercentage}%)');
  console.log('   → Time-based search window might be too narrow');
  console.log('   → Or page duration estimates are wrong');
}

// Insight 4: What's causing the 41% error?
console.log('\n🎯 THE 41% GAP (59% → 100%):');
const errorBreakdown = {
  'Off by 1': analysis.within1,
  'Off by 2': analysis.within2,  
  'Off by 3': analysis.within3,
  'Off by 4+': analysis.moreThan3
};

Object.entries(errorBreakdown).forEach(([desc, count]) => {
  const pct = (count / analysis.totalTests * 100).toFixed(1);
  console.log(`  ${desc}: ${count} cases (${pct}%)`);
});

console.log('\n🔬 ROOT CAUSES IDENTIFIED:\n');

const causes = [];

if (parseFloat(within2Accuracy) > 90) {
  causes.push('MINOR: Precision issues - we\'re close but not exact');
}
if (confGap < 0.2) {
  causes.push('MAJOR: Confidence calibration broken - can\'t trust scores');
}
if (analysis.highConfidenceWrong.length > 10) {
  causes.push('MAJOR: Audio features don\'t distinguish well enough');
}
if (parseFloat(timingPercentage) > 20) {
  causes.push('MEDIUM: Timing window or duration estimates need tuning');
}

causes.forEach((cause, i) => {
  console.log(`${i + 1}. ${cause}`);
});

console.log('\n💡 SOLUTION PATHS:\n');

if (causes.some(c => c.includes('Audio features'))) {
  console.log('❌ AUDIO FINGERPRINTING ALONE WON\'T REACH 99%');
  console.log('   → Features don\'t distinguish pages well enough');
  console.log('   → Need SEMANTIC understanding (language-based)');
  console.log('   ✅ Armenian learner skill is the right path');
} else {
  console.log('🤔 AUDIO FINGERPRINTING MIGHT WORK');
  console.log('   → Just needs better tuning and confidence calibration');
  console.log('   → Language learning might be overkill');
}

// Decision
const needsLanguageLearning = causes.some(c => c.includes('Audio features'));
console.log(`\n${needsLanguageLearning ? '✅' : '❌'} VERDICT: Language learning ${needsLanguageLearning ? 'IS' : 'IS NOT'} necessary`);

process.exit(0);
