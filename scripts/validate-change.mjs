/**
 * validate-change.mjs
 * Run AFTER a nightly parameter change
 * Compares against baseline — rolls back if accuracy dropped
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../training-data');
const trackerFile = path.join(__dirname, '../server/liturgy-tracker.ts');
const baselineFile = path.join(dataDir, 'accuracy-baseline.json');

if (!fs.existsSync(baselineFile)) {
  console.log('[ValidateChange] No baseline found. Run capture-baseline.mjs first.');
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));

// Find score logs newer than baseline
const baselineTime = new Date(baseline.capturedAt).getTime();
const newLogs = fs.readdirSync(dataDir)
  .filter(f => f.startsWith('score-log-') && f.endsWith('.json'))
  .filter(f => {
    const parts = f.replace('score-log-', '').replace('.json', '').split('-');
    const ts = parseInt(parts[parts.length - 1]);
    return ts > baselineTime;
  })
  .sort()
  .reverse();

if (newLogs.length === 0) {
  console.log('[ValidateChange] No new score logs since baseline.');
  console.log('[ValidateChange] Run a test session, then validate.');
  console.log('[ValidateChange] ⚠️  Cannot validate without test data — change NOT committed.');
  process.exit(1);
}

const newLog = JSON.parse(fs.readFileSync(path.join(dataDir, newLogs[0]), 'utf8'));
const newAccuracy = newLog.summary;

if (!newAccuracy || !baseline.accuracy) {
  console.log('[ValidateChange] ⚠️  Cannot compare — missing accuracy data in baseline or new log.');
  console.log('[ValidateChange] Proceeding with config-only validation.');
  console.log('[ValidateChange] ✅ Change accepted (no accuracy regression data available).');
  process.exit(0);
}

// Compare
const baseAvg = baseline.accuracy.avgConfidenceAll || 0;
const newAvg = newAccuracy.avgConfidenceAll || 0;
const baseMissed = baseline.accuracy.pagesNeverMatched?.length || 0;
const newMissed = newAccuracy.pagesNeverMatched?.length || 0;

const avgDropped = newAvg < baseAvg * 0.95; // more than 5% drop
const missedIncreased = newMissed > baseMissed;

console.log('[ValidateChange] Comparing:');
console.log(`  Baseline avgScore: ${baseAvg.toFixed(3)}`);
console.log(`  New avgScore:      ${newAvg.toFixed(3)}`);
console.log(`  Baseline unmatched pages: ${baseMissed}`);
console.log(`  New unmatched pages:      ${newMissed}`);

if (avgDropped || missedIncreased) {
  console.log('\n[ValidateChange] ❌ REGRESSION DETECTED — Rolling back');
  if (avgDropped) console.log(`  avgScore dropped ${((baseAvg - newAvg) / baseAvg * 100).toFixed(1)}% (limit: 5%)`);
  if (missedIncreased) console.log(`  Unmatched pages increased by ${newMissed - baseMissed}`);

  // Rollback
  fs.copyFileSync(baseline.trackerBackup, trackerFile);
  console.log(`\n[ValidateChange] ✅ Rolled back to: ${baseline.trackerBackup}`);
  console.log('[ValidateChange] No changes committed. Investigate before retrying.');
  process.exit(2);
} else {
  console.log('\n[ValidateChange] ✅ Change ACCEPTED — no regression');
  console.log(`  avgScore: ${baseAvg.toFixed(3)} → ${newAvg.toFixed(3)}`);
  // Clean up old backups (keep last 3)
  const backups = fs.readdirSync(path.dirname(trackerFile))
    .filter(f => f.includes('liturgy-tracker.ts.bak.'))
    .sort().reverse();
  backups.slice(3).forEach(b => {
    fs.unlinkSync(path.join(path.dirname(trackerFile), b));
    console.log(`  Cleaned old backup: ${b}`);
  });
  process.exit(0);
}
