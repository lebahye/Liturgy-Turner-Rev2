/**
 * Live Recognizer V2
 * 
 * Simplified approach using page-level matching instead of word patterns
 */

export class LiveRecognizerV2 {
  constructor(audioExtractor, pageMatcher) {
    this.audioExtractor = audioExtractor;
    this.pageMatcher = pageMatcher;
    this.isRunning = false;
    this.audioBuffer = [];
    this.bufferDuration = 5.0; // seconds
    this.sampleRate = 44100;
    this.maxBufferSamples = this.bufferDuration * this.sampleRate;
    this.onPageDetected = null;
    this.currentPage = null;
    this.lastTriggerTime = 0;
    this.minTimeBetweenTriggers = 2000; // ms - don't trigger too often
  }

  /**
   * Start live recognition
   * @param {Function} callback - Called when page is detected: (page, confidence) => {}
   */
  start(callback) {
    this.isRunning = true;
    this.onPageDetected = callback;
    this.audioBuffer = [];
    this.pageMatcher.reset();
    
    console.log('[live-recognizer-v2] Started, listening for audio...');
  }

  /**
   * Stop live recognition
   */
  stop() {
    this.isRunning = false;
    this.audioBuffer = [];
    this.currentPage = null;
    
    console.log('[live-recognizer-v2] Stopped');
  }

  /**
   * Feed audio data into the recognizer
   * @param {Float32Array} audioChunk - New audio samples
   */
  feedAudio(audioChunk) {
    if (!this.isRunning) {
      console.log('[live-recognizer-v2] ⚠️  Not running - ignoring audio');
      return;
    }
    
    // Validate input
    if (!audioChunk || audioChunk.length === 0) {
      console.warn('[live-recognizer-v2] ⚠️  Empty audio chunk received');
      return;
    }
    
    try {
      // Add to buffer
      this.audioBuffer.push(...audioChunk);
      
      // If buffer exceeds max size, remove oldest samples
      if (this.audioBuffer.length > this.maxBufferSamples) {
        const excess = this.audioBuffer.length - this.maxBufferSamples;
        this.audioBuffer.splice(0, excess);
      }
      
      // If we have enough audio, process it
      if (this.audioBuffer.length >= this.maxBufferSamples) {
        this.processBuffer();
      } else {
        // Log progress toward full buffer
        const percentFull = (this.audioBuffer.length / this.maxBufferSamples * 100).toFixed(0);
        if (this.audioBuffer.length % 22050 === 0) { // Log every 0.5s
          console.log(`[live-recognizer-v2] Buffer: ${percentFull}% full`);
        }
      }
    } catch (error) {
      console.error('[live-recognizer-v2] Error feeding audio:', error.message);
    }
  }

  /**
   * Process current audio buffer and predict page
   */
  processBuffer() {
    try {
      // Extract features from buffer
      const audioArray = new Float32Array(this.audioBuffer);
      const features = this.audioExtractor.extractSignature(audioArray, this.sampleRate);
      
      // Validate features
      if (!features || !features.mfcc) {
        console.error('[live-recognizer-v2] ⚠️  Invalid features extracted');
        return;
      }
      
      // Match against pages
      const result = this.pageMatcher.matchAudio(features);
      
      console.log(`[live-recognizer-v2] Best match: Page ${result.page} (confidence: ${(result.confidence * 100).toFixed(1)}%, triggerable: ${result.triggerable})`);
      console.log(`[live-recognizer-v2] Top 5: ${result.topMatches.map(m => `p${m.page}:${(m.score * 100).toFixed(0)}%`).join(', ')}`);
      
      // Should we trigger a page change?
      const now = Date.now();
      const enoughTimePassed = (now - this.lastTriggerTime) > this.minTimeBetweenTriggers;
      const pageChanged = result.page !== this.currentPage;
      
      if (result.triggerable && enoughTimePassed && pageChanged) {
        this.currentPage = result.page;
        this.lastTriggerTime = now;
        
        console.log(`[live-recognizer-v2] 🎯 TRIGGERED! Advancing to page ${result.page}`);
        
        if (this.onPageDetected) {
          try {
            this.onPageDetected(result.page, result.confidence);
          } catch (callbackError) {
            console.error('[live-recognizer-v2] Error in onPageDetected callback:', callbackError.message);
          }
        }
      } else if (!enoughTimePassed && result.page !== this.currentPage) {
        const waitTime = ((this.minTimeBetweenTriggers - (now - this.lastTriggerTime)) / 1000).toFixed(1);
        console.log(`[live-recognizer-v2] ⏱️  Page ${result.page} detected but waiting ${waitTime}s before trigger`);
      }
      
    } catch (error) {
      console.error('[live-recognizer-v2] Error processing buffer:', error.message);
      console.error('[live-recognizer-v2] Stack:', error.stack);
    }
  }

  /**
   * Set sensitivity threshold
   * @param {number} value - Sensitivity 0.0-1.0
   */
  setSensitivity(value) {
    this.pageMatcher.setSensitivity(value);
  }

  /**
   * Get current status
   * @returns {Object} Status info
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      bufferSize: this.audioBuffer.length,
      bufferDuration: (this.audioBuffer.length / this.sampleRate).toFixed(1),
      currentPage: this.currentPage,
      sensitivity: this.pageMatcher.sensitivity
    };
  }

  /**
   * Manually set current page (for training/context)
   * @param {number} page - Page number
   */
  setCurrentPage(page) {
    this.currentPage = page;
    console.log(`[live-recognizer-v2] Current page manually set to ${page}`);
  }
}
