/**
 * capture-baseline.mjs
 * Run before any nightly parameter change
 * Saves current accuracy state as the rollback point
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../training-data');
const trackerFile = path.join(__dirname, '../server/liturgy-tracker.ts');
const baselineFile = path.join(dataDir, 'accuracy-baseline.json');

// Find most recent score log
const logs = fs.readdirSync(dataDir)
  .filter(f => f.startsWith('score-log-') && f.endsWith('.json'))
  .sort()
  .reverse();

if (logs.length === 0) {
  console.log('[BaselineCapture] No score logs found. Run a test session first.');
  console.log('[BaselineCapture] Capturing config-only baseline (no accuracy data).');
}

// Read current tracker parameters
const trackerContent = fs.readFileSync(trackerFile, 'utf8');
const thresholdMatch = trackerContent.match(/confidenceThreshold\s*=\s*([\d.]+)/);
const cooldownMatch = trackerContent.match(/transitionCooldown\s*=\s*(\d+)/);
const lookaheadMatch = trackerContent.match(/lookAheadWindow\s*=\s*(\d+)/);
const speakerWeightMatch = trackerContent.match(/speakerWeight\s*=\s*([\d.]+)/);
const fpWeightMatch = trackerContent.match(/fingerprintWeight\s*=\s*([\d.]+)/);

const currentConfig = {
  confidenceThreshold: parseFloat(thresholdMatch?.[1] || '0.85'),
  transitionCooldown: parseInt(cooldownMatch?.[1] || '4000'),
  lookAheadWindow: parseInt(lookaheadMatch?.[1] || '3'),
  speakerWeight: parseFloat(speakerWeightMatch?.[1] || '0.2'),
  fingerprintWeight: parseFloat(fpWeightMatch?.[1] || '0.8'),
};

// Read most recent score log if exists
let accuracyData = null;
if (logs.length > 0) {
  const latestLog = JSON.parse(fs.readFileSync(path.join(dataDir, logs[0]), 'utf8'));
  accuracyData = latestLog.summary || null;
}

const baseline = {
  capturedAt: new Date().toISOString(),
  trackerBackup: trackerFile + '.bak.' + Date.now(),
  config: currentConfig,
  accuracy: accuracyData,
};

// Backup current tracker
fs.copyFileSync(trackerFile, baseline.trackerBackup);

// Save baseline
fs.writeFileSync(baselineFile, JSON.stringify(baseline, null, 2));

console.log('[BaselineCapture] ✅ Baseline captured');
console.log(`[BaselineCapture] Config: threshold=${currentConfig.confidenceThreshold} lookahead=${currentConfig.lookAheadWindow}`);
console.log(`[BaselineCapture] Backup: ${baseline.trackerBackup}`);
if (accuracyData) {
  console.log(`[BaselineCapture] Accuracy: avgScore=${accuracyData.avgConfidenceAll?.toFixed(3)} triggered=${accuracyData.triggeredTurns || 0}`);
} else {
  console.log('[BaselineCapture] No prior accuracy data — first run baseline only.');
}
