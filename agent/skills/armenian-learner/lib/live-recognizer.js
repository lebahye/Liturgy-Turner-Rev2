/**
 * Live Recognizer
 * 
 * Listens to live audio and predicts pages using learned patterns
 */

export class LiveRecognizer {
  constructor(audioExtractor, patternDatabase) {
    this.audioExtractor = audioExtractor;
    this.patternDatabase = patternDatabase;
    this.isRunning = false;
    this.audioBuffer = [];
    this.bufferDuration = 5.0; // seconds
    this.sampleRate = 44100;
    this.maxBufferSamples = this.bufferDuration * this.sampleRate;
    this.onPageDetected = null;
    this.lastPredictions = []; // Track last 3 predictions for smoothing
    this.maxPredictionHistory = 3;
    this.sensitivity = 0.5; // Default 50% - can be adjusted (0.0 - 1.0)
  }

  /**
   * Start live recognition
   * @param {Function} callback - Called when page is detected: (page, confidence) => {}
   */
  start(callback) {
    this.isRunning = true;
    this.onPageDetected = callback;
    this.audioBuffer = [];
    this.lastPredictions = [];
    
    console.log('[live-recognizer] Started, listening for audio...');
  }

  /**
   * Stop live recognition
   */
  stop() {
    this.isRunning = false;
    this.audioBuffer = [];
    this.lastPredictions = [];
    
    console.log('[live-recognizer] Stopped');
  }

  /**
   * Feed audio data into the recognizer
   * @param {Float32Array} audioChunk - New audio samples
   */
  feedAudio(audioChunk) {
    if (!this.isRunning) return;
    
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
    }
  }

  /**
   * Process current audio buffer and predict page
   */
  processBuffer() {
    try {
      // Extract sound signature from buffer
      const audioArray = new Float32Array(this.audioBuffer);
      const signature = this.audioExtractor.extractSignature(audioArray, this.sampleRate);
      
      // Find matching patterns
      const matches = this.patternDatabase.findMatchingPatterns(signature, 10);
      
      if (matches.length === 0) {
        console.log('[live-recognizer] No matches found');
        return;
      }
      
      // Group matches by page and sum scores
      const pageScores = new Map();
      
      matches.forEach(match => {
        // Get page from learnedFrom
        const sources = match.pattern.learnedFrom || [];
        sources.forEach(source => {
          const page = source.page;
          const currentScore = pageScores.get(page) || 0;
          pageScores.set(page, currentScore + match.score);
        });
      });
      
      if (pageScores.size === 0) {
        console.log('[live-recognizer] No page candidates');
        return;
      }
      
      // Find best page
      let bestPage = null;
      let bestScore = 0;
      
      for (const [page, score] of pageScores.entries()) {
        if (score > bestScore) {
          bestScore = score;
          bestPage = page;
        }
      }
      
      // Add to prediction history
      this.lastPredictions.push({
        page: bestPage,
        score: bestScore,
        timestamp: Date.now()
      });
      
      // Keep only last N predictions
      if (this.lastPredictions.length > this.maxPredictionHistory) {
        this.lastPredictions.shift();
      }
      
      // Use majority vote from last predictions (temporal smoothing)
      const smoothedPage = this.getSmoothedPrediction();
      const confidence = Math.min(bestScore, 1.0);
      
      console.log(`[live-recognizer] Detected page ${smoothedPage} (confidence: ${confidence.toFixed(2)}, threshold: ${this.sensitivity.toFixed(2)})`);
      
      // Call callback if confidence is high enough
      if (this.onPageDetected && confidence > this.sensitivity) {
        this.onPageDetected(smoothedPage, confidence);
      }
      
    } catch (error) {
      console.error('[live-recognizer] Error processing buffer:', error.message);
    }
  }

  /**
   * Get smoothed prediction using temporal voting
   * @returns {number} Most likely page number
   */
  getSmoothedPrediction() {
    if (this.lastPredictions.length === 0) return null;
    
    // Count votes for each page
    const votes = new Map();
    
    this.lastPredictions.forEach(pred => {
      const count = votes.get(pred.page) || 0;
      votes.set(pred.page, count + 1);
    });
    
    // Find page with most votes
    let winnerPage = this.lastPredictions[this.lastPredictions.length - 1].page;
    let maxVotes = 0;
    
    for (const [page, count] of votes.entries()) {
      if (count > maxVotes) {
        maxVotes = count;
        winnerPage = page;
      }
    }
    
    return winnerPage;
  }

  /**
   * Learn from correction
   * @param {number} detectedPage - What we predicted
   * @param {number} actualPage - What it actually was
   * @param {Float32Array} audioContext - Recent audio
   */
  learnFromCorrection(detectedPage, actualPage, audioContext) {
    console.log(`[live-recognizer] Learning: detected p${detectedPage}, actually p${actualPage}`);
    
    try {
      // Extract signature from audio that led to wrong prediction
      const signature = this.audioExtractor.extractSignature(audioContext, this.sampleRate);
      
      // This audio should map to actualPage, not detectedPage
      // Add as new pattern with high confidence
      const correctionPattern = {
        armenianWord: `page_${actualPage}`, // Placeholder
        soundSignature: signature,
        confidence: 0.9, // High confidence from user correction
        learnedFrom: {
          page: actualPage,
          timestamp: Date.now(),
          source: 'correction'
        }
      };
      
      this.patternDatabase.addPattern(correctionPattern);
      this.patternDatabase.save();
      
      console.log('[live-recognizer] Pattern updated from correction');
      
    } catch (error) {
      console.error('[live-recognizer] Error learning from correction:', error.message);
    }
  }

  /**
   * Set sensitivity threshold (0.0 - 1.0)
   * Lower = more sensitive (triggers more easily)
   * Higher = less sensitive (requires higher confidence)
   * @param {number} value - Sensitivity 0.0 to 1.0
   */
  setSensitivity(value) {
    if (value < 0 || value > 1) {
      throw new Error('Sensitivity must be between 0.0 and 1.0');
    }
    this.sensitivity = value;
    console.log(`[live-recognizer] Sensitivity set to ${(value * 100).toFixed(0)}%`);
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
      recentPredictions: this.lastPredictions.slice(-5),
      patternsAvailable: this.patternDatabase.patterns.length,
      sensitivity: this.sensitivity
    };
  }
}
