import express from "express";
import multer from "multer";
import OpenAI from "openai";
import { spawn } from "child_process";
import { Readable } from "stream";

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

async function convertToWav(inputBuffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    const ffmpeg = spawn("ffmpeg", [
      "-f", "webm",
      "-i", "pipe:0",
      "-ac", "1",
      "-ar", "16000",
      "-f", "wav",
      "pipe:1"
    ]);

    ffmpeg.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    ffmpeg.stderr.on("data", () => {});

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });

    ffmpeg.on("error", reject);

    const readable = Readable.from(inputBuffer);
    readable.pipe(ffmpeg.stdin);
  });
}

transcribeRouter.post("/transcribe", upload.single("audio"), async (req, res) => {
  try {
    let audioBuffer: Buffer | null = null;

    if (req.is("application/json")) {
      const { audioBase64 } = req.body || {};
      if (audioBase64) {
        audioBuffer = dataUrlOrBase64ToBuffer(String(audioBase64));
      }
    }

    if (!audioBuffer && req.file) {
      audioBuffer = req.file.buffer;
    }

    if (!audioBuffer) {
      return res.status(400).json({ error: "audio file is required" });
    }

    const wavBuffer = await convertToWav(audioBuffer);

    const file = new File([wavBuffer], "audio.wav", { type: "audio/wav" });

    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: "whisper-1",
      language: "hy",
    });

    return res.json({ text: transcription.text });
  } catch (e: any) {
    console.error("Transcription error:", e);
    return res.status(500).json({ error: e?.message || "Transcription failed" });
  }
});
