#!/usr/bin/env node
/**
 * Liturgy Turner — Unified Audio API
 * 
 * Handles BOTH:
 * 1. Direct microphone input (laptop/external mic) — PRIMARY for shipping
 * 2. Browser audio chunks (WebM) — SECONDARY for admin/remote use
 * 

 * NO WHISPER. NO STT APIs.
 * Pure MFCC acoustic fingerprinting + pattern matching.
 * 
 * Architecture:
 *   Mic/Browser → PCM → armenian-learner V3 (MFCC + patterns) → page turn
 */

import { spawn } from 'child_process';
import express from 'express';
import multer from 'multer';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

const app = express();
const upload = multer({ limits: { fileSize: 20 * 1024 * 1024 } });
app.use(express.json({ limit: '20mb' }));

// ─── Config ──────────────────────────────────────────────────────────────────

const APP_URL = process.env.APP_BASE_URL || 'http://localhost:5001';
const PORT    = parseInt(process.env.AUDIO_API_PORT || '29788');
const MIC_DEVICE = process.env.MIC_DEVICE || null; // null = system default
const MIC_SAMPLE_RATE = parseInt(process.env.MIC_SAMPLE_RATE || '16000');
const CONFIDENCE_THRESHOLD = parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.5');
const SEQUENTIAL_BOOST = parseFloat(process.env.SEQUENTIAL_BOOST || '0.10');
const MAX_PAGE_JUMP = parseInt(process.env.MAX_PAGE_JUMP || '5');

// ─── Load armenian-learner skill ──────────────────────────────────────────────

const skillPath = join(__dirname, 'skills/armenian-learner/index.js');
let skill;

try {
  skill = await import(skillPath);
  console.log('[audio-api] ✅ armenian-learner skill loaded');
  console.log('[audio-api] Functions:', Object.keys(skill).filter(k => typeof skill[k] === 'function').join(', '));
} catch (err) {
  console.error('[audio-api] ❌ Failed to load skill:', err.message);
  process.exit(1);
}

// ─── Load MultiLanguageMatcher ────────────────────────────────────────────────

let textMatcher = null;
const dictPath = join(__dirname, '../training-data/text-matcher-db.json');

try {
  const { default: MultiLanguageMatcher } = await import(
    join(__dirname, 'skills/liturgy-audio-controller/multi-language-matcher.mjs')
  );
  if (fs.existsSync(dictPath)) {
    const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
    textMatcher = new MultiLanguageMatcher(dict);
    console.log('[audio-api] ✅ MultiLanguageMatcher loaded');
  } else {
    console.warn('[audio-api] ⚠️  text-matcher-db.json not found — text matching disabled');
  }
} catch (err) {
  console.warn('[audio-api] ⚠️  MultiLanguageMatcher not loaded:', err.message);
}

// ─── Score Logger ─────────────────────────────────────────────────────────────

const LOG_DIR = process.env.TRAINING_DATA_DIR || join(__dirname, '../training-data');
let scoreSession = null;

function startScoreLog() {
  const date = new Date().toISOString().split('T')[0];
  const ts = Date.now();
  scoreSession = {
    sessionId: `session-${date}-${ts}`,
    startTime: ts,
    entries: [],
    logFile: join(LOG_DIR, `score-log-${date}-${ts}.json`)
  };
  console.log(`[score-log] Session started: ${scoreSession.sessionId}`);
}

function logScore(entry) {
  if (!scoreSession) return;
  scoreSession.entries.push({ ...entry, timestamp: Date.now() });
  const flag = entry.triggered ? '✅ TURNED' : '  ------';
  console.log(
    `${flag} page=${entry.currentPage}→${entry.candidatePage} ` +
    `score=${entry.finalScore?.toFixed(3)} ` +
    `mfcc=${entry.mfccScore?.toFixed(3)} ` +
    `text=${entry.textScore?.toFixed(3)}`
  );
}

function stopScoreLog() {
  if (!scoreSession) return null;
  scoreSession.endTime = Date.now();
  const entries = scoreSession.entries;
  const scores = entries.map(e => e.finalScore || 0);
  const triggered = entries.filter(e => e.triggered);
  const avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;

  const summary = {
    totalChunks: entries.length,
    triggeredTurns: triggered.length,
    avgConfidenceAll: avg(scores),
    avgConfidenceTriggered: avg(triggered.map(e => e.finalScore || 0)),
    maxScore: scores.length ? Math.max(...scores) : 0,
    minScore: scores.length ? Math.min(...scores) : 0,
    threshold: CONFIDENCE_THRESHOLD
  };

  // Recommendation
  if (summary.avgConfidenceAll < 0.3) {
    summary.recommendation = `CRITICAL: avg score ${summary.avgConfidenceAll.toFixed(3)} — check mic connection and placement`;
  } else if (summary.avgConfidenceAll < 0.5) {
    summary.recommendation = `Scores below threshold. Move mic closer to altar. Consider external directional mic.`;
  } else if (triggered.length === 0) {
    summary.recommendation = `Scores present (avg ${summary.avgConfidenceAll.toFixed(3)}) but nothing triggered. Threshold ${CONFIDENCE_THRESHOLD} may be too high.`;
  } else {
    summary.recommendation = `System performing. ${triggered.length} turns triggered.`;
  }

  scoreSession.summary = summary;

  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(scoreSession.logFile, JSON.stringify(scoreSession, null, 2));
    console.log(`[score-log] Saved: ${scoreSession.logFile}`);
  } catch (err) {
    console.error('[score-log] Failed to save:', err.message);
  }

  const result = scoreSession;
  scoreSession = null;
  return result;
}

// ─── State ────────────────────────────────────────────────────────────────────

let currentPage = 1;
let micInstance = null;
let isListening = false;

// ─── Confidence evaluation with sequential logic ──────────────────────────────

function evaluateConfidence(candidatePage, mfccScore, textScore) {
  // Fuse MFCC (60%) + Text (40%)
  const textWeight = textMatcher ? 0.4 : 0.0;
  const mfccWeight = textMatcher ? 0.6 : 1.0;
  let baseScore = (mfccScore * mfccWeight) + (textScore * textWeight);

  let finalScore = baseScore;
  let reason = `base=${baseScore.toFixed(3)}`;

  // Sequential logic
  const gap = candidatePage - currentPage;
  if (gap === 1) {
    finalScore = Math.min(1.0, finalScore + SEQUENTIAL_BOOST);
    reason += ` +seq_boost`;
  } else if (gap === 2) {
    finalScore = Math.min(1.0, finalScore + SEQUENTIAL_BOOST * 0.5);
    reason += ` +half_boost`;
  } else if (gap < 0) {
    finalScore *= 0.1;
    reason += ` -90%_backwards`;
  } else if (gap > MAX_PAGE_JUMP) {
    finalScore *= 0.3;
    reason += ` -70%_jump_too_large`;
  } else if (gap > 2) {
    const penalty = Math.max(0.3, 1 - gap * 0.1);
    finalScore *= penalty;
    reason += ` -gap_penalty`;
  }

  return { finalScore: Math.max(0, Math.min(1, finalScore)), reason };
}

// ─── Core audio processing ────────────────────────────────────────────────────

async function processAudioSamples(float32Samples, sourceLabel = 'unknown') {
  if (!float32Samples || float32Samples.length === 0) return null;

  try {
    // Feed to armenian-learner V3
    const result = await skill.feedAudio(float32Samples);

    if (!result || result.status === 'buffering') {
      return { status: 'buffering' };
    }

    const mfccScore = result.confidence || 0;
    const candidatePage = result.page;

    if (!candidatePage) return { status: 'no_match' };

    // Text matching (optional second signal)
    let textScore = 0;
    if (textMatcher && result.recognizedWords?.length > 0) {
      const wordStr = result.recognizedWords.map(w => w.word).join(' ');
      const textResult = textMatcher.matchPage(wordStr, 'auto', true);
      if (textResult && textResult.page === candidatePage) {
        textScore = Math.min(1.0, (textResult.confidence || 0) / 10.0);
      }
    }

    // Evaluate with sequential logic
    const { finalScore, reason } = evaluateConfidence(candidatePage, mfccScore, textScore);
    const triggered = finalScore >= CONFIDENCE_THRESHOLD && candidatePage !== currentPage;

    // Log score
    logScore({
      source: sourceLabel,
      currentPage,
      candidatePage,
      mfccScore,
      textScore,
      finalScore,
      triggered,
      reason
    });

    // Turn page if confident
    if (triggered) {
      console.log(`[audio-api] 🎯 Page ${currentPage}→${candidatePage} (${(finalScore*100).toFixed(1)}%) — ${reason}`);
      currentPage = candidatePage;

      try {
        const res = await fetch(`${APP_URL}/api/control/page/set`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            page: candidatePage,
            reason: `audio_match_${sourceLabel}`,
            confidence: finalScore
          }),
          signal: AbortSignal.timeout(3000)
        });
        if (res.ok) console.log('[audio-api] ✅ Page turn delivered');
        else console.error(`[audio-api] ⚠️  Page turn failed: ${res.status}`);
      } catch (err) {
        console.error('[audio-api] ⚠️  Page turn error:', err.message);
      }
    }

    return { status: 'processed', page: candidatePage, confidence: finalScore, triggered };

  } catch (err) {
    console.error('[audio-api] Processing error:', err.message);
    return { status: 'error', error: err.message };
  }
}

// ─── Mic input (PCM direct) ───────────────────────────────────────────────────

async function startMic(deviceId = null) {
  if (isListening) return { success: false, message: 'Already listening' };

  let micModule;
  try {
    micModule = require('mic');
  } catch (err) {
    return { success: false, error: 'mic package not installed. Run: npm install mic' };
  }

  const micConfig = {
    rate: MIC_SAMPLE_RATE.toString(),
    channels: '1',
    debug: false,
    exitOnSilence: 0,
    fileType: 'raw',
    encoding: 'signed-integer',
    bitwidth: '16',
    ...(deviceId ? { device: deviceId } : {})
  };

  try {
    micInstance = micModule(micConfig);
    const micStream = micInstance.getAudioStream();

    let audioBuffer = Buffer.alloc(0);
    const CHUNK_BYTES = MIC_SAMPLE_RATE * 2 * 3; // 3 seconds of 16-bit mono

    micStream.on('data', async (data) => {
      audioBuffer = Buffer.concat([audioBuffer, data]);

      while (audioBuffer.length >= CHUNK_BYTES) {
        const chunk = audioBuffer.slice(0, CHUNK_BYTES);
        audioBuffer = audioBuffer.slice(CHUNK_BYTES);

        // Convert 16-bit PCM → Float32
        const samples = new Float32Array(chunk.length / 2);
        for (let i = 0; i < samples.length; i++) {
          samples[i] = chunk.readInt16LE(i * 2) / 32768.0;
        }

        await processAudioSamples(samples, 'mic');
      }
    });

    micStream.on('error', (err) => {
      console.error('[audio-api] Mic error:', err.message);
      stopMic();
    });

    micInstance.start();
    isListening = true;
    console.log(`[audio-api] 🎤 Mic started — device: ${deviceId || 'default'}, rate: ${MIC_SAMPLE_RATE}Hz`);
    return { success: true, device: deviceId || 'default', sampleRate: MIC_SAMPLE_RATE };

  } catch (err) {
    return { success: false, error: err.message };
  }
}

function stopMic() {
  if (!isListening || !micInstance) return { success: false, message: 'Not listening' };
  try {
    micInstance.stop();
    micInstance = null;
    isListening = false;
    console.log('[audio-api] 🎤 Mic stopped');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function listMicDevices() {
  try {
    const { execSync } = require('child_process');
    let devices = [];
    if (process.platform === 'darwin') {
      // macOS
      const out = execSync('system_profiler SPAudioDataType 2>/dev/null || echo ""').toString();
      const lines = out.split('\n').filter(l => l.includes('Input') || l.includes('Microphone') || l.includes('Built-in'));
      devices = lines.map(l => l.trim()).filter(Boolean);
    } else if (process.platform === 'win32') {
      // Windows
      const out = execSync('powershell -Command "Get-WmiObject -Class Win32_SoundDevice | Select-Object Name | Format-List" 2>nul || echo ""').toString();
      devices = out.split('\n').filter(l => l.includes('Name')).map(l => l.replace('Name :', '').trim()).filter(Boolean);
    } else {
      // Linux
      const out = execSync('arecord -l 2>/dev/null || echo ""').toString();
      devices = out.split('\n').filter(l => l.startsWith('card')).map(l => l.trim());
    }
    return { success: true, devices };
  } catch (err) {
    return { success: true, devices: [], note: 'Could not enumerate devices — default mic will be used' };
  }
}

// ─── HTTP API ─────────────────────────────────────────────────────────────────

// Health
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    skill: 'armenian-learner-v3',
    micActive: isListening,
    textMatcherLoaded: !!textMatcher,
    currentPage,
    appUrl: APP_URL,
    threshold: CONFIDENCE_THRESHOLD
  });
});

// Mic control
app.post('/mic/start', async (req, res) => {
  const { device } = req.body || {};
  const result = await startMic(device || MIC_DEVICE);
  res.json(result);
});

app.post('/mic/stop', (_req, res) => {
  res.json(stopMic());
});

app.get('/mic/devices', (_req, res) => {
  res.json(listMicDevices());
});

// Browser audio (WebM/Opus from Live.tsx — IMPROVED LOGGING)
app.post('/feed-audio', upload.single('audio'), async (req, res) => {
  try {
    let audioBuffer;
    if (req.file) {
      audioBuffer = req.file.buffer;
      console.log(`[audio-api] Received ${audioBuffer.length} bytes via multipart (${req.file.mimetype})`);
    } else if (req.body?.audioData) {
      const b64 = String(req.body.audioData);
      const comma = b64.indexOf(',');
      audioBuffer = Buffer.from(comma !== -1 ? b64.slice(comma + 1) : b64, 'base64');
      console.log(`[audio-api] Received ${audioBuffer.length} bytes via JSON base64`);
    } else {
      return res.status(400).json({ error: 'audio required' });
    }

    // Check if this is raw PCM data
    let samples;
    const isRawPCM = req.body?.audioData && req.body.audioData.startsWith('data:audio/raw;base64,');
    
    if (isRawPCM) {
      // Handle raw 16-bit PCM directly
      console.log(`[audio-api] Processing raw PCM: ${audioBuffer.length} bytes`);
      samples = new Float32Array(audioBuffer.length / 2);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = audioBuffer.readInt16LE(i * 2) / 32768.0;
      }
      console.log(`[audio-api] ✅ Converted ${samples.length} PCM samples directly`);
    } else {
      // Decode WebM/Opus using sox
      samples = await decodeAudioBuffer(audioBuffer, req.file?.mimetype || 'audio/webm');
      console.log(`[audio-api] ✅ Decoded ${samples.length} samples from ${audioBuffer.length} bytes`);
    }

    const result = await processAudioSamples(samples, 'browser');
    res.json({ success: true, result: result || { status: 'buffering' } });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * Decode audio buffer to Float32Array using sox
 * Supports WebM, Opus, MP3, WAV, etc.
 */
async function decodeAudioBuffer(buffer, mimeType = 'audio/webm') {
  return new Promise((resolve, reject) => {
    const tempInput = path.join(os.tmpdir(), `audio-${Date.now()}.webm`);
    const tempOutput = path.join(os.tmpdir(), `audio-${Date.now()}.raw`);
    
    try {
      // Write buffer to temporary file
      fs.writeFileSync(tempInput, buffer);
      
      // Use sox to convert to 16-bit PCM at 16kHz mono
      // Use ffmpeg for WebM files (sox does not support WebM), sox for others
      const isWebm = tempInput.includes(".webm");
      const decoder = isWebm ?
        spawn("ffmpeg", ["-y", "-i", tempInput, "-ar", "16000", "-ac", "1", "-f", "s16le", tempOutput]) :
        spawn("sox", [tempInput, "-t", "raw", "-r", "16000", "-e", "signed-integer", "-b", "16", "-c", "1", tempOutput]);
      const sox = decoder; // Keep same variable name for compatibility
      
      sox.stderr.on('data', (data) => {
        console.log(`[audio-api] decoder:`, data.toString().trim());
      });
      
      sox.on('close', (code) => {
        try {
          if (code !== 0) {
            throw new Error(`Audio decoder failed with code ${code}`);
          }
          
          // Read the decoded PCM data
          const pcmBuffer = fs.readFileSync(tempOutput);
          const samples = new Float32Array(pcmBuffer.length / 2);
          
          // Convert 16-bit PCM to Float32
          for (let i = 0; i < samples.length; i++) {
            const int16 = pcmBuffer.readInt16LE(i * 2);
            samples[i] = int16 / 32768.0;
          }
          
          // Cleanup
          fs.unlinkSync(tempInput);
          fs.unlinkSync(tempOutput);
          
          resolve(samples);
        } catch (err) {
          reject(err);
        }
      });
      
      sox.on('error', reject);
      
    } catch (err) {
      reject(err);
    }
  });
}

// Recognition session control
app.post('/start-recognition', async (req, res) => {
  const { startPage } = req.body || {};
  if (startPage) {
    currentPage = parseInt(startPage) || 1;
    await skill.setCurrentPage?.(currentPage);
  }
  startScoreLog();

  // START THE RECOGNITION ENGINE (this was missing!)
  try {
    const recognitionResult = await skill.startRecognition?.({ startPage: currentPage });
    console.log(`[audio-api] ✅ Recognition engine started:`, recognitionResult);
  } catch (err) {
    console.error(`[audio-api] ❌ Failed to start recognition:`, err.message);
  }
  const micResult = await startMic(MIC_DEVICE);
  res.json({ success: true, currentPage, micStarted: micResult.success, micError: micResult.error });
});

app.post('/stop-recognition', (_req, res) => {
  stopMic();
  const report = stopScoreLog();
  res.json({ success: true, report: report?.summary || null });
});

// Score logger control
app.post('/log/start', (_req, res) => {
  startScoreLog();
  res.json({ success: true, message: 'Score logging started' });
});

app.post('/log/stop', (_req, res) => {
  const report = stopScoreLog();
  res.json({ success: true, summary: report?.summary || null });
});

app.get('/log/status', (_req, res) => {
  res.json({
    active: !!scoreSession,
    entriesCount: scoreSession?.entries?.length || 0
  });
});

// Status
app.get('/status', async (_req, res) => {
  try {
    const skillStatus = await skill.getStatus?.() || {};
    res.json({
      success: true,
      status: {
        ...skillStatus,
        micActive: isListening,
        currentPage,
        scoreLogActive: !!scoreSession,
        scoreEntries: scoreSession?.entries?.length || 0,
        textMatcherLoaded: !!textMatcher,
        threshold: CONFIDENCE_THRESHOLD,
        appUrl: APP_URL
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual page sync
app.post('/set-page', (req, res) => {
  const { page } = req.body || {};
  if (page) {
    currentPage = parseInt(page);
    skill.setCurrentPage?.(currentPage);
  }
  res.json({ success: true, currentPage });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║     Liturgy Turner — Audio API                   ║');
  console.log(`║     Port:      ${PORT}                              ║`);
  console.log(`║     App URL:   ${APP_URL.padEnd(28)}║`);
  console.log(`║     Threshold: ${CONFIDENCE_THRESHOLD}                               ║`);
  console.log(`║     Text match: ${textMatcher ? '✅ loaded' : '⚠️  disabled'}                       ║`);
  console.log('║                                                  ║');
  console.log('║  POST /mic/start      — start mic listening      ║');
  console.log('║  POST /mic/stop       — stop mic                 ║');
  console.log('║  GET  /mic/devices    — list available mics      ║');
  console.log('║  POST /start-recognition — start full session    ║');
  console.log('║  POST /stop-recognition  — stop + get report     ║');
  console.log('║  GET  /health         — system status            ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
});
