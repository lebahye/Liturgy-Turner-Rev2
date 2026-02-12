#!/usr/bin/env node
/**
 * Liturgy Training Script
 * Analyzes PDF and WAV files to build page-turning database
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');
const pdfParse = PDFParse;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PDF_PATH = path.join(__dirname, 'liturgy.pdf');
const WAV_PATH = path.join(__dirname, 'full_service.wav');

console.log('🎼 Armenian Liturgy Training System');
console.log('=====================================\n');

// Check files exist
console.log('📁 Checking files...');
const pdfExists = fs.existsSync(PDF_PATH);
const wavExists = fs.existsSync(WAV_PATH);

console.log(`PDF: ${pdfExists ? '✅' : '❌'} ${PDF_PATH}`);
console.log(`WAV: ${wavExists ? '✅' : '❌'} ${WAV_PATH}`);

if (!pdfExists || !wavExists) {
  console.error('\n❌ Missing required files!');
  process.exit(1);
}

// Get file stats
const pdfStats = fs.statSync(PDF_PATH);
const wavStats = fs.statSync(WAV_PATH);

console.log(`\n📊 File Stats:`);
console.log(`  PDF: ${(pdfStats.size / 1024 / 1024).toFixed(2)} MB`);
console.log(`  WAV: ${(wavStats.size / 1024 / 1024).toFixed(2)} MB`);

console.log('\n🔍 Phase 1: PDF Analysis');
console.log('------------------------');

async function analyzePDF() {
  try {
    const dataBuffer = fs.readFileSync(PDF_PATH);
    console.log('Parsing PDF...');
    
    const parser = new pdfParse({ data: dataBuffer });
    const result = await parser.getText();
    await parser.destroy();
    
    console.log(`✅ PDF parsed successfully`);
    console.log(`   Pages: ${result.numPages}`);
    console.log(`   Text length: ${result.text.length} characters`);
    
    // Save raw text for analysis
    const outputPath = path.join(__dirname, 'liturgy-extracted.txt');
    fs.writeFileSync(outputPath, result.text, 'utf8');
    console.log(`   Saved text to: liturgy-extracted.txt`);
    
    return {
      pages: result.numPages,
      text: result.text,
      info: result.info || {}
    };
  } catch (error) {
    console.error('❌ PDF parsing failed:', error.message);
    throw error;
  }
}

console.log('\n🎵 Phase 2: Audio Analysis');
console.log('--------------------------');

async function analyzeAudio() {
  try {
    // Read WAV header to get basic info
    const buffer = fs.readFileSync(WAV_PATH);
    
    // Simple WAV header parsing
    const riff = buffer.toString('ascii', 0, 4);
    const wave = buffer.toString('ascii', 8, 12);
    
    if (riff !== 'RIFF' || wave !== 'WAVE') {
      throw new Error('Invalid WAV file format');
    }
    
    // Find fmt chunk
    let offset = 12;
    while (offset < buffer.length) {
      const chunkId = buffer.toString('ascii', offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);
      
      if (chunkId === 'fmt ') {
        const audioFormat = buffer.readUInt16LE(offset + 8);
        const numChannels = buffer.readUInt16LE(offset + 10);
        const sampleRate = buffer.readUInt32LE(offset + 12);
        const byteRate = buffer.readUInt32LE(offset + 16);
        const blockAlign = buffer.readUInt16LE(offset + 20);
        const bitsPerSample = buffer.readUInt16LE(offset + 22);
        
        console.log('✅ WAV file analyzed');
        console.log(`   Format: ${audioFormat === 1 ? 'PCM' : 'Unknown'}`);
        console.log(`   Channels: ${numChannels}`);
        console.log(`   Sample rate: ${sampleRate} Hz`);
        console.log(`   Bit depth: ${bitsPerSample} bits`);
        console.log(`   Byte rate: ${(byteRate / 1024).toFixed(2)} KB/s`);
        
        // Estimate duration
        const dataSize = buffer.length - 44; // Rough estimate
        const durationSec = dataSize / byteRate;
        const minutes = Math.floor(durationSec / 60);
        const seconds = Math.floor(durationSec % 60);
        
        console.log(`   Duration: ~${minutes}:${seconds.toString().padStart(2, '0')}`);
        
        return {
          sampleRate,
          channels: numChannels,
          bitsPerSample,
          durationSec
        };
      }
      
      offset += 8 + chunkSize;
    }
    
    throw new Error('fmt chunk not found');
  } catch (error) {
    console.error('❌ Audio analysis failed:', error.message);
    throw error;
  }
}

// Main execution
(async () => {
  try {
    const pdfData = await analyzePDF();
    const audioData = await analyzeAudio();
    
    console.log('\n📝 Summary');
    console.log('==========');
    console.log(`PDF pages: ${pdfData.pages}`);
    console.log(`Audio duration: ${Math.floor(audioData.durationSec / 60)} minutes`);
    console.log(`Average time per page: ${(audioData.durationSec / pdfData.pages).toFixed(1)} seconds`);
    
    console.log('\n✅ Initial analysis complete!');
    console.log('\n📌 Next Steps:');
    console.log('1. Review liturgy-extracted.txt for page boundaries');
    console.log('2. Manually mark key page turn moments in the audio');
    console.log('3. Run fingerprint extraction on marked segments');
    console.log('4. Build the correlation database');
    
  } catch (error) {
    console.error('\n💥 Training failed:', error);
    process.exit(1);
  }
})();
