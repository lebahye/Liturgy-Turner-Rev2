#!/usr/bin/env node
/**
 * Comprehensive Liturgy Training Script
 * Maps 87-minute audio recording to 183 PDF pages
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PDF_PATH = path.join(__dirname, 'liturgy.pdf');
const WAV_PATH = path.join(__dirname, 'full_service.wav');
const OUTPUT_DIR = path.join(__dirname, 'training-data');

console.log('📖 Badarak Training System');
console.log('==========================\n');

// Create output directory
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`✅ Created training-data/ directory\n`);
}

async function parsePages() {
  console.log('🔍 Parsing PDF pages...');
  
  const dataBuffer = fs.readFileSync(PDF_PATH);
  const parser = new PDFParse({ data: dataBuffer });
  const result = await parser.getText();
  await parser.destroy();
  
  const fullText = result.text;
  
  // Split by page markers
  const pagePattern = /-- (\d+) of (\d+) --/g;
  const pages = [];
  let match;
  let lastIndex = 0;
  let totalPages = 183;
  
  while ((match = pagePattern.exec(fullText)) !== null) {
    const pageNum = parseInt(match[1]);
    totalPages = parseInt(match[2]);
    const startIndex = match.index;
    
    if (pages.length > 0) {
      pages[pages.length - 1].text = fullText.substring(lastIndex, startIndex).trim();
    }
    
    pages.push({
      pageNumber: pageNum,
      text: '',
      startIndex
    });
    
    lastIndex = startIndex;
  }
  
  // Last page
  if (pages.length > 0) {
    pages[pages.length - 1].text = fullText.substring(lastIndex).trim();
  }
  
  console.log(`✅ Extracted ${pages.length} pages (expected ${totalPages})`);
  
  return { pages, totalPages };
}

function extractArmenianText(text) {
  // Extract lines containing Armenian characters
  const lines = text.split('\n');
  const armenianLines = lines.filter(line => /[Ա-և]/.test(line));
  return armenianLines.join(' ').trim();
}

function extractKeyPhrases(text) {
  // Extract potential key phrases (lines with Armenian text)
  const armenian = extractArmenianText(text);
  const words = armenian.split(/\s+/).filter(w => w.length > 3);
  
  // Get first 5 significant words as keywords
  return words.slice(0, 5);
}

async function analyzePages() {
  const { pages, totalPages } = await parsePages();
  
  console.log('\n📝 Analyzing page content...');
  
  const pageData = pages.map((page, idx) => {
    const armenian = extractArmenianText(page.text);
    const keywords = extractKeyPhrases(page.text);
    const wordCount = page.text.split(/\s+/).length;
    
    return {
      pageNumber: page.pageNumber,
      wordCount,
      armenianText: armenian.substring(0, 200), // First 200 chars
      keywords,
      hasAudio: false, // Will be marked during manual alignment
      estimatedTimestamp: null // Will be filled during training
    };
  });
  
  // Save page analysis
  const outputPath = path.join(OUTPUT_DIR, 'page-analysis.json');
  fs.writeFileSync(outputPath, JSON.stringify(pageData, null, 2));
  console.log(`✅ Saved page analysis to training-data/page-analysis.json`);
  
  return pageData;
}

function analyzeAudio() {
  console.log('\n🎵 Analyzing audio file...');
  
  const buffer = fs.readFileSync(WAV_PATH);
  
  // Parse WAV header
  const riff = buffer.toString('ascii', 0, 4);
  const wave = buffer.toString('ascii', 8, 12);
  
  if (riff !== 'RIFF' || wave !== 'WAVE') {
    throw new Error('Invalid WAV file');
  }
  
  let offset = 12;
  let audioInfo = null;
  
  while (offset < buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    
    if (chunkId === 'fmt ') {
      audioInfo = {
        sampleRate: buffer.readUInt32LE(offset + 12),
        channels: buffer.readUInt16LE(offset + 10),
        bitsPerSample: buffer.readUInt16LE(offset + 22),
        byteRate: buffer.readUInt32LE(offset + 16)
      };
    }
    
    offset += 8 + chunkSize;
  }
  
  if (!audioInfo) {
    throw new Error('Could not parse audio info');
  }
  
  const dataSize = buffer.length - 44;
  const durationSec = dataSize / audioInfo.byteRate;
  
  console.log(`✅ Audio: ${Math.floor(durationSec / 60)}:${Math.floor(durationSec % 60).toString().padStart(2, '0')}`);
  console.log(`   Sample rate: ${audioInfo.sampleRate} Hz`);
  console.log(`   Channels: ${audioInfo.channels}`);
  console.log(`   Bit depth: ${audioInfo.bitsPerSample}`);
  
  return { ...audioInfo, durationSec };
}

function createTrainingPlan(pageData, audioInfo) {
  console.log('\n📊 Creating training plan...');
  
  const totalPages = pageData.length;
  const durationSec = audioInfo.durationSec;
  const avgSecondsPerPage = durationSec / totalPages;
  
  console.log(`Total pages: ${totalPages}`);
  console.log(`Total duration: ${Math.floor(durationSec / 60)} minutes`);
  console.log(`Average per page: ${avgSecondsPerPage.toFixed(1)} seconds`);
  
  // Estimate timestamps for each page (will be refined later)
  const estimatedTimestamps = pageData.map((page, idx) => ({
    pageNumber: page.pageNumber,
    estimatedTimestamp: Math.floor(idx * avgSecondsPerPage),
    keywords: page.keywords,
    armenianPreview: page.armenianText.substring(0, 100)
  }));
  
  const planPath = path.join(OUTPUT_DIR, 'training-plan.json');
  fs.writeFileSync(planPath, JSON.stringify({
    totalPages,
    audioDuration: durationSec,
    avgSecondsPerPage,
    estimatedTimestamps
  }, null, 2));
  
  console.log(`✅ Saved training plan to training-data/training-plan.json`);
  
  return estimatedTimestamps;
}

function createManualAlignmentTemplate(plan) {
  console.log('\n📝 Creating manual alignment template...');
  
  const template = [
    '# Manual Page Alignment',
    '# Listen to the audio and mark when each page starts',
    '# Format: pageNumber,timestamp(seconds),confidence(0-1)',
    '',
    '# Example:',
    '# 1,0.0,1.0',
    '# 2,28.5,0.9',
    '# 3,55.2,0.95',
    '',
    ...plan.slice(0, 10).map(p => 
      `${p.pageNumber},${p.estimatedTimestamp},0.5  # Estimate - ${p.keywords.slice(0, 2).join(' ')}`
    ),
    '',
    '# ... continue for all 183 pages'
  ];
  
  const templatePath = path.join(OUTPUT_DIR, 'manual-alignment-template.csv');
  fs.writeFileSync(templatePath, template.join('\n'));
  console.log(`✅ Created manual alignment template`);
}

// Main execution
(async () => {
  try {
    const pageData = await analyzePages();
    const audioInfo = analyzeAudio();
    const plan = createTrainingPlan(pageData, audioInfo);
    createManualAlignmentTemplate(plan);
    
    console.log('\n✅ Training preparation complete!');
    console.log('\n📌 Next Steps:');
    console.log('1. Review training-data/page-analysis.json');
    console.log('2. Listen to full_service.wav and identify page turn moments');
    console.log('3. Fill in training-data/manual-alignment-template.csv');
    console.log('4. Run fingerprint extraction on aligned segments');
    console.log('\n💡 Tip: Look for distinctive phrases in the armenianText to help identify pages');
    
  } catch (error) {
    console.error('\n💥 Error:', error.message);
    process.exit(1);
  }
})();
