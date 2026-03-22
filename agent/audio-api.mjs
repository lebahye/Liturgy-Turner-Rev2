#!/usr/bin/env node
/**
 * Simple HTTP API wrapper for armenian-learner skill
 * Allows direct audio streaming without going through LLM agent
 */

import express from 'express';
import multer from 'multer';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const upload = multer({ limits: { fileSize: 20 * 1024 * 1024 } });

// Import the skill
const require = createRequire(import.meta.url);
const skillPath = join(__dirname, 'skills/armenian-learner/index.js');
let skill;

try {
  skill = await import(skillPath);
  console.log('[audio-api] ✅ Armenian learner skill loaded');
  console.log('[audio-api] Available functions:', Object.keys(skill).filter(k => typeof skill[k] === 'function'));
} catch (err) {
  console.error('[audio-api] ❌ Failed to load skill:', err.message);
  process.exit(1);
}

app.use(express.json({ limit: '20mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', skill: 'armenian-learner' });
});

// Feed audio chunk
app.post('/feed-audio', upload.single('audio'), async (req, res) => {
  try {
    if (!skill.feedAudio) {
      return res.status(500).json({ error: 'feedAudio not exported by skill' });
    }

    let audioBuffer;
    if (req.file) {
      audioBuffer = req.file.buffer;
    } else if (req.body.audioData) {
      audioBuffer = Buffer.from(req.body.audioData, 'base64');
    } else {
      return res.status(400).json({ error: 'No audio data provided' });
    }

    // Convert to Float32Array (what the skill expects)
    const audioArray = new Float32Array(audioBuffer.length / 2);
    for (let i = 0; i < audioArray.length; i++) {
      audioArray[i] = audioBuffer.readInt16LE(i * 2) / 32768.0;
    }

    console.log(`[audio-api] Feeding ${audioArray.length} samples to skill`);
    const result = await skill.feedAudio(audioArray);

    // If page detected, send turn command to liturgy-app
    if (result && result.page && result.confidence > 0.8) {
      console.log(`[audio-api] 🎯 Page detected: ${result.page} (${(result.confidence * 100).toFixed(1)}%)`);
      
      // Send page turn command
      const appUrl = process.env.APP_BASE_URL || 'http://app:5000';
      try {
        const turnResponse = await fetch(`${appUrl}/api/control/page/set`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            page: result.page,
            reason: 'agent_recognition',
            confidence: result.confidence
          })
        });

        if (turnResponse.ok) {
          console.log(`[audio-api] ✅ Page turn sent to app`);
        } else {
          console.error(`[audio-api] ⚠️  Page turn failed: ${turnResponse.status}`);
        }
      } catch (err) {
        console.error(`[audio-api] ⚠️  Failed to send page turn:`, err.message);
      }
    }

    res.json({
      success: true,
      result: result || { status: 'buffering' }
    });
  } catch (err) {
    console.error('[audio-api] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Start recognition
app.post('/start-recognition', async (req, res) => {
  try {
    if (!skill.startRecognition) {
      return res.status(500).json({ error: 'startRecognition not exported by skill' });
    }

    const { pdfId, startPage } = req.body;
    console.log(`[audio-api] Starting recognition: pdfId=${pdfId}, page=${startPage}`);

    const appUrl = process.env.APP_BASE_URL || 'http://localhost:5000';

    const result = await skill.startRecognition({
      pdfId,
      startPage,
      onPageDetected: async (page, confidence) => {
        console.log(`[audio-api] 🎯 Page detected (callback): ${page} (${(confidence * 100).toFixed(1)}%)`);
        try {
          const turnResponse = await fetch(`${appUrl}/api/control/page/set`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page, reason: 'agent_recognition', confidence })
          });
          if (turnResponse.ok) {
            console.log(`[audio-api] ✅ Page turn sent: ${page}`);
          } else {
            console.error(`[audio-api] ⚠️  Page turn failed: ${turnResponse.status}`);
          }
        } catch (err) {
          console.error(`[audio-api] ⚠️  Failed to send page turn:`, err.message);
        }
      }
    });

    res.json({
      success: true,
      result: result
    });
  } catch (err) {
    console.error('[audio-api] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Stop recognition
app.post('/stop-recognition', async (req, res) => {
  try {
    if (!skill.stopRecognition) {
      return res.status(500).json({ error: 'stopRecognition not exported by skill' });
    }

    const result = await skill.stopRecognition();

    res.json({
      success: true,
      result: result
    });
  } catch (err) {
    console.error('[audio-api] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get status
app.get('/status', async (req, res) => {
  try {
    if (!skill.getStatus) {
      return res.status(500).json({ error: 'getStatus not exported by skill' });
    }

    const result = await skill.getStatus();

    res.json({
      success: true,
      status: result
    });
  } catch (err) {
    console.error('[audio-api] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.AUDIO_API_PORT || 29788;

// Auto-start recognition helper (called at startup and on demand)
async function autoStartRecognition() {
  if (!skill.startRecognition) return;
  const appUrl = process.env.APP_BASE_URL || 'http://localhost:5000';
  try {
    const result = skill.startRecognition({
      startPage: 1,
      onPageDetected: async (page, confidence) => {
        console.log(`[audio-api] 🎯 Page detected (callback): ${page} (${(confidence * 100).toFixed(1)}%)`);
        try {
          const turnResponse = await fetch(`${appUrl}/api/control/page/set`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page, reason: 'agent_recognition', confidence })
          });
          if (turnResponse.ok) {
            console.log(`[audio-api] ✅ Page turn sent: ${page}`);
          } else {
            console.error(`[audio-api] ⚠️  Page turn failed: ${turnResponse.status}`);
          }
        } catch (err) {
          console.error(`[audio-api] ⚠️  Failed to send page turn:`, err.message);
        }
      }
    });
    console.log(`[audio-api] 🚀 Auto-started recognition:`, result?.message || 'ok');
  } catch (err) {
    console.error(`[audio-api] ❌ Auto-start recognition failed:`, err.message);
  }
}

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`[audio-api] 🎵 Audio API listening on port ${PORT}`);
  console.log(`[audio-api] Skill path: ${skillPath}`);
  console.log(`[audio-api] App URL: ${process.env.APP_BASE_URL || 'http://app:5000'}`);
  // Auto-start recognition so page-turning is active immediately after any restart
  await autoStartRecognition();
});
