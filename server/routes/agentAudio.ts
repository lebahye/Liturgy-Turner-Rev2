import express from "express";
import multer from "multer";
import { getScoreLogger } from "../score-logger.js";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const agentAudioRouter = express.Router();
const upload = multer({ limits: { fileSize: 20 * 1024 * 1024 } });

function looksLikeWebm(buf: Buffer) {
  // EBML header starts with 1A 45 DF A3
  return buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
}

function convertWebmToWav(buffer: Buffer): Buffer {
  const dir = mkdtempSync(join(tmpdir(), "liturgy-audio-"));
  const inFile = join(dir, "in.webm");
  const outFile = join(dir, "out.wav");
  try {
    writeFileSync(inFile, buffer);
    const ff = spawnSync(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "error", "-y", "-i", inFile, "-ar", "16000", "-ac", "1", "-f", "wav", outFile],
      { encoding: "utf8" }
    );

    if (ff.status !== 0) {
      throw new Error(ff.stderr || ff.stdout || `ffmpeg failed (${ff.status})`);
    }

    return readFileSync(outFile);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

agentAudioRouter.post("/agent/feed-audio", upload.single("audio"), async (req, res) => {
  try {
    const audioApiUrl = process.env.AGENT_AUDIO_API_URL || "http://localhost:29788";

    let audioBuffer: Buffer | null = null;
    let inputFormat = "audio/webm";

    if (req.file) {
      audioBuffer = req.file.buffer;
      inputFormat = req.file.mimetype || inputFormat;
    } else if (req.body.audioBase64) {
      const b64 = String(req.body.audioBase64);
      const comma = b64.indexOf(",");
      const raw = comma !== -1 ? b64.slice(comma + 1) : b64;
      audioBuffer = Buffer.from(raw, "base64");
      inputFormat = String(req.body.format || inputFormat);
    }

    if (!audioBuffer) {
      return res.status(400).json({ error: "audio required (file or audioBase64)" });
    }

    let sendBuffer = audioBuffer;
    let sendFormat = inputFormat;

    if (inputFormat.includes("webm") || looksLikeWebm(audioBuffer)) {
      try {
        sendBuffer = convertWebmToWav(audioBuffer);
        sendFormat = "audio/wav";
        console.log(`[agentAudio] Converted WebM->WAV ${audioBuffer.length} -> ${sendBuffer.length} bytes`);
      } catch (convErr: any) {
        console.error(`[agentAudio] Conversion failed: ${convErr?.message || convErr}`);
      }
    }

    console.log(`[agentAudio] Forwarding ${sendBuffer.length} bytes (${sendFormat}) to agent audio API`);

    const response = await fetch(`${audioApiUrl}/feed-audio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audioData: sendBuffer.toString("base64"),
        format: sendFormat,
        sampleRate: 16000,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Agent call failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    const scoreLogger = getScoreLogger();
    if (scoreLogger && data) {
      try {
        scoreLogger.logScore({
          timestamp: Date.now(),
          currentPage: data.currentPage || 0,
          candidatePage: data.detectedPage || data.candidatePage || 0,
          confidenceScore: data.confidence || data.finalScore || 0,
          mfccSimilarity: data.mfccScore || data.mfccSimilarity || 0,
          rmsSimilarity: data.rmsScore || data.rmsSimilarity || 0,
          centroidSimilarity: data.centroidScore || data.centroidSimilarity || 0,
          continuityBonus: data.continuityBonus || data.sequentialBoost || 0,
          detectedSpeaker: data.detectedSpeaker || data.speaker || "unknown",
          expectedSpeaker: data.expectedSpeaker || "unknown",
          triggered: data.triggered || data.pageTurned || false,
        });
      } catch (logErr: any) {
        console.error("[agentAudio] Score log error:", logErr.message);
      }
    }

    return res.json({ success: true, result: data });
  } catch (err: any) {
    console.error("[agentAudio] Feed error:", err.message);
    return res.status(500).json({
      error: err.message,
      fallback: "agent-unavailable",
      suggestion: "Switch to Local mode or check agent container",
    });
  }
});

agentAudioRouter.post("/agent/start-recognition", async (req, res) => {
  try {
    const audioApiUrl = process.env.AGENT_AUDIO_API_URL || "http://localhost:29788";
    const { pdfId, startPage } = req.body;

    console.log(`[agentAudio] Starting recognition: pdfId=${pdfId}, page=${startPage}`);

    const response = await fetch(`${audioApiUrl}/start-recognition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdfId: pdfId || null, startPage: startPage || 1 }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) throw new Error(`Agent call failed: ${response.status} ${response.statusText}`);
    const data = await response.json();

    console.log(`[agentAudio] Also starting microphone...`);
    try {
      const micResponse = await fetch(`${audioApiUrl}/mic/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      data.micStarted = micResponse.ok;
    } catch {
      data.micStarted = false;
    }

    return res.json({ success: true, status: "recognition-started", result: data });
  } catch (err: any) {
    console.error("[agentAudio] Start recognition error:", err.message);
    return res.status(500).json({ error: err.message, fallback: "agent-unavailable" });
  }
});

agentAudioRouter.post("/agent/stop-recognition", async (_req, res) => {
  try {
    const audioApiUrl = process.env.AGENT_AUDIO_API_URL || "http://localhost:29788";
    const response = await fetch(`${audioApiUrl}/stop-recognition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`Agent call failed: ${response.status} ${response.statusText}`);
    const data = await response.json();
    return res.json({ success: true, status: "recognition-stopped", result: data });
  } catch (err: any) {
    console.error("[agentAudio] Stop recognition error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

agentAudioRouter.get("/agent/status", async (_req, res) => {
  try {
    const audioApiUrl = process.env.AGENT_AUDIO_API_URL || "http://localhost:29788";
    const response = await fetch(`${audioApiUrl}/status`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`Agent call failed: ${response.status} ${response.statusText}`);
    const data = await response.json();
    return res.json({ success: true, status: data });
  } catch (err: any) {
    console.error("[agentAudio] Status error:", err.message);
    return res.status(500).json({ error: err.message, available: false });
  }
});
