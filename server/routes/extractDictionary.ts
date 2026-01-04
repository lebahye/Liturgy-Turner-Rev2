import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { db } from "../db";
import { wordDictionary, pageSections } from "@shared/schema";
import { eq, and } from "drizzle-orm";

let pdfjsLib: any = null;

async function getPdfLib() {
  if (!pdfjsLib) {
    pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  }
  return pdfjsLib;
}

export const extractDictionaryRouter = express.Router();

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
    
    const sections = await db.select()
      .from(pageSections)
      .where(eq(pageSections.pdfId, pdfId))
      .orderBy(pageSections.pageNumber);
    
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
    
    await db.delete(wordDictionary).where(eq(wordDictionary.pdfId, pdfId));
    
    const csvContent = fs.readFileSync(abs, "utf-8");
    const lines = csvContent.split("\n").slice(1);
    
    let imported = 0;
    const seen = new Set<string>();
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      const commaIdx = trimmed.indexOf(",");
      if (commaIdx === -1) continue;
      
      const armenian = trimmed.slice(0, commaIdx).trim().toLowerCase();
      const phonetic = trimmed.slice(commaIdx + 1).trim().toLowerCase();
      
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

extractDictionaryRouter.get("/dictionary-words", async (req, res) => {
  try {
    const pdfId = (req.query.pdfId as string) || "manual_dictionary";
    
    const words = await db.select()
      .from(wordDictionary)
      .where(eq(wordDictionary.pdfId, pdfId));
    
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
    
    const abs = path.join(process.cwd(), pdfPath);
    if (!fs.existsSync(abs)) {
      return res.status(404).json({ ok: false, error: "PDF not found", pageCount: 0 });
    }
    
    const pdfId = crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex").slice(0, 16);
    
    const sections = await db.select()
      .from(pageSections)
      .where(eq(pageSections.pdfId, pdfId));
    
    return res.json({
      ok: true,
      pdfId,
      pageCount: sections.length,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "Failed to check sections", pageCount: 0 });
  }
});
