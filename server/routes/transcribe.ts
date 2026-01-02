import express from "express";
import multer from "multer";
import OpenAI from "openai";

export const transcribeRouter = express.Router();

const upload = multer({ limits: { fileSize: 20 * 1024 * 1024 } });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function dataUrlOrBase64ToBuffer(b64: string) {
  const comma = b64.indexOf(",");
  const raw = comma !== -1 ? b64.slice(comma + 1) : b64;
  return Buffer.from(raw, "base64");
}

transcribeRouter.post("/transcribe", upload.single("audio"), async (req, res) => {
  try {
    let audioBuffer: Buffer | null = null;
    let mimeType: string = "audio/webm";

    if (req.is("application/json")) {
      const { audioBase64, mimeType: mt } = req.body || {};
      if (audioBase64) {
        audioBuffer = dataUrlOrBase64ToBuffer(String(audioBase64));
        if (mt) mimeType = String(mt);
      }
    }

    if (!audioBuffer && req.file) {
      audioBuffer = req.file.buffer;
      if (req.file.mimetype) mimeType = req.file.mimetype;
    }

    if (!audioBuffer) {
      return res.status(400).json({ error: "audioBase64 or audio file is required" });
    }

    const file = new File([audioBuffer], "audio.webm", { type: mimeType });

    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: "whisper-1",
    });

    return res.json({ text: transcription.text });
  } catch (e: any) {
    console.error("Transcription error:", e);
    return res.status(500).json({ error: e?.message || "Transcription failed" });
  }
});
