import express from "express";
import multer from "multer";
import { getScoreLogger } from "../score-logger.js";

export const agentAudioRouter = express.Router();

const upload = multer({ limits: { fileSize: 20 * 1024 * 1024 } });

/**
 * Forward audio chunk to agent's armenian-learner skill
 * This is a thin proxy that enables the browser to send audio to the agent
 */
agentAudioRouter.post("/agent/feed-audio", upload.single("audio"), async (req, res) => {
  try {
    // Use direct audio API (port 29788) instead of LLM gateway (29789)
    const audioApiUrl = process.env.AGENT_AUDIO_API_URL || "http://agent:29788";
    
    // Accept audio from multipart upload or JSON base64
    let audioBuffer: Buffer | null = null;
    if (req.file) {
      audioBuffer = req.file.buffer;
    } else if (req.body.audioBase64) {
      const b64 = String(req.body.audioBase64);
      const comma = b64.indexOf(",");
      const raw = comma !== -1 ? b64.slice(comma + 1) : b64;
      audioBuffer = Buffer.from(raw, "base64");
    }
    
    if (!audioBuffer) {
      return res.status(400).json({ error: "audio required (file or audioBase64)" });
    }

    console.log(`[agentAudio] Forwarding ${audioBuffer.length} bytes to agent audio API`);

    // Call agent's audio API directly (bypasses LLM gateway)
    const response = await fetch(`${audioApiUrl}/feed-audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioData: audioBuffer.toString('base64'),
        format: req.file?.mimetype || 'audio/webm',
        sampleRate: 16000
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      throw new Error(`Agent call failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Log to score logger if active (bridges primary agent path → score logger)
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
          detectedSpeaker: data.detectedSpeaker || data.speaker || 'unknown',
          expectedSpeaker: data.expectedSpeaker || 'unknown',
          triggered: data.triggered || data.pageTurned || false,
        });
      } catch (logErr: any) {
        console.error("[agentAudio] Score log error:", logErr.message);
      }
    }

    return res.json({
      success: true,
      result: data
    });

  } catch (err: any) {
    console.error("[agentAudio] Feed error:", err.message);
    
    // Provide graceful fallback info
    return res.status(500).json({ 
      error: err.message,
      fallback: "agent-unavailable",
      suggestion: "Switch to Local mode or check agent container"
    });
  }
});

/**
 * Start agent recognition session
 */
agentAudioRouter.post("/agent/start-recognition", async (req, res) => {
  try {
    const audioApiUrl = process.env.AGENT_AUDIO_API_URL || "http://agent:29788";
    const { pdfId, startPage } = req.body;
    
    console.log(`[agentAudio] Starting recognition: pdfId=${pdfId}, page=${startPage}`);

    const response = await fetch(`${audioApiUrl}/start-recognition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pdfId: pdfId || null,
        startPage: startPage || 1
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      throw new Error(`Agent call failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return res.json({
      success: true,
      status: "recognition-started",
      result: data
    });
    
  } catch (err: any) {
    console.error("[agentAudio] Start recognition error:", err.message);
    return res.status(500).json({ 
      error: err.message,
      fallback: "agent-unavailable"
    });
  }
});

/**
 * Stop agent recognition session
 */
agentAudioRouter.post("/agent/stop-recognition", async (req, res) => {
  try {
    const audioApiUrl = process.env.AGENT_AUDIO_API_URL || "http://agent:29788";
    
    console.log(`[agentAudio] Stopping recognition`);

    const response = await fetch(`${audioApiUrl}/stop-recognition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      throw new Error(`Agent call failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return res.json({
      success: true,
      status: "recognition-stopped",
      result: data
    });
    
  } catch (err: any) {
    console.error("[agentAudio] Stop recognition error:", err.message);
    return res.status(500).json({ 
      error: err.message 
    });
  }
});

/**
 * Get agent recognition status
 */
agentAudioRouter.get("/agent/status", async (req, res) => {
  try {
    const audioApiUrl = process.env.AGENT_AUDIO_API_URL || "http://agent:29788";

    const response = await fetch(`${audioApiUrl}/status`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      throw new Error(`Agent call failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return res.json({
      success: true,
      status: data
    });
    
  } catch (err: any) {
    console.error("[agentAudio] Status error:", err.message);
    return res.status(500).json({ 
      error: err.message,
      available: false
    });
  }
});
