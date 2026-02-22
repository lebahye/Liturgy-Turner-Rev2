#!/usr/bin/env node

/**
 * Test script: Start liturgy audio listening
 */

const path = require('path');
const fs = require('fs');

// Load the skill
const skillPath = path.join(__dirname, 'skills', 'liturgy-audio-controller', 'index.js');
const LiturgySkill = require(skillPath);

console.log('🎵 Starting Liturgy Audio Listener...\n');

// Create mock context for skill
const context = {
  skillConfig: {
    apiEndpoint: 'http://host.docker.internal:5000',
    confidenceThreshold: 0.85,
    language: 'armenian',
    sampleRate: 16000,
    bufferDuration: 3000,
    trainingMode: false,
  },
  openai: null, // Will need OpenAI API client
};

// Check if OpenAI API key is available
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ ERROR: OPENAI_API_KEY environment variable not set');
  console.error('   Whisper transcription requires OpenAI API access');
  process.exit(1);
}

// Create OpenAI client
const { OpenAI } = require('openai');
context.openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function main() {
  try {
    // Start listening
    console.log('📡 Calling start_liturgy_listening...\n');
    const startHandler = LiturgySkill.tools.find(t => t.name === 'start_liturgy_listening').handler;
    const result = await startHandler({}, context);
    
    console.log('Result:', result);
    
    if (result.success) {
      console.log('\n✅ LISTENING STARTED!');
      console.log('   Play the liturgy audio and watch pages turn automatically');
      console.log('   Press Ctrl+C to stop\n');
      
      // Keep alive
      process.on('SIGINT', async () => {
        console.log('\n\n🛑 Stopping listener...');
        const stopHandler = LiturgySkill.tools.find(t => t.name === 'stop_liturgy_listening').handler;
        await stopHandler({}, context);
        process.exit(0);
      });
      
      // Monitor status every 5 seconds
      setInterval(async () => {
        const statusHandler = LiturgySkill.tools.find(t => t.name === 'get_liturgy_status').handler;
        const status = await statusHandler({}, context);
        console.log(`[${new Date().toISOString()}] Page: ${status.currentPage || 'unknown'}, Buffer: ${status.bufferSizeBytes} bytes`);
      }, 5000);
      
    } else {
      console.error('❌ Failed to start listening:', result.message);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
