#!/usr/bin/env node
/**
 * Post-Session Analysis Script
 * Reads score logs, identifies weak pages, generates retraining recommendations.
 *
 * Usage: node scripts/analyze-session.mjs [score-log-file.json]
 *        node scripts/analyze-session.mjs --latest
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'training-data');

function findLatestLog() {
  const files = fs.readdirSync(DATA_DIR)
    .filter(f => f.startsWith('score-log-') && f.endsWith('.json'))
    .sort()
    .reverse();
  return files[0] ? path.join(DATA_DIR, files[0]) : null;
}

function analyze(logPath) {
  const data = JSON.parse(fs.readFileSync(logPath, 'utf8'));
  const entries = data.entries || [];

  console.log(`\n═══ SESSION ANALYSIS: ${data.sessionId || 'unknown'} ═══`);
  console.log(`File: ${path.basename(logPath)}`);
  console.log(`Duration: ${data.startTime && data.endTime ? Math.round((data.endTime - data.startTime) / 1000) + 's' : '?'}`);
  console.log(`Total chunks: ${entries.length}`);
  console.log(`Triggered turns: ${entries.filter(e => e.triggered).length}`);

  if (entries.length === 0) {
    console.log('\n⚠ NO DATA COLLECTED — Score logger likely not wired to audio path.');
    console.log('  Fix: Ensure /api/agent/feed-audio route calls getScoreLogger().logScore()');
    return;
  }

  // Page accuracy analysis
  const pageStats = new Map();
  for (const e of entries) {
    const page = e.candidatePage;
    if (!pageStats.has(page)) pageStats.set(page, { attempts: 0, triggered: 0, scores: [], speakers: new Set() });
    const s = pageStats.get(page);
    s.attempts++;
    if (e.triggered) s.triggered++;
    s.scores.push(e.confidenceScore);
    if (e.detectedSpeaker) s.speakers.add(e.detectedSpeaker);
  }

  // Weak pages (attempted but never triggered or low confidence)
  const weakPages = [];
  const strongPages = [];
  for (const [page, stats] of pageStats) {
    const avgScore = stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length;
    if (avgScore < 0.5 || (stats.attempts > 2 && stats.triggered === 0)) {
      weakPages.push({ page, avgScore, attempts: stats.attempts, triggered: stats.triggered });
    } else if (avgScore > 0.8) {
      strongPages.push({ page, avgScore, attempts: stats.attempts, triggered: stats.triggered });
    }
  }

  console.log(`\n─── WEAK PAGES (need retraining) ───`);
  if (weakPages.length === 0) {
    console.log('  None detected');
  } else {
    weakPages.sort((a, b) => a.avgScore - b.avgScore);
    for (const p of weakPages.slice(0, 20)) {
      console.log(`  Page ${p.page}: avg=${p.avgScore.toFixed(3)}, attempts=${p.attempts}, triggered=${p.triggered}`);
    }
  }

  console.log(`\n─── STRONG PAGES ───`);
  console.log(`  ${strongPages.length} pages with avg score > 0.8`);

  // Failure mode analysis
  const failureModes = { no_match: 0, low_confidence: 0, wrong_page: 0, threshold_not_met: 0, ok: 0, unknown: 0 };
  for (const e of entries) {
    const mode = e.failureMode || (e.triggered ? 'ok' : e.confidenceScore < 0.3 ? 'no_match' : e.confidenceScore < 0.6 ? 'low_confidence' : 'threshold_not_met');
    failureModes[mode] = (failureModes[mode] || 0) + 1;
  }

  console.log(`\n─── FAILURE MODES ───`);
  for (const [mode, count] of Object.entries(failureModes)) {
    if (count > 0) console.log(`  ${mode}: ${count} (${(count/entries.length*100).toFixed(1)}%)`);
  }

  // Speaker analysis
  const speakerStats = {};
  for (const e of entries) {
    const speaker = e.detectedSpeaker || 'unknown';
    if (!speakerStats[speaker]) speakerStats[speaker] = { count: 0, triggered: 0, totalScore: 0 };
    speakerStats[speaker].count++;
    if (e.triggered) speakerStats[speaker].triggered++;
    speakerStats[speaker].totalScore += e.confidenceScore;
  }

  console.log(`\n─── SPEAKER ANALYSIS ───`);
  for (const [speaker, stats] of Object.entries(speakerStats)) {
    const avg = stats.totalScore / stats.count;
    console.log(`  ${speaker}: ${stats.count} chunks, ${stats.triggered} triggers, avg=${avg.toFixed(3)}`);
  }

  // Recommendations
  console.log(`\n─── RECOMMENDATIONS ───`);
  const avgAll = entries.reduce((a, e) => a + e.confidenceScore, 0) / entries.length;

  if (avgAll < 0.3) {
    console.log('  1. CRITICAL: Average score very low. Check microphone connection and placement.');
    console.log('  2. Run audio normalizer calibration before next session.');
  } else if (avgAll < 0.6) {
    console.log('  1. Scores present but below threshold. Consider lowering confidence threshold.');
    console.log(`  2. Current avg: ${avgAll.toFixed(3)}. Suggested threshold: ${(avgAll * 0.85).toFixed(2)}`);
  }

  if (weakPages.length > 10) {
    console.log(`  3. ${weakPages.length} weak pages detected. Focus manual training on pages: ${weakPages.slice(0, 10).map(p => p.page).join(', ')}`);
  }

  // Write analysis to file
  const analysisPath = logPath.replace('.json', '-analysis.json');
  const analysis = {
    sessionId: data.sessionId,
    analyzedAt: new Date().toISOString(),
    totalChunks: entries.length,
    triggeredTurns: entries.filter(e => e.triggered).length,
    avgConfidence: avgAll,
    weakPages: weakPages.map(p => ({ page: p.page, avgScore: p.avgScore })),
    strongPages: strongPages.length,
    failureModes,
    speakerStats,
    recommendations: data.summary?.recommendation || '',
  };
  fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2));
  console.log(`\n✅ Analysis saved: ${path.basename(analysisPath)}`);
}

// Main
const arg = process.argv[2];
let logPath;

if (arg === '--latest' || !arg) {
  logPath = findLatestLog();
  if (!logPath) { console.error('No score logs found'); process.exit(1); }
} else {
  logPath = path.resolve(arg);
}

if (!fs.existsSync(logPath)) { console.error(`File not found: ${logPath}`); process.exit(1); }
analyze(logPath);
