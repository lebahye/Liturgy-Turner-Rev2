import express from "express";
import multer from "multer";
import OpenAI from "openai";
import { spawn } from "child_process";
import { writeFile, unlink, readFile } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import os from "os";

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
  const tempDir = os.tmpdir();
  const inputPath = path.join(tempDir, `input_${randomUUID()}.webm`);
  const outputPath = path.join(tempDir, `output_${randomUUID()}.wav`);

  await writeFile(inputPath, inputBuffer);

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-y",
      "-i", inputPath,
      "-ac", "1",
      "-ar", "16000",
      "-f", "wav",
      outputPath
    ]);

    let stderrData = "";
    ffmpeg.stderr.on("data", (chunk) => {
      stderrData += chunk.toString();
    });

    ffmpeg.on("close", async (code) => {
      try {
        await unlink(inputPath).catch(() => {});
        
        if (code === 0) {
          const wavBuffer = await readFile(outputPath);
          await unlink(outputPath).catch(() => {});
          resolve(wavBuffer);
        } else {
          await unlink(outputPath).catch(() => {});
          reject(new Error(`ffmpeg exited with code ${code}: ${stderrData.slice(-500)}`));
        }
      } catch (err) {
        reject(err);
      }
    });

    ffmpeg.on("error", async (err) => {
      await unlink(inputPath).catch(() => {});
      await unlink(outputPath).catch(() => {});
      reject(err);
    });
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
      temperature: 0, // Reduce hallucinations by using greedy decoding
    });

    return res.json({ text: transcription.text });
  } catch (e: any) {
    console.error("Transcription error:", e);
    return res.status(500).json({ error: e?.message || "Transcription failed" });
  }
});
