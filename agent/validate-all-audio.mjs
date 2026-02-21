#!/usr/bin/env node
/**
 * Audio Quality Validator - Standalone Script
 * Tests audio quality for all training files
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import the skill
const skillPath = join(__dirname, 'skills/liturgy-audio-controller/index.js');
const skill = require(skillPath);

// Mock context for standalone execution
const mockContext = {
  skillConfig: {},
  liturgyController: null
};

// Audio files to test
const audioFiles = [
  '/app/agent/full_service.wav',
  '/app/agent/training-audio/youtube-liturgy.wav',
  '/app/agent/training-audio/youtube-liturgy-2.wav'
];

console.log('🎧 AUDIO QUALITY VALIDATION REPORT');
console.log('═'.repeat(80));
console.log('');

// Find the validate_audio_quality tool
const validateTool = skill.tools.find(t => t.name === 'validate_audio_quality');

if (!validateTool) {
  console.error('❌ validate_audio_quality tool not found in skill!');
  process.exit(1);
}

// Test each file
for (const audioFile of audioFiles) {
  console.log(`📁 Testing: ${audioFile}`);
  console.log('─'.repeat(80));
  
  try {
    const result = await validateTool.handler({ audioFile }, mockContext);
    
    // Display results
    const emoji = {
      'EXCELLENT': '✅',
      'GOOD': '👍',
      'POOR': '⚠️',
      'UNUSABLE': '❌'
    }[result.quality] || '❓';
    
    console.log(`${emoji} Quality: ${result.quality}`);
    console.log(`📊 Recommendation: ${result.recommendation}`);
    
    if (result.success) {
      console.log(`   File Size: ${result.fileSizeMB} MB`);
      console.log(`   Sample Rate: ${result.sampleRate} Hz`);
      console.log(`   Duration: ${result.durationMinutes} minutes`);
      console.log(`   Channels: ${result.channels}`);
      console.log(`   Bitrate: ${result.bitrate} bps`);
      
      if (result.checks) {
        console.log('\n   Detailed Checks:');
        result.checks.forEach(check => {
          const statusEmoji = {
            'EXCELLENT': '✅',
            'GOOD': '👍',
            'POOR': '⚠️',
            'FAIL': '❌'
          }[check.status] || '❓';
          console.log(`   ${statusEmoji} ${check.check}: ${check.message}`);
        });
      }
      
      if (result.issues && result.issues.length > 0) {
        console.log('\n   Issues Found:');
        result.issues.forEach(issue => {
          console.log(`   ⚠️ ${issue}`);
        });
      }
    } else {
      console.log(`   ❌ Error: ${result.error || 'Unknown error'}`);
    }
    
  } catch (error) {
    console.log(`   ❌ Validation failed: ${error.message}`);
  }
  
  console.log('');
}

console.log('═'.repeat(80));
console.log('✅ Validation complete');
