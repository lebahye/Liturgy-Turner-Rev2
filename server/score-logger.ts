/**
 * Score Logger — Liturgy Turner
 * Patches into processLiveAudio to capture every score decision
 * Drop-in addition to liturgy-tracker.ts — no breaking changes
 */

import fs from 'fs';
import path from 'path';

interface ScoreEntry {
  timestamp: number;
  currentPage: number;
  candidatePage: number;
  confidenceScore: number;
  mfccSimilarity: number;
  rmsSimilarity: number;
  centroidSimilarity: number;
  continuityBonus: number;
  detectedSpeaker: string;
  expectedSpeaker: string;
  triggered: boolean;
  manualCorrect?: boolean; // filled in post-session
  // Enhanced data capture (v2)
  speakerConfidence?: number;
  snr?: number;
  noiseLevel?: number;
  detectionLatencyMs?: number;
  recognizedWords?: Array<{ word: string; confidence: number }>;
  audioFeatures?: {
    spectralCentroid?: number;
    spectralRolloff?: number;
    rms?: number;
    zcr?: number;
    spectralFlatness?: number;
  };
  failureMode?: 'no_match' | 'low_confidence' | 'wrong_page' | 'threshold_not_met' | 'cooldown' | 'ok';
  source?: 'agent' | 'fallback' | 'manual';
}

interface SessionContext {
  priestName?: string;
  churchName?: string;
  serviceType?: string; // 'regular' | 'feast_day' | 'special'
  micDevice?: string;
  notes?: string;
}

interface SessionReport {
  sessionId: string;
  startTime: number;
  endTime?: number;
  totalChunks: number;
  triggeredTurns: number;
  entries: ScoreEntry[];
  summary?: SessionSummary;
  context?: SessionContext;
}

interface SessionSummary {
  avgConfidenceAll: number;
  avgConfidenceTriggered: number;
  avgConfidenceNotTriggered: number;
  maxScore: number;
  minScore: number;
  threshold: number;
  pagesNeverMatched: number[];
  pagesOverconfident: number[];
  recommendation: string;
}

export class ScoreLogger {
  private session: SessionReport;
  private dataDir: string;
  private sessionFile: string;
  private threshold: number;

  constructor(threshold: number = 0.85) {
    this.threshold = threshold;
    this.dataDir = path.join(process.cwd(), 'training-data');
    const date = new Date().toISOString().split('T')[0];
    const time = Date.now();
    this.session = {
      sessionId: `session-${date}-${time}`,
      startTime: time,
      totalChunks: 0,
      triggeredTurns: 0,
      entries: []
    };
    this.sessionFile = path.join(this.dataDir, `score-log-${date}-${time}.json`);
    console.log(`[ScoreLogger] Session started: ${this.session.sessionId}`);
  }

  setContext(ctx: SessionContext): void {
    this.session.context = ctx;
    console.log(`[ScoreLogger] Context set: ${JSON.stringify(ctx)}`);
  }

  logScore(entry: ScoreEntry): void {
    this.session.entries.push(entry);
    this.session.totalChunks++;
    if (entry.triggered) this.session.triggeredTurns++;

    // Live console output so you can watch in real time
    const flag = entry.triggered ? '✅ TURNED' : '  ------';
    console.log(
      `${flag} page=${entry.currentPage}→${entry.candidatePage} ` +
      `score=${entry.confidenceScore.toFixed(3)} ` +
      `mfcc=${entry.mfccSimilarity.toFixed(3)} ` +
      `speaker=${entry.detectedSpeaker}`
    );
  }

  endSession(): SessionSummary {
    this.session.endTime = Date.now();
    const summary = this.buildSummary();
    this.session.summary = summary;

    // Save JSON
    fs.writeFileSync(this.sessionFile, JSON.stringify(this.session, null, 2));

    // Save readable markdown report
    const reportFile = this.sessionFile.replace('.json', '.md');
    fs.writeFileSync(reportFile, this.buildMarkdownReport(summary));

    console.log(`[ScoreLogger] Session saved: ${this.sessionFile}`);
    console.log(`[ScoreLogger] Report saved: ${reportFile}`);
    console.log(`[ScoreLogger] Recommendation: ${summary.recommendation}`);

    return summary;
  }

  private buildSummary(): SessionSummary {
    const entries = this.session.entries;
    if (entries.length === 0) {
      return {
        avgConfidenceAll: 0,
        avgConfidenceTriggered: 0,
        avgConfidenceNotTriggered: 0,
        maxScore: 0,
        minScore: 0,
        threshold: this.threshold,
        pagesNeverMatched: [],
        pagesOverconfident: [],
        recommendation: 'No data collected'
      };
    }

    const allScores = entries.map(e => e.confidenceScore);
    const triggered = entries.filter(e => e.triggered);
    const notTriggered = entries.filter(e => !e.triggered);

    const avg = (arr: number[]) =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    // Pages that were attempted but never scored above 0.5
    const pageScores = new Map<number, number[]>();
    entries.forEach(e => {
      if (!pageScores.has(e.candidatePage)) pageScores.set(e.candidatePage, []);
      pageScores.get(e.candidatePage)!.push(e.confidenceScore);
    });

    const pagesNeverMatched: number[] = [];
    const pagesOverconfident: number[] = [];

    pageScores.forEach((scores, page) => {
      const maxForPage = Math.max(...scores);
      if (maxForPage < 0.5) pagesNeverMatched.push(page);
      if (maxForPage > 0.95 && !triggered.find(e => e.candidatePage === page)) {
        pagesOverconfident.push(page);
      }
    });

    // Build recommendation
    const avgAll = avg(allScores);
    let recommendation = '';

    if (avgAll < 0.3) {
      recommendation = `CRITICAL: avg score ${avgAll.toFixed(3)} — audio normalization needed. Phone MFCC profile does not match training data. Build normalization layer first.`;
    } else if (avgAll >= 0.3 && avgAll < 0.6) {
      recommendation = `Scores present but below threshold. Try lowering confidenceThreshold to ${(avgAll * 0.9).toFixed(2)} and re-test. Consider audio normalization.`;
    } else if (avgAll >= 0.6 && triggered.length === 0) {
      recommendation = `Scores are decent (avg ${avgAll.toFixed(3)}) but nothing triggers. Threshold ${this.threshold} is too high. Lower to ${(avgAll * 0.85).toFixed(2)}.`;
    } else if (triggered.length > 0 && pagesOverconfident.length > triggered.length) {
      recommendation = `Too many false positives. Raise threshold slightly to ${(this.threshold * 1.05).toFixed(2)} and expand lookahead window to 5.`;
    } else {
      recommendation = `System performing. ${triggered.length} turns triggered. Monitor for false positives.`;
    }

    return {
      avgConfidenceAll: avgAll,
      avgConfidenceTriggered: avg(triggered.map(e => e.confidenceScore)),
      avgConfidenceNotTriggered: avg(notTriggered.map(e => e.confidenceScore)),
      maxScore: Math.max(...allScores),
      minScore: Math.min(...allScores),
      threshold: this.threshold,
      pagesNeverMatched,
      pagesOverconfident,
      recommendation
    };
  }

  private buildMarkdownReport(summary: SessionSummary): string {
    const date = new Date().toISOString();
    return `# Score Logger Report — ${date}

## Session: ${this.session.sessionId}
- Total chunks processed: ${this.session.totalChunks}
- Turns triggered: ${this.session.triggeredTurns}
- Current threshold: ${summary.threshold}

## Score Distribution
| Metric | Value |
|--------|-------|
| Avg score (all) | ${summary.avgConfidenceAll.toFixed(3)} |
| Avg score (triggered) | ${summary.avgConfidenceTriggered.toFixed(3)} |
| Avg score (not triggered) | ${summary.avgConfidenceNotTriggered.toFixed(3)} |
| Max score | ${summary.maxScore.toFixed(3)} |
| Min score | ${summary.minScore.toFixed(3)} |

## Problem Pages
**Never matched (score < 0.5):** ${summary.pagesNeverMatched.join(', ') || 'none'}
**Overconfident but not triggered:** ${summary.pagesOverconfident.join(', ') || 'none'}

## Recommendation
**${summary.recommendation}**

## Top Scoring Entries
${this.session.entries
  .sort((a, b) => b.confidenceScore - a.confidenceScore)
  .slice(0, 10)
  .map(e => `- Page ${e.currentPage}→${e.candidatePage}: score=${e.confidenceScore.toFixed(3)} mfcc=${e.mfccSimilarity.toFixed(3)} triggered=${e.triggered}`)
  .join('\n')}
`;
  }
}

// Singleton for use across the app
let _logger: ScoreLogger | null = null;

export function getScoreLogger(): ScoreLogger | null {
  return _logger;
}

export function startScoreLogger(threshold: number): ScoreLogger {
  _logger = new ScoreLogger(threshold);
  return _logger;
}

export function stopScoreLogger(): SessionSummary | null {
  if (!_logger) return null;
  const summary = _logger.endSession();
  _logger = null;
  return summary;
}
