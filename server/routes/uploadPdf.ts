import express from "express";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import fs from "fs";

export const uploadPdfRouter = express.Router();

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "pdfs");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".pdf";
    const name = crypto.randomBytes(16).toString("hex") + ext;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB, adjust if needed
  },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === "application/pdf" ||
      file.originalname.toLowerCase().endsWith(".pdf");
    if (ok) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed") as any);
    }
  },
});

uploadPdfRouter.post("/upload-pdf", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: "No file received. Field name must be 'pdf'." });
    }

    // Stable id for this uploaded file (you can replace with hash of file bytes later)
    const pdfId = crypto.createHash("sha256").update(req.file.filename).digest("hex").slice(0, 16);

    return res.json({
      ok: true,
      pdf: {
        pdfId,
        path: `/uploads/pdfs/${req.file.filename}`,
        originalName: req.file.originalname,
        size: req.file.size,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "Upload failed" });
  }
});

// IMPORTANT: JSON error handler for Multer (prevents HTML responses)
uploadPdfRouter.use((err: any, _req: any, res: any, _next: any) => {
  const msg = err?.message || "Upload error";
  const status = err?.code === "LIMIT_FILE_SIZE" ? 413 : 400;
  res.status(status).json({ ok: false, error: msg });
});
