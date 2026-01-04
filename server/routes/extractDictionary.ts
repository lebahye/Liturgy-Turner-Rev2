import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { PDFParse } from "pdf-parse";
import { db } from "../db";
import { wordDictionary, pageSections } from "@shared/schema";
import { eq, and } from "drizzle-orm";

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
    
    const dataBuffer = fs.readFileSync(abs);
    const parser = new PDFParse({ data: dataBuffer });
    const result = await parser.getText();
    await parser.destroy();
    
    const raw = result.text || "";
    const pageTexts = raw.split("\f");
    
    let totalWords = 0;
    let totalPages = 0;
    
    for (let i = 0; i < pageTexts.length; i++) {
      const pageText = pageTexts[i];
      const pageNumber = i + 1;
      
      const { armenian, phonetic, english } = extractTextSections(pageText);
      
      await db.insert(pageSections).values({
        pdfId,
        pageNumber,
        armenianText: armenian.join(" "),
        phoneticText: phonetic.join(" "),
        englishText: english.join(" "),
      });
      
      const pairs = buildWordPairs(armenian, phonetic);
      
      for (const pair of pairs) {
        const existing = await db.select()
          .from(wordDictionary)
          .where(and(
            eq(wordDictionary.pdfId, pdfId),
            eq(wordDictionary.armenian, pair.armenian),
            eq(wordDictionary.phonetic, pair.phonetic)
          ))
          .limit(1);
        
        if (existing.length > 0) {
          await db.update(wordDictionary)
            .set({ occurrences: (existing[0].occurrences || 1) + 1 })
            .where(eq(wordDictionary.id, existing[0].id));
        } else {
          await db.insert(wordDictionary).values({
            pdfId,
            armenian: pair.armenian,
            phonetic: pair.phonetic,
            pageNumber,
          });
          totalWords++;
        }
      }
      
      totalPages++;
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
