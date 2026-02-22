#!/usr/bin/env node

/**
 * Feed audio file to Armenian learner for live recognition
 * Simulates real-time playback
 */

import fs from 'fs';
import armenianLearner from './skills/armenian-learner/index.js';

const AUDIO_FILE = '/app/agent/full_service.wav';
const CHUNK_SIZE = 4096; // bytes per chunk
const SAMPLE_RATE = 44100; // Hz
const BYTES_PER_SAMPLE = 2; // 16-bit audio
const PLAYBACK_SPEED = 1.0; // 1.0 = real-time, 2.0 = 2x speed

console.log('📖 Starting Audio File Playback Recognition\n');

// Start recognition with page-turn callback
console.log('🎵 Starting recognition engine...');

// Define callback to turn pages
const onPageDetected = async (page, confidence) => {
  console.log(`\n🔔 PAGE DETECTED: ${page} (confidence: ${(confidence * 100).toFixed(1)}%)`);
  
  try {
    // Call Liturgy Turner API to set page
    const response = await fetch('http://host.docker.internal:5000/api/control/page/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page: page,
        reason: 'audio_recognition',
        confidence: confidence
      })
    });
    
    if (response.ok) {
      console.log(`✅ Page turned to ${page}\n`);
    } else {
      console.log(`❌ Failed to turn page: ${response.status}`);
    }
  } catch (error) {
    console.log(`❌ Error turning page: ${error.message}`);
  }
};

const startResult = await armenianLearner.tools.start_armenian_recognition.execute({ onPageDetected });

if (!startResult.success) {
  console.error('❌ Failed to start recognition:', startResult.message);
  process.exit(1);
}

console.log('✅ Recognition engine started\n');

// Open audio file
console.log(`🎧 Loading audio: ${AUDIO_FILE}`);
const fileStats = fs.statSync(AUDIO_FILE);
console.log(`   Size: ${(fileStats.size / 1024 / 1024).toFixed(1)} MB\n`);

// Read WAV header (skip first 44 bytes)
const fd = fs.openSync(AUDIO_FILE, 'r');
const header = Buffer.alloc(44);
fs.readSync(fd, header, 0, 44, 0);

// Calculate timing
const samplesPerChunk = CHUNK_SIZE / BYTES_PER_SAMPLE;
const chunkDurationMs = (samplesPerChunk / SAMPLE_RATE) * 1000 / PLAYBACK_SPEED;

console.log(`⏱️  Chunk size: ${CHUNK_SIZE} bytes = ${chunkDurationMs.toFixed(1)}ms`);
console.log(`🎼 Playback speed: ${PLAYBACK_SPEED}x\n`);
console.log('▶️  Playing audio...\n');

let position = 44; // After WAV header
let chunkCount = 0;
let totalBytes = fileStats.size - 44;
let processedBytes = 0;

// Feed audio in chunks
const feedChunk = () => {
  if (position >= fileStats.size) {
    console.log('\n\n✅ Audio file complete!');
    fs.closeSync(fd);
    setTimeout(() => {
      console.log('🛑 Stopping recognition...');
      armenianLearner.tools.stop_armenian.execute();
      process.exit(0);
    }, 2000);
    return;
  }
  
  // Read chunk
  const chunk = Buffer.alloc(CHUNK_SIZE);
  const bytesRead = fs.readSync(fd, chunk, 0, CHUNK_SIZE, position);
  
  if (bytesRead > 0) {
    // Convert to float array (assuming 16-bit PCM)
    const floatChunk = [];
    for (let i = 0; i < bytesRead; i += 2) {
      const sample = chunk.readInt16LE(i);
      floatChunk.push(sample / 32768.0); // Normalize to [-1, 1]
    }
    
    // Feed to recognizer
    armenianLearner.feedAudio(floatChunk);
    
    position += bytesRead;
    processedBytes += bytesRead;
    chunkCount++;
    
    // Progress update every 100 chunks
    if (chunkCount % 100 === 0) {
      const progress = (processedBytes / totalBytes * 100).toFixed(1);
      const elapsed = (chunkCount * chunkDurationMs / 1000).toFixed(0);
      console.log(`[${elapsed}s] ${progress}% - Chunk ${chunkCount}`);
    }
  }
  
  // Schedule next chunk
  setTimeout(feedChunk, chunkDurationMs);
};

// Start feeding
feedChunk();

// Monitor status
setInterval(async () => {
  const status = await armenianLearner.tools.get_armenian_status.execute();
  const diagnostics = await armenianLearner.tools.get_audio_diagnostics.execute();
  
  if (diagnostics.isReceiving) {
    console.log(`📄 Current page: ${status.currentPage || '?'} | Audio level: ${(diagnostics.recentPeak * 100).toFixed(1)}%`);
  }
}, 5000);

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n🛑 Stopping...');
  fs.closeSync(fd);
  armenianLearner.tools.stop_armenian.execute();
  process.exit(0);
});
