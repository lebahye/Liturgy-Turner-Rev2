import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import { db } from "../db";
import { wordDictionary, pageSections } from "@shared/schema";
import { eq } from "drizzle-orm";

let pdfjsLib: any = null;

async function getPdfLib() {
  if (!pdfjsLib) {
    pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  }
  return pdfjsLib;
}

export const extractDictionaryRouter = express.Router();

const upload = multer({
  limits: { fileSize: 30 * 1024 * 1024 }, // CSV/XLSX dictionaries can be a bit big
});

function isArmenian(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 0x0530 && code <= 0x058F) || (code >= 0xFB00 && code <= 0xFB17);
}

function isLatin(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 0x0041 && code <= 0x007A) || (code >= 0x00C0 && code <= 0x024F);
}

function extractTextSections(text: string): { armenian: string[]; phonetic: string[]; english: string[] } {
  const words = text.split(/\s+/);
  const armenian: string[] = [];
  const phonetic: string[] = [];
  const english: string[] = [];
  
  for (const word of words) {
    if (!word) continue;
    
    const chars = Array.from(word);
    const armenianChars = chars.filter(isArmenian).length;
    const latinChars = chars.filter(isLatin).length;
    const totalChars = word.length;
    
    if (armenianChars > totalChars * 0.5) {
      armenian.push(word);
    } else if (latinChars > totalChars * 0.5) {
      const lower = word.toLowerCase();
      if (lower.includes("û") || lower.includes("é") || lower.includes("ô") || 
          lower.includes("oo") || lower.includes("ts") || lower.includes("dz") ||
          /[bcdfghjklmnpqrstvwxyz]{2,}/.test(lower)) {
        phonetic.push(word);
      } else {
        english.push(word);
      }
    }
  }
  
  return { armenian, phonetic, english };
}

function buildWordPairs(armenianWords: string[], phoneticWords: string[]): { armenian: string; phonetic: string }[] {
  const pairs: { armenian: string; phonetic: string }[] = [];
  
  const minLen = Math.min(armenianWords.length, phoneticWords.length);
  for (let i = 0; i < minLen; i++) {
    if (armenianWords[i] && phoneticWords[i]) {
      pairs.push({
        armenian: armenianWords[i].toLowerCase(),
        phonetic: phoneticWords[i].toLowerCase(),
      });
    }
  }
  
  return pairs;
}

async function extractTextFromPage(pdfDoc: any, pageNum: number): Promise<string> {
  const page = await pdfDoc.getPage(pageNum);
  const textContent = await page.getTextContent();
  const items = textContent.items as Array<{ str: string }>;
  return items.map(item => item.str).join(" ");
}

extractDictionaryRouter.post("/extract-dictionary", async (req, res) => {
  try {
    const { pdfPath } = req.body;
    
    if (!pdfPath || !pdfPath.startsWith("/uploads/")) {
      return res.status(400).json({ ok: false, error: "Invalid PDF path" });
    }
    
    const abs = path.join(process.cwd(), pdfPath);
    if (!fs.existsSync(abs)) {
      return res.status(404).json({ ok: false, error: "PDF not found" });
    }
    
    const pdfId = crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex").slice(0, 16);
    
    await db.delete(wordDictionary).where(eq(wordDictionary.pdfId, pdfId));
    await db.delete(pageSections).where(eq(pageSections.pdfId, pdfId));
    
    const pdfLib = await getPdfLib();
    const dataBuffer = fs.readFileSync(abs);
    const data = new Uint8Array(dataBuffer);
    const pdfDoc = await pdfLib.getDocument({ data }).promise;
    const numPages = pdfDoc.numPages;
    
    let totalWords = 0;
    let totalPages = 0;
    const allPairs: { armenian: string; phonetic: string; pageNumber: number }[] = [];
    
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const pageText = await extractTextFromPage(pdfDoc, pageNum);
      
      const { armenian, phonetic, english } = extractTextSections(pageText);
      
      await db.insert(pageSections).values({
        pdfId,
        pageNumber: pageNum,
        armenianText: armenian.join(" "),
        phoneticText: phonetic.join(" "),
        englishText: english.join(" "),
      });
      
      const pairs = buildWordPairs(armenian, phonetic);
      for (const pair of pairs) {
        allPairs.push({ ...pair, pageNumber: pageNum });
      }
      
      totalPages++;
    }
    
    const uniquePairs = new Map<string, { armenian: string; phonetic: string; pageNumber: number; occurrences: number }>();
    for (const pair of allPairs) {
      const key = `${pair.armenian}|${pair.phonetic}`;
      if (uniquePairs.has(key)) {
        uniquePairs.get(key)!.occurrences++;
      } else {
        uniquePairs.set(key, { ...pair, occurrences: 1 });
      }
    }
    
    const pairsToInsert = Array.from(uniquePairs.values());
    for (const pair of pairsToInsert) {
      await db.insert(wordDictionary).values({
        pdfId,
        armenian: pair.armenian,
        phonetic: pair.phonetic,
        pageNumber: pair.pageNumber,
        occurrences: pair.occurrences,
      });
      totalWords++;
    }
    
    return res.json({
      ok: true,
      pdfId,
      totalPages,
      totalWords,
      message: `Extracted ${totalWords} unique word pairs from ${totalPages} pages`,
    });
  } catch (e: any) {
    console.error("Dictionary extraction error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Extraction failed" });
  }
});

extractDictionaryRouter.get("/dictionary/:pdfId", async (req, res) => {
  try {
    const { pdfId } = req.params;
    
    const words = await db.select()
      .from(wordDictionary)
      .where(eq(wordDictionary.pdfId, pdfId))
      .limit(500);
    
    const sections = await db.select()
      .from(pageSections)
      .where(eq(pageSections.pdfId, pdfId))
      .orderBy(pageSections.pageNumber);
    
    return res.json({
      ok: true,
      pdfId,
      wordCount: words.length,
      pageCount: sections.length,
      words,
      sections,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "Failed to get dictionary" });
  }
});

extractDictionaryRouter.get("/page-sections/:pdfId", async (req, res) => {
  try {
    const { pdfId } = req.params;

    let sections = await db.select()
      .from(pageSections)
      .where(eq(pageSections.pdfId, pdfId))
      .orderBy(pageSections.pageNumber);

    // Fallback: if no sections for this pdfId, return sections from any pdfId
    // (the Badarak text is the same regardless of PDF version)
    if (sections.length === 0) {
      sections = await db.select()
        .from(pageSections)
        .orderBy(pageSections.pageNumber)
        .limit(183);
    }
    
    const pages = sections.map(s => ({
      pageNumber: s.pageNumber,
      armenian: s.armenianText || "",
      phonetic: s.phoneticText || "",
      english: s.englishText || "",
      combined: `${s.armenianText || ""} ${s.phoneticText || ""}`.toLowerCase(),
    }));
    
    return res.json({
      ok: true,
      pdfId,
      pageCount: pages.length,
      pages,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "Failed to get page sections" });
  }
});

function parseDictionaryCsv(csvContent: string) {
  // Accept both 2-column CSV (armenian,phonetic) and 3-column (armenian,english,phonetic)
  // We keep (armenian, phonetic) only.
  const lines = csvContent.split(/\r?\n/);
  const out: Array<{ armenian: string; phonetic: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Skip header-ish rows
    if (i === 0 && /armenian/i.test(line) && /phonetic/i.test(line)) continue;

    // Naive CSV split; acceptable for our expected dictionary files.
    const cols = line.split(",").map((c) => c.trim());
    if (cols.length < 2) continue;

    const armenian = (cols[0] || "").toLowerCase();
    const phonetic = (cols.length >= 3 ? cols[2] : cols[1] || "").toLowerCase();

    if (!armenian || !phonetic) continue;
    out.push({ armenian, phonetic });
  }

  return out;
}

async function importWordPairs(pdfId: string, pairs: Array<{ armenian: string; phonetic: string }>) {
  await db.delete(wordDictionary).where(eq(wordDictionary.pdfId, pdfId));

  let imported = 0;
  const seen = new Set<string>();

  for (const pair of pairs) {
    const armenian = pair.armenian.trim().toLowerCase();
    const phonetic = pair.phonetic.trim().toLowerCase();
    if (!armenian || !phonetic) continue;

    const key = `${armenian}|${phonetic}`;
    if (seen.has(key)) continue;
    seen.add(key);

    await db.insert(wordDictionary).values({
      pdfId,
      armenian,
      phonetic,
      pageNumber: null,
      occurrences: 1,
      confidence: 1.0,
    });
    imported++;
  }

  return imported;
}

// Back-compat: import dictionary from a server-local CSV path
extractDictionaryRouter.post("/import-dictionary-csv", async (req, res) => {
  try {
    const { csvPath, pdfId: customPdfId } = req.body;

    if (!csvPath) {
      return res.status(400).json({ ok: false, error: "CSV path required" });
    }

    const abs = path.join(process.cwd(), csvPath);
    if (!fs.existsSync(abs)) {
      return res.status(404).json({ ok: false, error: "CSV file not found" });
    }

    const pdfId = customPdfId || "manual_dictionary";
    const csvContent = fs.readFileSync(abs, "utf-8");
    const pairs = parseDictionaryCsv(csvContent);
    const imported = await importWordPairs(pdfId, pairs);

    return res.json({
      ok: true,
      pdfId,
      imported,
      message: `Imported ${imported} word pairs`,
    });
  } catch (e: any) {
    console.error("CSV import error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Import failed" });
  }
});

// Preferred: upload a CSV or XLSX dictionary file
extractDictionaryRouter.post("/import-dictionary", upload.single("file"), async (req, res) => {
  try {
    const pdfId = String(req.body?.pdfId || "manual_dictionary");

    if (!req.file) {
      return res.status(400).json({ ok: false, error: "file is required" });
    }

    const original = req.file.originalname.toLowerCase();
    const buf = req.file.buffer;

    let pairs: Array<{ armenian: string; phonetic: string }> = [];

    if (original.endsWith('.csv') || req.file.mimetype.includes('csv')) {
      const csvContent = buf.toString('utf-8');
      pairs = parseDictionaryCsv(csvContent);
    } else if (original.endsWith('.xlsx') || original.endsWith('.xls')) {
      const xlsx = await import('xlsx');
      const wb = xlsx.read(buf, { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: false }) as any[];

      for (const row of rows) {
        if (!row) continue;
        const a = String(row[0] ?? '').trim();
        const b = String(row[1] ?? '').trim();
        const c = String(row[2] ?? '').trim();

        // Try common layouts:
        // [armenian, phonetic]
        // [armenian, english, phonetic]
        const armenian = a.toLowerCase();
        const phonetic = (c || b).toLowerCase();
        if (!armenian || !phonetic) continue;
        // Skip header rows
        if (/armenian/i.test(armenian) && /phonetic/i.test(phonetic)) continue;
        pairs.push({ armenian, phonetic });
      }
    } else {
      return res.status(400).json({ ok: false, error: "Unsupported file type. Upload .csv or .xlsx" });
    }

    const imported = await importWordPairs(pdfId, pairs);

    return res.json({
      ok: true,
      pdfId,
      imported,
      message: `Imported ${imported} word pairs from ${req.file.originalname}`,
    });
  } catch (e: any) {
    console.error("Dictionary import error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Import failed" });
  }
});

extractDictionaryRouter.get("/dictionary-words", async (req, res) => {
  try {
    const pdfId = (req.query.pdfId as string) || "manual_dictionary";

    // "global_dictionary" or "all" returns ALL words regardless of pdfId
    let words;
    if (pdfId === "global_dictionary" || pdfId === "all") {
      words = await db.select().from(wordDictionary);
    } else {
      words = await db.select()
        .from(wordDictionary)
        .where(eq(wordDictionary.pdfId, pdfId));
    }

    return res.json({
      ok: true,
      pdfId,
      count: words.length,
      words,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "Failed to get dictionary" });
  }
});

extractDictionaryRouter.get("/check-pdf-sections", async (req, res) => {
  try {
    const pdfPath = req.query.path as string;
    
    if (!pdfPath || !pdfPath.startsWith("/uploads/")) {
      return res.status(400).json({ ok: false, error: "Invalid PDF path" });
    }
    
    // Try multiple possible locations for the PDF
    const candidates = [
      path.join(process.cwd(), pdfPath),
      path.join(process.cwd(), 'client', 'public', pdfPath),
      path.join(process.cwd(), 'dist', 'public', pdfPath),
    ];
    const abs = candidates.find(p => fs.existsSync(p));
    if (!abs) {
      return res.status(404).json({ ok: false, error: "PDF not found", pageCount: 0, searched: candidates });
    }

    // Compute full SHA256 pdfId (not truncated)
    const fullPdfId = crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
    const shortPdfId = fullPdfId.slice(0, 16);

    // Search by both full and short pdfId
    let sections = await db.select()
      .from(pageSections)
      .where(eq(pageSections.pdfId, fullPdfId));

    if (sections.length === 0) {
      sections = await db.select()
        .from(pageSections)
        .where(eq(pageSections.pdfId, shortPdfId));
    }

    // Fallback: return any available sections (same Badarak content)
    if (sections.length === 0) {
      sections = await db.select()
        .from(pageSections)
        .orderBy(pageSections.pageNumber)
        .limit(183);
    }

    return res.json({
      ok: true,
      pdfId: fullPdfId,
      pageCount: sections.length,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "Failed to check sections", pageCount: 0 });
  }
});
