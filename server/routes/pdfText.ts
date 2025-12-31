import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import * as pdfParse from "pdf-parse";

export const pdfTextRouter = express.Router();

function sha256File(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function normalize(s: string): string {
  return (s || "")
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/giu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function extractPages(pdfPathAbs: string) {
  const parse = (pdfParse as any).default || pdfParse;
  const data = await parse(fs.readFileSync(pdfPathAbs));
  const raw = data.text || "";
  const parts = raw.split("\f");
  const pages = parts.length > 1 ? parts : [raw];

  return pages.map((t: string, idx: number) => ({
    pageNumber: idx + 1,
    text: t,
    norm: normalize(t),
    pageId: crypto.createHash("sha256").update(normalize(t)).digest("hex").slice(0, 16),
  }));
}

pdfTextRouter.get("/pdf-text", async (req, res) => {
  try {
    const pdfPath = String(req.query.path || "");
    if (!pdfPath.startsWith("/uploads/")) {
      return res.status(400).json({ ok: false, error: "Invalid pdf path" });
    }

    const abs = path.join(process.cwd(), pdfPath);
    if (!fs.existsSync(abs)) {
      return res.status(404).json({ ok: false, error: "PDF not found" });
    }

    const pdfId = sha256File(abs).slice(0, 16);
    const pages = await extractPages(abs);

    return res.json({
      ok: true,
      pdf: { pdfId, path: pdfPath, numPages: pages.length },
      pages: pages.map((p: { pageNumber: number; pageId: string; norm: string }) => ({ pageNumber: p.pageNumber, pageId: p.pageId, norm: p.norm })),
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "Failed to extract PDF text" });
  }
});
