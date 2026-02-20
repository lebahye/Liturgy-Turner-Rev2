/**
 * Audio Diagnostics
 * Helper to check if audio is being received and processed correctly
 */

export class AudioDiagnostics {
  constructor() {
    this.chunksReceived = 0;
    this.totalSamples = 0;
    this.lastChunkTime = null;
    this.chunkSizes = [];
    this.maxChunkHistory = 10;
  }

  /**
   * Record an incoming audio chunk
   */
  recordChunk(audioChunk) {
    this.chunksReceived++;
    this.totalSamples += audioChunk.length;
    this.lastChunkTime = Date.now();
    
    this.chunkSizes.push(audioChunk.length);
    if (this.chunkSizes.length > this.maxChunkHistory) {
      this.chunkSizes.shift();
    }
  }

  /**
   * Get diagnostic report
   */
  getReport() {
    const now = Date.now();
    const timeSinceLastChunk = this.lastChunkTime ? (now - this.lastChunkTime) / 1000 : null;
    
    const avgChunkSize = this.chunkSizes.length > 0
      ? this.chunkSizes.reduce((a, b) => a + b, 0) / this.chunkSizes.length
      : 0;
    
    const totalDuration = (this.totalSamples / 44100).toFixed(1);
    
    return {
      chunksReceived: this.chunksReceived,
      totalSamples: this.totalSamples,
      totalDurationSeconds: parseFloat(totalDuration),
      lastChunkSecondsAgo: timeSinceLastChunk ? timeSinceLastChunk.toFixed(1) : 'never',
      avgChunkSize: Math.round(avgChunkSize),
      isReceivingAudio: timeSinceLastChunk !== null && timeSinceLastChunk < 5,
      recentChunkSizes: this.chunkSizes
    };
  }

  /**
   * Reset diagnostics
   */
  reset() {
    this.chunksReceived = 0;
    this.totalSamples = 0;
    this.lastChunkTime = null;
    this.chunkSizes = [];
  }

  /**
   * Check if audio stream is healthy
   */
  isHealthy() {
    if (!this.lastChunkTime) return false;
    
    const timeSinceLastChunk = (Date.now() - this.lastChunkTime) / 1000;
    return timeSinceLastChunk < 5; // Should receive chunks every ~1s
  }
}
