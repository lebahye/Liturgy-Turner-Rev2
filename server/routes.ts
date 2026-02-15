import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import OpenAI from "openai";
import { getDisplayState, nextPage, prevPage, setPageState, setPdfState } from "./displayBus";
import { clawdbotTokenHandler } from "./routes/clawdbotToken";
import { LiturgyPageTracker } from "./liturgy-tracker";

// Configure multer for file uploads
const pdfStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'client/public/uploads/pdfs');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'liturgy-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const audioStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'client/public/uploads/audio');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'recording-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const uploadPdf = multer({ 
  storage: pdfStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

const uploadAudio = multer({ 
  storage: audioStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  }
});


function sha256Hex(buf: Buffer | string): string {
  const h = crypto.createHash("sha256");
  h.update(buf);
  return h.digest("hex");
}


async function resolvePdfIdFromPublicPath(pdfPath: string): Promise<string | null> {
  try {
    const fullPath = path.join(process.cwd(), "client/public", pdfPath);
    const buf = await fs.readFile(fullPath);
    return sha256Hex(buf);
  } catch {
    return null;
  }
}

function normalizePageText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9Ա-և\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  
  // ============ Display Sync Bus (TV Viewer) ============

  // Clawdbot helper (local-only): allow the embedded /bot page to fetch the
  // gateway token so the Control UI can authenticate and avoid 1006 timeouts.
  app.get('/api/clawdbot/token', clawdbotTokenHandler);

  app.get('/api/control/state', async (_req, res) => {
    res.json({ state: getDisplayState() });
  });

  app.post('/api/control/pdf/set', async (req, res) => {
    const { pdfPath, pdfId = null, totalPages } = req.body || {};
    if (!pdfPath || typeof pdfPath !== 'string') {
      return res.status(400).json({ error: 'pdfPath is required' });
    }
    setPdfState({ pdfPath, pdfId, totalPages });
    return res.json({ success: true, state: getDisplayState() });
  });

  app.post('/api/control/page/set', async (req, res) => {
    const { page, reason, confidence } = req.body || {};
    const n = Number(page);
    if (!Number.isFinite(n)) return res.status(400).json({ error: 'page must be a number' });
    setPageState({ page: n, reason, confidence });
    return res.json({ success: true, state: getDisplayState() });
  });

  app.post('/api/control/page/next', async (req, res) => {
    const { reason, confidence } = req.body || {};
    nextPage(reason, confidence);
    return res.json({ success: true, state: getDisplayState() });
  });

  app.post('/api/control/page/prev', async (req, res) => {
    const { reason, confidence } = req.body || {};
    prevPage(reason, confidence);
    return res.json({ success: true, state: getDisplayState() });
  });

// Upload PDF endpoint
  app.post('/api/upload/pdf', uploadPdf.single('pdf'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      
      // Compute stable pdfId from file bytes (sha256)
      const pdfDiskPath = req.file.path;
      const pdfBuffer = await fs.readFile(pdfDiskPath);
      const pdfId = sha256Hex(pdfBuffer);

const file = await storage.createUploadedFile({
        filename: req.file.filename,
        originalName: req.file.originalname,
        filePath: `/uploads/pdfs/${req.file.filename}`,
        fileType: 'pdf',
        mimeType: req.file.mimetype,
        pdfId,
      });

      res.json({ 
        success: true, 
        file: {
          id: file.id,
          filename: file.filename,
          path: file.filePath,
          originalName: file.originalName,
          pdfId: file.pdfId || pdfId
        }
      });
    } catch (error) {
      console.error('PDF upload error:', error);
      res.status(500).json({ error: 'Failed to upload PDF' });
    }
  });

  // Upload Audio endpoint
  app.post('/api/upload/audio', uploadAudio.single('audio'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const file = await storage.createUploadedFile({
        filename: req.file.filename,
        originalName: req.file.originalname,
        filePath: `/uploads/audio/${req.file.filename}`,
        fileType: 'audio',
        mimeType: req.file.mimetype,
      });

      res.json({ 
        success: true, 
        file: {
          id: file.id,
          filename: file.filename,
          path: file.filePath,
          originalName: file.originalName,
        }
      });
    } catch (error) {
      console.error('Audio upload error:', error);
      res.status(500).json({ error: 'Failed to upload audio' });
    }
  });

  // Get all uploaded files
  app.get('/api/files', async (req, res) => {
    try {
      const fileType = req.query.type as string | undefined;
      const files = await storage.getUploadedFiles(fileType);
      res.json({ files });
    } catch (error) {
      console.error('Get files error:', error);
      res.status(500).json({ error: 'Failed to retrieve files' });
    }
  });

  // Delete uploaded file
  app.delete('/api/files/:id', async (req, res) => {
    try {
      const file = await storage.getUploadedFile(req.params.id);
      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }

      // Delete physical file
      const filePath = path.join(process.cwd(), 'client/public', file.filePath);
      try {
        await fs.unlink(filePath);
      } catch (err) {
        console.error('Error deleting physical file:', err);
      }

      // Delete from storage
      await storage.deleteUploadedFile(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Delete file error:', error);
      res.status(500).json({ error: 'Failed to delete file' });
    }
  });

  // ============ Training Sessions API ============

  // Get all training sessions
  app.get('/api/training-sessions', async (req, res) => {
    try {
      const sessions = await storage.getTrainingSessions();
      res.json({ sessions });
    } catch (error) {
      console.error('Get training sessions error:', error);
      res.status(500).json({ error: 'Failed to retrieve training sessions' });
    }
  });

  // Get a specific training session with its markers
  app.get('/api/training-sessions/:id', async (req, res) => {
    try {
      const session = await storage.getTrainingSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Training session not found' });
      }
      const markers = await storage.getPageMarkers(req.params.id);
      res.json({ session, markers });
    } catch (error) {
      console.error('Get training session error:', error);
      res.status(500).json({ error: 'Failed to retrieve training session' });
    }
  });

  // Create a new training session with markers
  app.post('/api/training-sessions', async (req, res) => {
    try {
      const { name, pdfPath, pdfId: bodyPdfId, totalPages, markers } = req.body;
      const resolvedPdfId = bodyPdfId || (await resolvePdfIdFromPublicPath(pdfPath));
      
      if (!name || !pdfPath) {
        return res.status(400).json({ error: 'Name and PDF path are required' });
      }

      // Create the training session
      const session = await storage.createTrainingSession({
        name,
        pdfPath,
        pdfId: resolvedPdfId || null,
        totalPages: totalPages || 1,
        status: 'ready',
      });

      // Create page markers if provided
      let createdMarkers: any[] = [];
      if (markers && Array.isArray(markers) && markers.length > 0) {
        const markerData = await Promise.all(markers.map(async (m: any) => {
          const pageNumber = m.pageNumber || m.page;
          const ts = m.timestampMs || m.time * 1000;
          let pageId: string | null = null;
          if (session.pdfId) {
            const pt = await storage.getPageTranscriptByPdfId(session.pdfId, pageNumber);
            pageId = pt?.pageId || null;
          }
          return {
            sessionId: session.id,
            pdfId: session.pdfId || null,
            pageId,
            pageNumber,
            timestampMs: ts,
            audioFeatures: m.audioFeatures || null,
            triggerTokens: m.triggerTokens || null,
            triggerConfidence: m.triggerConfidence || null,
          };
        }));
        createdMarkers = await storage.createPageMarkers(markerData);
      }

      res.json({ 
        success: true, 
        session,
        markers: createdMarkers
      });
    } catch (error) {
      console.error('Create training session error:', error);
      res.status(500).json({ error: 'Failed to create training session' });
    }
  });

  // Update training session (e.g., add audio path, update status)
  app.patch('/api/training-sessions/:id', async (req, res) => {
    try {
      const session = await storage.getTrainingSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Training session not found' });
      }

      const updated = await storage.updateTrainingSession(req.params.id, req.body);
      res.json({ success: true, session: updated });
    } catch (error) {
      console.error('Update training session error:', error);
      res.status(500).json({ error: 'Failed to update training session' });
    }
  });

  // Delete a training session
  app.delete('/api/training-sessions/:id', async (req, res) => {
    try {
      const session = await storage.getTrainingSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Training session not found' });
      }

      await storage.deleteTrainingSession(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Delete training session error:', error);
      res.status(500).json({ error: 'Failed to delete training session' });
    }
  });

  // Add markers to an existing session
  app.post('/api/training-sessions/:id/markers', async (req, res) => {
    try {
      const session = await storage.getTrainingSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Training session not found' });
      }

      const { markers } = req.body;
      if (!markers || !Array.isArray(markers)) {
        return res.status(400).json({ error: 'Markers array is required' });
      }

      const markerData = await Promise.all(markers.map(async (m: any) => {
        const pageNumber = m.pageNumber || m.page;
        const ts = m.timestampMs || Math.round(m.time * 1000);
        let pageId: string | null = null;
        if (session.pdfId) {
          const pt = await storage.getPageTranscriptByPdfId(session.pdfId, pageNumber);
          pageId = pt?.pageId || null;
        }
        return {
          sessionId: session.id,
          pdfId: session.pdfId || null,
          pageId,
          pageNumber,
          timestampMs: ts,
          audioFeatures: m.audioFeatures || null,
        };
      }));

      const createdMarkers = await storage.createPageMarkers(markerData);
      res.json({ success: true, markers: createdMarkers });
    } catch (error) {
      console.error('Add markers error:', error);
      res.status(500).json({ error: 'Failed to add markers' });
    }
  });

  // Get the active/latest training session for live mode
  app.get('/api/training-sessions/active/latest', async (req, res) => {
    try {
      const sessions = await storage.getTrainingSessions();
      const readySessions = sessions.filter(s => s.status === 'ready');
      
      if (readySessions.length === 0) {
        return res.status(404).json({ error: 'No trained sessions available' });
      }

      // Get the most recent ready session
      const latest = readySessions[readySessions.length - 1];
      const markers = await storage.getPageMarkers(latest.id);
      
      res.json({ session: latest, markers });
    } catch (error) {
      console.error('Get active session error:', error);
      res.status(500).json({ error: 'Failed to retrieve active session' });
    }
  });

  // ============ Aggregated Fingerprints API ============

  // Get aggregated fingerprints for a PDF
  app.get('/api/aggregated-fingerprints', async (req, res) => {
    try {
      const pdfPath = req.query.pdfPath as string | undefined;
      const pdfId = req.query.pdfId as string | undefined;
      if (!pdfId && !pdfPath) {
        return res.status(400).json({ error: 'pdfId or pdfPath query parameter is required' });
      }

      const fingerprints = pdfId ? await storage.getAggregatedFingerprintsByPdfId(pdfId) : await storage.getAggregatedFingerprints(pdfPath!);
      res.json({ fingerprints });
    } catch (error) {
      console.error('Get aggregated fingerprints error:', error);
      res.status(500).json({ error: 'Failed to retrieve aggregated fingerprints' });
    }
  });

  // Merge training session into aggregated fingerprints
  app.post('/api/aggregated-fingerprints/merge', async (req, res) => {
    try {
      const { sessionId } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ error: 'sessionId is required' });
      }

      const session = await storage.getTrainingSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Training session not found' });
      }

      const markers = await storage.getPageMarkers(sessionId);
      if (markers.length === 0) {
        return res.status(400).json({ error: 'No markers in this session' });
      }

      const results: any[] = [];

      for (const marker of markers) {
        const existing = session.pdfId && marker.pageId ? await storage.getAggregatedFingerprintByPageId(marker.pageId) : await storage.getAggregatedFingerprint(session.pdfPath, marker.pageNumber);
        
        if (existing) {
          // Merge with existing fingerprint
          const newSessionCount = existing.sessionCount + 1;
          const newAvgTimestamp = Math.round(
            (existing.averageTimestampMs * existing.sessionCount + marker.timestampMs) / newSessionCount
          );
          
          // Merge audio features
          let newAveragedFeatures = existing.averagedFeatures;
          const history = (existing.featureHistory as any[]) || [];
          
          if (marker.audioFeatures) {
            history.push(marker.audioFeatures);
            newAveragedFeatures = averageAudioFeatures(history);
          }
          
          // Calculate confidence based on session count and feature consistency
          const confidence = Math.min(100, 50 + (newSessionCount * 10) + calculateFeatureConsistency(history));
          
          const updated = await storage.upsertAggregatedFingerprint({
            pdfPath: session.pdfPath,
            pdfId: session.pdfId || null,
            pageId: marker.pageId || null,
            pageNumber: marker.pageNumber,
            sessionCount: newSessionCount,
            averageTimestampMs: newAvgTimestamp,
            averagedFeatures: newAveragedFeatures as Record<string, unknown> | null,
            featureHistory: history as Record<string, unknown>[],
            confidence,
          });
          results.push(updated);
        } else {
          // Create new aggregated fingerprint
          const created = await storage.upsertAggregatedFingerprint({
            pdfPath: session.pdfPath,
            pdfId: session.pdfId || null,
            pageId: marker.pageId || null,
            pageNumber: marker.pageNumber,
            sessionCount: 1,
            averageTimestampMs: marker.timestampMs,
            averagedFeatures: marker.audioFeatures as Record<string, unknown> | null,
            featureHistory: marker.audioFeatures ? [marker.audioFeatures as Record<string, unknown>] : [],
            confidence: 50,
          });
          results.push(created);
        }
      }

      res.json({ 
        success: true, 
        message: `Merged ${markers.length} markers into aggregated fingerprints`,
        fingerprints: results
      });
    } catch (error) {
      console.error('Merge fingerprints error:', error);
      res.status(500).json({ error: 'Failed to merge fingerprints' });
    }
  });

  // Get training stats for a PDF (how many sessions, confidence per page)
  app.get('/api/training-stats', async (req, res) => {
    try {
      const pdfPath = req.query.pdfPath as string | undefined;
      const pdfId = req.query.pdfId as string | undefined;
      if (!pdfId && !pdfPath) {
        return res.status(400).json({ error: 'pdfId or pdfPath query parameter is required' });
      }

      const fingerprints = pdfId ? await storage.getAggregatedFingerprintsByPdfId(pdfId) : await storage.getAggregatedFingerprints(pdfPath!);
      const sessions = await storage.getTrainingSessions();
      const relatedSessions = pdfId ? sessions.filter(s => s.pdfId === pdfId) : sessions.filter(s => s.pdfPath === pdfPath);
      
      const stats = {
        totalSessions: relatedSessions.length,
        pagesWithData: fingerprints.length,
        averageConfidence: fingerprints.length > 0 
          ? fingerprints.reduce((sum: number, f: any) => sum + (f.confidence || 0), 0) / fingerprints.length 
          : 0,
        pageStats: fingerprints.map((f: any) => ({
          pageNumber: f.pageNumber,
          sessionCount: f.sessionCount,
          confidence: f.confidence,
          averageTimestampMs: f.averageTimestampMs,
        })),
      };
      
      res.json(stats);
    } catch (error) {
      console.error('Get training stats error:', error);
      res.status(500).json({ error: 'Failed to retrieve training stats' });
    }
  });

  // ============ Transcription API ============
  // Local-first: the app should boot even when no AI keys are configured.
  // These endpoints will return a helpful error until OPENAI_API_KEY is set.

  function getOpenAIClient() {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) return null;
    return new OpenAI({ apiKey });
  }

  // Transcribe audio chunk (for live mode) using OpenAI Whisper
  app.post('/api/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType = 'audio/webm' } = req.body;
      
      if (!audioBase64) {
        return res.status(400).json({ error: 'audioBase64 is required' });
      }

      // Convert base64 to buffer and create a File object for Whisper
      const audioBuffer = Buffer.from(audioBase64, 'base64');
      
      // Determine file extension from mime type
      const extMap: Record<string, string> = {
        'audio/webm': 'webm',
        'audio/mp3': 'mp3',
        'audio/mpeg': 'mp3',
        'audio/wav': 'wav',
        'audio/ogg': 'ogg',
        'audio/m4a': 'm4a',
      };
      const ext = extMap[mimeType] || 'webm';
      
      // Create a File object from the buffer
      const audioFile = new File([audioBuffer], `audio.${ext}`, { type: mimeType });

      const openai = getOpenAIClient();
      if (!openai) {
        return res.status(501).json({
          error: "Transcription is not configured (missing OPENAI_API_KEY)",
          transcript: "[no-api-key]",
        });
      }

      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        language: "hy", // Armenian language code
        response_format: "text",
      });

      const transcript = transcription?.trim() || "[silence]";
      res.json({ transcript: transcript.length > 0 ? transcript : "[silence]" });
    } catch (error) {
      console.error('Transcription error:', error);
      res.status(500).json({ error: 'Failed to transcribe audio', transcript: "[error]" });
    }
  });

  // Get page transcripts for a PDF
  app.get('/api/page-transcripts', async (req, res) => {
    try {
      const pdfPath = req.query.pdfPath as string | undefined;
      const pdfId = req.query.pdfId as string | undefined;
      if (!pdfPath && !pdfId) {
        return res.status(400).json({ error: 'pdfPath or pdfId query parameter is required' });
      }
      const transcripts = pdfId ? await storage.getPageTranscriptsByPdfId(pdfId) : await storage.getPageTranscripts(pdfPath!);
      res.json({ transcripts });
    } catch (error) {
      console.error('Get page transcripts error:', error);
      res.status(500).json({ error: 'Failed to retrieve page transcripts' });
    }
  });

// Get learning progress - shows PDF text vs learned audio text for each page
  app.get('/api/learning-progress', async (req, res) => {
    try {
      const pdfPath = req.query.pdfPath as string | undefined;
      const pdfId = req.query.pdfId as string | undefined;
      if (!pdfId && !pdfPath) {
        return res.status(400).json({ error: 'pdfId or pdfPath query parameter is required' });
      }

      const transcripts = pdfId ? await storage.getPageTranscriptsByPdfId(pdfId) : await storage.getPageTranscripts(pdfPath!);
      const fingerprints = pdfPath ? await storage.getAggregatedFingerprints(pdfPath) : [];
      
      // Create a map of fingerprints by page number
      const fingerprintMap = new Map(fingerprints.map(f => [f.pageNumber, f]));
      
      // Process each page to separate PDF text from learned audio text
      const pages = transcripts.map(t => {
        const fingerprint = fingerprintMap.get(t.pageNumber);
        
        // The transcript contains both PDF text and audio text separated by delimiter
        // Format: "PDF TEXT\n\n--- LEARNED FROM AUDIO ---\nAUDIO TEXT"
        let pdfText = t.transcript;
        let learnedText = '';
        
        const delimiter = '--- LEARNED FROM AUDIO ---';
        const hasDelimiter = t.transcript.includes(delimiter);
        
        if (hasDelimiter) {
          const parts = t.transcript.split(delimiter);
          pdfText = parts[0].trim();
          learnedText = parts[1]?.trim() || '';
        }
        
        // Has training if the delimiter exists (learned audio was added)
        const hasTraining = hasDelimiter && learnedText.length > 0;
        
        return {
          pageNumber: t.pageNumber,
          pdfText: pdfText.substring(0, 500) + (pdfText.length > 500 ? '...' : ''),
          learnedText: learnedText.substring(0, 500) + (learnedText.length > 500 ? '...' : ''),
          sessionCount: t.sessionCount,
          hasTraining,
          hasPageMarkers: !!fingerprint,
          trainingConfidence: fingerprint?.confidence || 0,
          status: hasTraining ? 'trained' : (fingerprint ? 'has_markers' : 'not_trained')
        };
      });
      
      // Summary stats
      const trainedCount = pages.filter(p => p.hasTraining).length;
      const markerCount = pages.filter(p => p.hasPageMarkers).length;
      
      res.json({ 
        pages,
        summary: {
          totalPages: pages.length,
          trainedPages: trainedCount,
          pagesWithMarkers: markerCount,
          percentTrained: pages.length > 0 ? Math.round((trainedCount / pages.length) * 100) : 0
        }
      });
    } catch (error) {
      console.error('Get learning progress error:', error);
      res.status(500).json({ error: 'Failed to retrieve learning progress' });
    }
  });

  // Save/update page transcript
  app.post('/api/page-transcripts', async (req, res) => {
    try {
      const { pdfPath, pdfId, pageNumber, transcript, keywords, pageId } = req.body;
      
      if ((!pdfPath && !pdfId) || !pageNumber || !transcript) {
        return res.status(400).json({ error: 'pdfPath, pageNumber, and transcript are required' });
      }

      const existing = pdfId ? await storage.getPageTranscriptByPdfId(pdfId, pageNumber) : await storage.getPageTranscript(pdfPath, pageNumber);
      const sessionCount = existing ? existing.sessionCount + 1 : 1;

      const saved = await storage.upsertPageTranscript({
        pdfPath: pdfPath || existing?.pdfPath || '',
        pdfId: pdfId || existing?.pdfId || null,
        pageId: pageId || existing?.pageId || null,
        pageNumber,
        transcript,
        keywords: keywords || extractKeywords(transcript),
        sessionCount,
      });

      res.json({ success: true, transcript: saved });
    } catch (error) {
      console.error('Save page transcript error:', error);
      res.status(500).json({ error: 'Failed to save page transcript' });
    }
  });

  // Transcribe training audio and save per-page transcripts
  app.post('/api/transcribe-training', async (req, res) => {
    try {
      const { sessionId } = req.body;
      
      if (!sessionId) {
        return res.status(400).json({ error: 'sessionId is required' });
      }

      const session = await storage.getTrainingSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Training session not found' });
      }

      const markers = await storage.getPageMarkers(sessionId);
      if (markers.length < 2) {
        return res.status(400).json({ error: 'Need at least 2 page markers for transcription' });
      }

      // Get the audio file path
      if (!session.audioPath) {
        return res.status(400).json({ error: 'No audio file associated with this training session' });
      }

      const audioFilePath = path.join(process.cwd(), 'client/public', session.audioPath);
      
      try {
        await fs.access(audioFilePath);
      } catch {
        return res.status(404).json({ error: 'Audio file not found' });
      }

      // Read audio file and convert to base64
      const audioBuffer = await fs.readFile(audioFilePath);
      const audioBase64 = audioBuffer.toString('base64');
      
      // Determine mime type from file extension
      const ext = path.extname(session.audioPath).toLowerCase();
      const mimeType = ext === '.webm' ? 'audio/webm' : 
                       ext === '.mp3' ? 'audio/mpeg' : 
                       ext === '.wav' ? 'audio/wav' : 
                       ext === '.ogg' ? 'audio/ogg' : 'audio/webm';

      // Transcribe the entire audio using OpenAI Whisper
      console.log(`Transcribing training audio: ${session.audioPath}`);
      
      // Create a File object for Whisper
      const audioFile = new File([audioBuffer], `audio${ext}`, { type: mimeType });

      const openai = getOpenAIClient();
      if (!openai) {
        return res.status(501).json({ error: "Transcription is not configured (missing OPENAI_API_KEY)" });
      }
      
      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        language: "hy", // Armenian
        response_format: "text",
      });

      const responseText = transcription || "";
      
      // Try to parse JSON from response
      let pageTranscripts: { pageNumber: number; transcript: string }[] = [];
      
      try {
        // Extract JSON from response (it might be wrapped in markdown code blocks)
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          pageTranscripts = parsed.pages || [];
        }
      } catch (parseError) {
        console.error('Failed to parse transcription response:', parseError);
        // Fall back to simple transcription without page division
        pageTranscripts = [{
          pageNumber: markers[0]?.pageNumber || 1,
          transcript: responseText
        }];
      }

      // Save transcripts to database
      const savedTranscripts = [];
      for (const pt of pageTranscripts) {
        if (pt.transcript && pt.transcript.length > 0 && pt.transcript !== "[silence]") {
          const saved = await storage.upsertPageTranscript({
            pdfPath: session.pdfPath,
            pageNumber: pt.pageNumber,
            transcript: pt.transcript,
            keywords: extractKeywords(pt.transcript),
            sessionCount: 1,
          });
          savedTranscripts.push(saved);
        }
      }

      res.json({ 
        success: true, 
        message: `Transcribed ${savedTranscripts.length} pages`,
        transcripts: savedTranscripts
      });
    } catch (error) {
      console.error('Transcribe training error:', error);
      res.status(500).json({ error: 'Failed to transcribe training audio' });
    }
  });

  // Extract text from PDF pages and save as transcripts
  app.post('/api/extract-pdf-text', async (req, res) => {
    try {
      const { pdfPath } = req.body;
      
      if (!pdfPath) {
        return res.status(400).json({ error: 'pdfPath is required' });
      }

      const fullPath = path.join(process.cwd(), 'client/public', pdfPath);
      
      try {
        await fs.access(fullPath);
      } catch {
        return res.status(404).json({ error: 'PDF file not found' });
      }

      const { PDFParse } = await import('pdf-parse');
      const pdfBuffer = await fs.readFile(fullPath);
      const pdfId = sha256Hex(pdfBuffer);
      const parser = new PDFParse({ data: pdfBuffer });
      
      // Get all text with page markers
      const result = await parser.getText();
      const fullText = result.text;
      await parser.destroy();

      // Split by page markers (format: "-- N of M --")
      const pagePattern = /--\s*(\d+)\s*of\s*\d+\s*--/g;
      const pageMatches: RegExpExecArray[] = [];
      let match: RegExpExecArray | null;
      while ((match = pagePattern.exec(fullText)) !== null) {
        pageMatches.push(match);
      }
      
      const savedTranscripts = [];
      
      for (let i = 0; i < pageMatches.length; i++) {
        const match = pageMatches[i];
        const pageNumber = parseInt(match[1], 10);
        const startIndex = match.index! + match[0].length;
        const endIndex = i < pageMatches.length - 1 ? pageMatches[i + 1].index! : fullText.length;
        
        let pageText = fullText.substring(startIndex, endIndex).trim();
        
        // Skip very short pages or empty pages
        if (pageText.length < 10) continue;
        
        // Clean up the text - remove excessive whitespace
        pageText = pageText.replace(/\s+/g, ' ').trim();
        
        // Save to database
        const normalized = normalizePageText(pageText);
        const pageId = sha256Hex(normalized);

        const saved = await storage.upsertPageTranscript({
          pdfPath,
          pdfId,
          pageId,
          pageNumber,
          transcript: pageText,
          keywords: extractKeywords(pageText),
          sessionCount: 1,
        });
        savedTranscripts.push({ pageNumber, textLength: pageText.length });
      }

      res.json({ 
        success: true, 
        message: `Extracted text from ${savedTranscripts.length} pages`,
        pages: savedTranscripts
      });
    } catch (error) {
      console.error('Extract PDF text error:', error);
      res.status(500).json({ error: 'Failed to extract PDF text' });
    }
  });

  // Match live text against stored transcripts
  app.post('/api/match-transcript', async (req, res) => {
    try {
      const { pdfPath, liveText } = req.body;
      
      if (!pdfPath || !liveText) {
        return res.status(400).json({ error: 'pdfPath and liveText are required' });
      }

      const transcripts = await storage.getPageTranscripts(pdfPath);
      if (transcripts.length === 0) {
        return res.status(404).json({ error: 'No transcripts available for this PDF' });
      }

      // Find best matching page
      let bestMatch = { pageNumber: 1, score: 0, matchedWords: 0 };
      
      const liveWords = liveText.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
      
      for (const transcript of transcripts) {
        const pageWords = transcript.transcript.toLowerCase().split(/\s+/);
        let matchedWords = 0;
        
        for (const liveWord of liveWords) {
          if (pageWords.some(pw => pw.includes(liveWord) || liveWord.includes(pw))) {
            matchedWords++;
          }
        }
        
        const score = liveWords.length > 0 ? (matchedWords / liveWords.length) * 100 : 0;
        
        if (score > bestMatch.score) {
          bestMatch = { pageNumber: transcript.pageNumber, score, matchedWords };
        }
      }

      res.json({ 
        matchedPage: bestMatch.pageNumber,
        confidence: bestMatch.score,
        matchedWords: bestMatch.matchedWords,
        totalLiveWords: liveWords.length
      });
    } catch (error) {
      console.error('Match transcript error:', error);
      res.status(500).json({ error: 'Failed to match transcript' });
    }
  });

  // Process training audio using sequential sliding-window approach
  // Audio is processed in order, monitoring 3 pages at a time
  // Page advances only when next page's lead words are detected
  app.post('/api/process-training-audio', async (req, res) => {
    let learningAttemptId: string | null = null;
    
    try {
      const { audioPath, pdfPath, startPage = 2, endPage = 200 } = req.body;
      
      if (!audioPath || !pdfPath) {
        return res.status(400).json({ error: 'audioPath and pdfPath are required' });
      }

      // Security: Validate audioPath stays within uploads/audio directory
      const uploadsAudioDir = path.resolve(process.cwd(), 'client/public/uploads/audio');
      const relativePath = audioPath.startsWith('/') ? audioPath.slice(1) : audioPath;
      const audioFilePath = path.resolve(process.cwd(), 'client/public', relativePath);
      
      if (!audioFilePath.startsWith(uploadsAudioDir)) {
        return res.status(400).json({ error: 'Invalid audio path' });
      }
      
      try {
        await fs.access(audioFilePath);
      } catch {
        return res.status(404).json({ error: 'Audio file not found' });
      }

      // Get audio duration using ffprobe
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execFileAsync = promisify(execFile);
      
      let audioDurationSec = 0;
      try {
        const { stdout } = await execFileAsync('ffprobe', [
          '-v', 'error',
          '-show_entries', 'format=duration',
          '-of', 'default=noprint_wrappers=1:nokey=1',
          audioFilePath
        ]);
        audioDurationSec = parseFloat(stdout.trim());
      } catch (e) {
        console.error('Failed to get audio duration:', e);
        return res.status(500).json({ error: 'Failed to read audio file' });
      }

      // Create a new learning attempt record
      const learningAttempt = await storage.createLearningAttempt({
        pdfPath,
        audioPath,
        name: `Learning ${new Date().toLocaleString()}`,
        status: 'processing',
        pagesProcessed: 0,
      });
      learningAttemptId = learningAttempt.id;

      // Clear all previous learned content for this PDF before starting fresh
      const allTranscripts = await storage.getPageTranscripts(pdfPath);
      for (const transcript of allTranscripts) {
        const pdfTextOnly = transcript.transcript.split('--- LEARNED FROM AUDIO ---')[0].trim();
        if (pdfTextOnly !== transcript.transcript) {
          await storage.upsertPageTranscript({
            pdfPath,
            pageNumber: transcript.pageNumber,
            transcript: pdfTextOnly,
            keywords: transcript.keywords,
            sessionCount: 1,
          });
        }
      }

      // Re-fetch transcripts and build page index with lead words
      const cleanedTranscripts = await storage.getPageTranscripts(pdfPath);
      
      // Build index with lead words (first 5 words) for each page
      const pdfPageIndex = cleanedTranscripts
        .filter(t => t.pageNumber >= startPage && t.pageNumber <= endPage)
        .map(t => {
          const normalizedText = normalizeTextForMatching(t.transcript);
          const allWords = normalizedText.split(/\s+/).filter(w => w.length > 2);
          return {
            pageNumber: t.pageNumber,
            fullText: normalizedText,
            allWords,
            leadWords: allWords.slice(0, 5), // First 5 words as trigger
            secondaryWords: allWords.slice(0, 15) // Extended context for confirmation
          };
        })
        .filter(p => p.leadWords.length >= 2) // Need at least 2 lead words
        .sort((a, b) => a.pageNumber - b.pageNumber);
      
      if (pdfPageIndex.length < 2) {
        return res.status(400).json({ error: 'Need at least 2 pages with extractable text' });
      }
      
      console.log(`Sequential learning: ${pdfPageIndex.length} pages, audio ${audioDurationSec.toFixed(0)}s`);

      const tempDir = path.join(process.cwd(), 'temp_audio');
      await fs.mkdir(tempDir, { recursive: true });

      // State for sequential processing
      let currentPageIdx = 0; // Index into pdfPageIndex
      const pageTranscripts: Map<number, string[]> = new Map(); // Accumulated audio per page
      const CHUNK_DURATION_SEC = 10; // Process in 10-second chunks
      const OVERLAP_SEC = 2; // 2-second overlap between chunks
      const LEAD_WORD_CONFIDENCE_THRESHOLD = 60; // % of lead words that must match
      
      let processedChunks = 0;
      const totalChunks = Math.ceil(audioDurationSec / (CHUNK_DURATION_SEC - OVERLAP_SEC));
      
      // Process audio in sequential chunks
      for (let startSec = 0; startSec < audioDurationSec && currentPageIdx < pdfPageIndex.length; startSec += (CHUNK_DURATION_SEC - OVERLAP_SEC)) {
        const chunkDuration = Math.min(CHUNK_DURATION_SEC, audioDurationSec - startSec);
        if (chunkDuration < 3) break; // Skip very short final chunks
        
        const outputFile = path.join(tempDir, `chunk_${processedChunks}.wav`);
        
        try {
          // Extract audio chunk
          await execFileAsync('ffmpeg', [
            '-y', '-i', audioFilePath,
            '-ss', startSec.toString(),
            '-t', chunkDuration.toString(),
            '-ar', '16000',
            '-ac', '1',
            outputFile
          ], { timeout: 30000 });
          
          const audioBuffer = await fs.readFile(outputFile);
          
          // Transcribe chunk using OpenAI Whisper
          const audioFile = new File([audioBuffer], 'chunk.wav', { type: 'audio/wav' });

          const openai = getOpenAIClient();
          if (!openai) {
            return res.status(501).json({ error: "Transcription is not configured (missing OPENAI_API_KEY)" });
          }
          
          const transcription = await openai.audio.transcriptions.create({
            file: audioFile,
            model: "whisper-1",
            language: "hy", // Armenian
            response_format: "text",
          });

          let transcript = transcription || "";
          transcript = cleanupTranscript(transcript.trim());
          
          if (!transcript || transcript.length < 5 || transcript.startsWith('[')) {
            await fs.unlink(outputFile).catch(() => {});
            processedChunks++;
            continue;
          }

          const transcriptWords = normalizeTextForMatching(transcript).split(/\s+/).filter(w => w.length > 2);
          
          // Get current and next pages to monitor (3 pages at a time)
          const currentPage = pdfPageIndex[currentPageIdx];
          const nextPage = pdfPageIndex[currentPageIdx + 1];
          const nextNextPage = pdfPageIndex[currentPageIdx + 2];
          
          // Check if transcript matches next page's lead words (trigger for page turn)
          // IMPORTANT: Check BEFORE adding to current page to avoid off-by-one
          let shouldAdvance = false;
          let matchConfidence = 0;
          
          if (nextPage) {
            const nextLeadMatches = countLeadWordMatches(transcriptWords, nextPage.leadWords);
            matchConfidence = (nextLeadMatches / nextPage.leadWords.length) * 100;
            
            // Also check secondary words for confirmation
            const nextSecondaryMatches = countWordMatches(transcriptWords, nextPage.secondaryWords);
            const secondaryConfidence = (nextSecondaryMatches / Math.min(transcriptWords.length, nextPage.secondaryWords.length)) * 100;
            
            // Advance if lead words match well AND secondary context confirms
            if (matchConfidence >= LEAD_WORD_CONFIDENCE_THRESHOLD && secondaryConfidence >= 40) {
              shouldAdvance = true;
              console.log(`Page turn: ${currentPage.pageNumber} -> ${nextPage.pageNumber} (lead: ${matchConfidence.toFixed(0)}%, ctx: ${secondaryConfidence.toFixed(0)}%)`);
            }
          }
          
          // If advancing, save current page FIRST (without this chunk), then add chunk to new page
          if (shouldAdvance) {
            // Save progress for completed page (without current chunk)
            const accumulated = pageTranscripts.get(currentPage.pageNumber)?.join(' ') || '';
            if (accumulated.length > 5) {
              await storage.createLearningAttemptPage({
                attemptId: learningAttempt.id,
                pageNumber: currentPage.pageNumber,
                transcript: `[Page ${currentPage.pageNumber}] ${accumulated}`,
                duration: 0,
              });
              
              // Save to page_transcripts
              const existing = await storage.getPageTranscript(pdfPath, currentPage.pageNumber);
              const delimiter = '\n\n--- LEARNED FROM AUDIO ---\n';
              const pdfTextOnly = existing ? existing.transcript.split('--- LEARNED FROM AUDIO ---')[0].trim() : '';
              const newTranscript = pdfTextOnly + delimiter + accumulated;
              
              await storage.upsertPageTranscript({
                pdfPath,
                pageNumber: currentPage.pageNumber,
                transcript: newTranscript,
                keywords: extractKeywords(accumulated),
                sessionCount: existing ? existing.sessionCount + 1 : 1,
              });
            }
            
            // Advance to next page
            currentPageIdx++;
            
            // Update progress
            await storage.updateLearningAttempt(learningAttempt.id, {
              pagesProcessed: currentPageIdx,
            });
          }
          
          // Now add transcript to the CURRENT page (after potential advancement)
          const targetPage = pdfPageIndex[currentPageIdx];
          if (targetPage) {
            if (!pageTranscripts.has(targetPage.pageNumber)) {
              pageTranscripts.set(targetPage.pageNumber, []);
            }
            pageTranscripts.get(targetPage.pageNumber)!.push(transcript);
          }
          
          await fs.unlink(outputFile).catch(() => {});
          processedChunks++;
          
        } catch (segmentError) {
          console.error(`Error processing chunk at ${startSec}s:`, segmentError);
          await fs.unlink(outputFile).catch(() => {});
        }
      }
      
      // Save any remaining page that wasn't completed
      const lastPage = pdfPageIndex[currentPageIdx];
      if (lastPage && pageTranscripts.has(lastPage.pageNumber)) {
        const accumulated = pageTranscripts.get(lastPage.pageNumber)?.join(' ') || '';
        if (accumulated.length > 5) {
          await storage.createLearningAttemptPage({
            attemptId: learningAttempt.id,
            pageNumber: lastPage.pageNumber,
            transcript: `[Page ${lastPage.pageNumber}] ${accumulated}`,
            duration: 0,
          });
          
          const existing = await storage.getPageTranscript(pdfPath, lastPage.pageNumber);
          const delimiter = '\n\n--- LEARNED FROM AUDIO ---\n';
          const pdfTextOnly = existing ? existing.transcript.split('--- LEARNED FROM AUDIO ---')[0].trim() : '';
          const newTranscript = pdfTextOnly + delimiter + accumulated;
          
          await storage.upsertPageTranscript({
            pdfPath,
            pageNumber: lastPage.pageNumber,
            transcript: newTranscript,
            keywords: extractKeywords(accumulated),
            sessionCount: existing ? existing.sessionCount + 1 : 1,
          });
        }
      }

      // Mark learning attempt as completed
      await storage.updateLearningAttempt(learningAttempt.id, {
        status: 'completed',
        pagesProcessed: currentPageIdx + 1,
      });

      const pagesWithContent = Array.from(pageTranscripts.entries()).map(([pageNum, transcripts]) => ({
        pageNumber: pageNum,
        transcript: transcripts.join(' ').substring(0, 100) + '...',
        chunks: transcripts.length
      }));

      res.json({ 
        success: true, 
        message: `Sequential learning: processed ${processedChunks} chunks across ${pagesWithContent.length} pages`,
        pages: pagesWithContent,
        attemptId: learningAttempt.id,
      });
    } catch (error) {
      console.error('Process training audio error:', error);
      if (learningAttemptId) {
        await storage.updateLearningAttempt(learningAttemptId, {
          status: 'failed',
        }).catch(e => console.error('Failed to update attempt status:', e));
      }
      res.status(500).json({ error: 'Failed to process training audio' });
    }
  });

  // Get all learning attempts for a PDF
  app.get('/api/learning-attempts', async (req, res) => {
    try {
      const pdfPath = req.query.pdfPath as string | undefined;
      const pdfId = req.query.pdfId as string | undefined;
      if (!pdfPath) {
        return res.status(400).json({ error: 'pdfPath query parameter is required' });
      }
      const attempts = await storage.getLearningAttempts(pdfPath);
      res.json(attempts);
    } catch (error) {
      console.error('Get learning attempts error:', error);
      res.status(500).json({ error: 'Failed to get learning attempts' });
    }
  });

  // Get a specific learning attempt with its pages
  app.get('/api/learning-attempts/:id', async (req, res) => {
    try {
      const attempt = await storage.getLearningAttempt(req.params.id);
      if (!attempt) {
        return res.status(404).json({ error: 'Learning attempt not found' });
      }
      const pages = await storage.getLearningAttemptPages(req.params.id);
      res.json({ ...attempt, pages });
    } catch (error) {
      console.error('Get learning attempt error:', error);
      res.status(500).json({ error: 'Failed to get learning attempt' });
    }
  });

  // Delete a learning attempt
  app.delete('/api/learning-attempts/:id', async (req, res) => {
    try {
      await storage.deleteLearningAttempt(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Delete learning attempt error:', error);
      res.status(500).json({ error: 'Failed to delete learning attempt' });
    }
  });

  // List available audio files
  app.get('/api/audio-files', async (req, res) => {
    try {
      const audioDir = path.join(process.cwd(), 'client/public/uploads/audio');
      await fs.mkdir(audioDir, { recursive: true });

      const files = await fs.readdir(audioDir);
      const audioFiles = await Promise.all(
        files
          .filter((f) => f.endsWith('.wav') || f.endsWith('.webm') || f.endsWith('.mp3') || f.endsWith('.m4a') || f.endsWith('.ogg'))
          .map(async (f) => {
            const stats = await fs.stat(path.join(audioDir, f));
            return {
              filename: f,
              path: `/uploads/audio/${f}`,
              size: stats.size,
              sizeFormatted: `${(stats.size / (1024 * 1024)).toFixed(1)} MB`,
              createdAt: stats.birthtime,
            };
          }),
      );
      res.json({ audioFiles });
    } catch (error) {
      console.error('List audio files error:', error);
      res.status(500).json({ error: 'Failed to list audio files' });
    }
  });

  // ============ Liturgy Live Tracker ============
  
  // Initialize tracker (singleton for now)
  let liturgyTracker: LiturgyPageTracker | null = null;
  
  try {
    liturgyTracker = new LiturgyPageTracker();
    console.log('✅ Liturgy tracker initialized');
  } catch (error) {
    console.error('⚠️ Liturgy tracker failed to initialize:', error);
  }
  
  // Start liturgy tracking session
  app.post('/api/liturgy/start', async (req, res) => {
    try {
      if (!liturgyTracker) {
        return res.status(500).json({ error: 'Tracker not initialized' });
      }
      
      liturgyTracker.reset();
      
      // Also update display bus to page 1
      setPdfState({ 
        pdfPath: '/uploads/pdfs/liturgy.pdf', 
        pdfId: null, 
        totalPages: 183 
      });
      setPageState({ page: 1, reason: 'liturgy_start', confidence: 1.0 });
      
      res.json({ 
        status: 'started', 
        currentPage: 1,
        message: 'Liturgy tracking started - listening for page turns'
      });
    } catch (error: any) {
      console.error('Liturgy start error:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Process live audio for page tracking
  app.post('/api/liturgy/process', async (req, res) => {
    try {
      if (!liturgyTracker) {
        return res.status(500).json({ error: 'Tracker not initialized' });
      }
      
      const { audioData, timestamp } = req.body;
      
      if (!audioData || !Array.isArray(audioData)) {
        return res.status(400).json({ error: 'Invalid audio data' });
      }
      
      // Convert to Float32Array
      const samples = new Float32Array(audioData);
      
      // Process through tracker
      const result = liturgyTracker.processLiveAudio(samples, timestamp || Date.now());
      
      // If page changed, update display bus
      if (result.changed) {
        setPageState({ 
          page: result.page, 
          reason: result.reason || 'audio_match',
          confidence: result.confidence || 0.75
        });
        
        console.log(`📄 Page advanced: ${result.page} (${result.reason}, ${(result.confidence! * 100).toFixed(0)}%)`);
      }
      
      res.json(result);
    } catch (error: any) {
      console.error('Liturgy process error:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Manual page override
  app.post('/api/liturgy/goto-page', async (req, res) => {
    try {
      if (!liturgyTracker) {
        return res.status(500).json({ error: 'Tracker not initialized' });
      }
      
      const { page } = req.body;
      
      if (typeof page !== 'number' || page < 1 || page > 183) {
        return res.status(400).json({ error: 'Invalid page number (must be 1-183)' });
      }
      
      const success = liturgyTracker.setPage(page);
      
      if (success) {
        setPageState({ page, reason: 'manual_override', confidence: 1.0 });
        res.json({ page, changed: true, message: 'Page set manually' });
      } else {
        res.status(400).json({ error: 'Failed to set page' });
      }
    } catch (error: any) {
      console.error('Liturgy goto-page error:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Get current liturgy tracking status
  app.get('/api/liturgy/status', async (req, res) => {
    try {
      if (!liturgyTracker) {
        return res.json({ 
          initialized: false, 
          error: 'Tracker not initialized' 
        });
      }
      
      res.json({
        initialized: true,
        currentPage: liturgyTracker.getCurrentPage(),
        totalPages: 183
      });
    } catch (error: any) {
      console.error('Liturgy status error:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Stop liturgy tracking
  app.post('/api/liturgy/stop', async (req, res) => {
    try {
      if (liturgyTracker) {
        liturgyTracker.reset();
      }
      res.json({ status: 'stopped', message: 'Liturgy tracking stopped' });
    } catch (error: any) {
      console.error('Liturgy stop error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============ Local Chat API ============

  // Get all conversations
  app.get('/api/chat/conversations', async (_req, res) => {
    try {
      const conversations = await storage.getAllConversations();
      res.json(conversations);
    } catch (error: any) {
      console.error('Get conversations error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create new conversation
  app.post('/api/chat/conversations', async (req, res) => {
    try {
      const { title } = req.body;
      const conversation = await storage.createConversation({ title: title || 'New Chat' });
      res.json(conversation);
    } catch (error: any) {
      console.error('Create conversation error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get messages for a conversation
  app.get('/api/chat/conversations/:id/messages', async (req, res) => {
    try {
      const { id } = req.params;
      const messages = await storage.getConversationMessages(id);
      res.json(messages);
    } catch (error: any) {
      console.error('Get messages error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Send message (user) and get bot response
  app.post('/api/chat/conversations/:id/messages', async (req, res) => {
    try {
      const { id } = req.params;
      const { role, content } = req.body;

      // Save user message
      await storage.createMessage({
        conversationId: id,
        role,
        content,
      });

      // If user message, generate bot response via Clawdbot
      if (role === 'user') {
        try {
          // Send message to Clawdbot agent session
          const agentResponse = await fetch('http://127.0.0.1:29790/api/v1/sessions/agent:liturgy:main/send', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.GATEWAY_TOKEN || ''}`,
            },
            body: JSON.stringify({ 
              message: content,
              timeoutSeconds: 30,
            }),
          });

          if (agentResponse.ok) {
            const { reply } = await agentResponse.json();
            
            // Save assistant response
            if (reply) {
              await storage.createMessage({
                conversationId: id,
                role: 'assistant',
                content: reply,
              });
            }
          } else {
            console.error('Clawdbot API error:', await agentResponse.text());
            await storage.createMessage({
              conversationId: id,
              role: 'assistant',
              content: 'Sorry, I encountered an error processing your message.',
            });
          }
        } catch (error: any) {
          console.error('Clawdbot connection error:', error);
          await storage.createMessage({
            conversationId: id,
            role: 'assistant',
            content: 'Sorry, I am currently unavailable. Please try again later.',
          });
        }
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('Send message error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}

// Clean up transcribed text: remove repeated words and obvious noise
function cleanupTranscript(text: string): string {
  if (!text) return '';
  
  // Remove any bracketed markers like [silence], [unclear], etc.
  text = text.replace(/\[[^\]]*\]/g, '');
  
  // Split into words
  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return '';
  
  // Remove consecutive repeated words (e.g., "oghormea oghormea oghormea" -> "oghormea")
  const deduped: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[:;,.]+$/, ''); // Remove trailing punctuation
    if (!word) continue;
    // Skip if same as previous word (case-insensitive)
    if (deduped.length === 0 || word.toLowerCase() !== deduped[deduped.length - 1].toLowerCase()) {
      deduped.push(word);
    }
  }
  
  return deduped.join(' ').trim();
}

// Extract keywords from Armenian text
function extractKeywords(text: string): string[] {
  if (!text) return [];
  const words = text.split(/\s+/).filter(w => w.length > 3);
  const uniqueWords = Array.from(new Set(words));
  return uniqueWords.slice(0, 20);
}

// Helper functions for audio feature aggregation
function averageAudioFeatures(featuresList: any[]): any {
  if (!featuresList || featuresList.length === 0) return null;
  
  const validFeatures = featuresList.filter(f => f && typeof f === 'object');
  if (validFeatures.length === 0) return null;

  const sum = validFeatures.reduce((acc, f) => ({
    rms: (acc.rms || 0) + (f.rms || 0),
    zcr: (acc.zcr || 0) + (f.zcr || 0),
    spectralCentroid: (acc.spectralCentroid || 0) + (f.spectralCentroid || 0),
    spectralRolloff: (acc.spectralRolloff || 0) + (f.spectralRolloff || 0),
    mfcc: (f.mfcc || []).map((v: number, i: number) => ((acc.mfcc || [])[i] || 0) + v),
  }), { rms: 0, zcr: 0, spectralCentroid: 0, spectralRolloff: 0, mfcc: [] as number[] });

  const n = validFeatures.length;
  return {
    rms: sum.rms / n,
    zcr: sum.zcr / n,
    spectralCentroid: sum.spectralCentroid / n,
    spectralRolloff: sum.spectralRolloff / n,
    mfcc: sum.mfcc.map((v: number) => v / n),
  };
}

function calculateFeatureConsistency(featuresList: any[]): number {
  if (!featuresList || featuresList.length < 2) return 0;
  
  const validFeatures = featuresList.filter(f => f && typeof f === 'object' && f.rms !== undefined);
  if (validFeatures.length < 2) return 0;

  // Calculate variance in RMS as a proxy for consistency
  const rmsValues = validFeatures.map(f => f.rms || 0);
  const avgRms = rmsValues.reduce((a, b) => a + b, 0) / rmsValues.length;
  const variance = rmsValues.reduce((sum, v) => sum + Math.pow(v - avgRms, 2), 0) / rmsValues.length;
  
  // Lower variance = higher consistency, scaled to 0-20 points
  const consistencyScore = Math.max(0, 20 - (variance * 1000));
  return consistencyScore;
}

// Normalize text for matching - remove punctuation, lowercase, standardize spacing
function normalizeTextForMatching(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^a-zA-Z\u0531-\u0587\u0561-\u0587\s]/g, ' ') // Keep only letters
    .replace(/\s+/g, ' ')
    .trim();
}

// Find the best matching PDF page for a given transcript
interface PageIndex {
  pageNumber: number;
  text: string;
  words: string[];
}

function findBestMatchingPage(transcript: string, pdfPageIndex: PageIndex[]): { pageNumber: number; confidence: number } {
  if (!transcript || pdfPageIndex.length === 0) {
    return { pageNumber: 1, confidence: 0 };
  }
  
  const transcriptNormalized = normalizeTextForMatching(transcript);
  const transcriptWords = transcriptNormalized.split(/\s+/).filter(w => w.length > 2);
  
  if (transcriptWords.length === 0) {
    return { pageNumber: 1, confidence: 0 };
  }
  
  let bestMatch = { pageNumber: 1, confidence: 0 };
  
  for (const page of pdfPageIndex) {
    if (page.words.length === 0) continue;
    
    let matchedWords = 0;
    
    for (const tWord of transcriptWords) {
      for (const pWord of page.words) {
        if (wordsMatchFuzzy(tWord, pWord)) {
          matchedWords++;
          break;
        }
      }
    }
    
    // Calculate confidence as percentage of transcript words found in page
    const confidence = (matchedWords / transcriptWords.length) * 100;
    
    if (confidence > bestMatch.confidence) {
      bestMatch = { pageNumber: page.pageNumber, confidence };
    }
  }
  
  return bestMatch;
}

// Fuzzy word matching - handles slight spelling variations
function wordsMatchFuzzy(word1: string, word2: string): boolean {
  if (word1 === word2) return true;
  if (word1.includes(word2) || word2.includes(word1)) return true;
  
  // Levenshtein distance <= 2 for words of similar length
  if (Math.abs(word1.length - word2.length) <= 2) {
    const distance = levenshteinDistance(word1, word2);
    if (distance <= 2) return true;
  }
  
  return false;
}

function levenshteinDistance(s1: string, s2: string): number {
  const len1 = s1.length;
  const len2 = s2.length;
  
  if (len1 === 0) return len2;
  if (len2 === 0) return len1;
  
  const matrix: number[][] = [];
  
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  return matrix[len1][len2];
}

// Count how many lead words from targetLeadWords appear in transcriptWords
function countLeadWordMatches(transcriptWords: string[], targetLeadWords: string[]): number {
  let matches = 0;
  for (const leadWord of targetLeadWords) {
    for (const tWord of transcriptWords) {
      if (wordsMatchFuzzy(tWord, leadWord)) {
        matches++;
        break;
      }
    }
  }
  return matches;
}

// Count general word matches between transcript and page words
function countWordMatches(transcriptWords: string[], pageWords: string[]): number {
  let matches = 0;
  for (const tWord of transcriptWords) {
    for (const pWord of pageWords) {
      if (wordsMatchFuzzy(tWord, pWord)) {
        matches++;
        break;
      }
    }
  }
  return matches;
}