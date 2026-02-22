#!/usr/bin/env node

/**
 * Start live Armenian liturgy recognition
 * Uses the learned patterns from armenian-learner skill
 */

import armenianLearner from './skills/armenian-learner/index.js';

console.log('📖 Starting Live Armenian Liturgy Recognition\n');

// Start recognition
console.log('🎵 Starting audio recognition...\n');

try {
  const result = await armenianLearner.tools.start_armenian_recognition.execute({});
  
  if (result.success) {
    console.log('✅ RECOGNITION STARTED!');
    console.log(`   Using V3 Hybrid System:`);
    console.log(`   - Word recognition (1,366 learned patterns)`);
    console.log(`   - Page-level audio matching`);
    console.log(`   - Sequential temporal context`);
    console.log(`\n🎧 Play the liturgy audio now...\n`);
    
    // Monitor status
    setInterval(async () => {
      const status = await armenianLearner.tools.get_armenian_status.execute();
      const diagnostics = await armenianLearner.tools.get_audio_diagnostics.execute();
      
      const peak = diagnostics.recentPeak || 0;
      console.log(`[${new Date().toISOString().substr(11, 8)}] Page: ${status.currentPage || '?'} | Audio: ${diagnostics.isReceiving ? '✅' : '❌'} ${peak.toFixed(3)}`);
    }, 3000);
    
    // Handle Ctrl+C
    process.on('SIGINT', async () => {
      console.log('\n\n🛑 Stopping recognition...');
      await armenianLearner.tools.stop_armenian.execute();
      console.log('✅ Stopped');
      process.exit(0);
    });
    
  } else {
    console.error('❌ Failed to start recognition:', result.message);
    process.exit(1);
  }
  
} catch (error) {
  console.error('❌ ERROR:', error.message);
  console.error(error.stack);
  process.exit(1);
}
