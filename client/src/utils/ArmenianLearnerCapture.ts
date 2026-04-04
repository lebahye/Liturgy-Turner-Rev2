/**
 * Armenian Learner Audio Capture
 * Sends audio to backend V2 Page Matcher for server-side processing
 */

export class ArmenianLearnerCapture {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private isCapturing = false;
  private chunksSent = 0;
  private lastDiagnostics: any = null;

  /**
   * Callback for when page is detected by backend
   */
  onPageDetected?: (page: number, confidence: number) => void;

  /**
   * Start capturing audio from microphone
   */
  async start(): Promise<{ success: boolean; error?: any }> {
    try {
      console.log('[ArmenianLearner] Starting backend audio processing...');

      // Get microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 44100,
        },
      });

      // Create audio context
      this.audioContext = new AudioContext({ sampleRate: 44100 });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Create processor (4096 samples = ~93ms at 44100 Hz)
      this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

      // Process audio chunks
      this.scriptProcessor.onaudioprocess = (e) => {
        if (!this.isCapturing) return;
        const audioData = e.inputBuffer.getChannelData(0);
        this.sendAudioChunk(audioData);
      };

      // Connect nodes
      source.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);

      this.isCapturing = true;

      // Tell backend to start recognition - FIXED: use new API
      await fetch('/api/agent/start-recognition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startPage: 1 }),
      });

      console.log('[ArmenianLearner] Started successfully');
      return { success: true };
    } catch (error) {
      console.error('[ArmenianLearner] Error:', error);
      return { success: false, error };
    }
  }

  /**
   * Stop capturing
   */
  stop() {
    console.log('[ArmenianLearner] Stopping...');
    this.isCapturing = false;

    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    // Tell backend to stop - FIXED: use new API
    fetch('/api/agent/stop-recognition', { method: 'POST' }).catch(() => {});

    console.log('[ArmenianLearner] Stopped');
  }

  /**
   * Send audio chunk to backend V2 Page Matcher
   * FIXED: Proper base64 conversion for large audio chunks
   */
  private async sendAudioChunk(audioData: Float32Array) {
    try {
      // Convert Float32Array to 16-bit PCM for better compatibility
      const pcmData = new Int16Array(audioData.length);
      for (let i = 0; i < audioData.length; i++) {
        // Convert from [-1,1] float to [-32768,32767] int16
        const sample = Math.max(-1, Math.min(1, audioData[i]));
        pcmData[i] = sample < 0 ? sample * 32768 : sample * 32767;
      }

      // Convert to Uint8Array bytes and encode efficiently
      const pcmBytes = new Uint8Array(pcmData.buffer);
      const base64 = this.arrayBufferToBase64(pcmBytes.buffer);

      // FIXED: Send to new agent API endpoint
      const response = await fetch('/api/agent/feed-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: `data:audio/pcm;base64,${base64}`,
        }),
      });

      this.chunksSent++;

      if (this.chunksSent % 20 === 0) {
        console.log(`[ArmenianLearner] Sent ${this.chunksSent} chunks (${pcmBytes.length} bytes each)`);
      }

      const result = await response.json();
      
      // Store diagnostics
      if (result.diagnostics) {
        this.lastDiagnostics = result.diagnostics;
      }

      // If page was detected, emit callback
      if (result.result?.pageDetected && this.onPageDetected) {
        this.onPageDetected(result.result.page, result.result.confidence);
      }
    } catch (error) {
      console.error('[ArmenianLearner] Error sending chunk:', error);
    }
  }

  /**
   * Efficient base64 encoding for large ArrayBuffers
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    // Use chunked approach to avoid call stack limits on large arrays
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 8192; // Process in 8KB chunks
    
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    
    return btoa(binary);
  }

  /**
   * Set current page manually (tells backend where we are)
   */
  async setCurrentPage(page: number) {
    try {
      // FIXED: No direct setPage API in new agent system
      // Instead, we can stop and restart recognition at the new page
      await fetch('/api/agent/stop-recognition', { method: 'POST' });
      await fetch('/api/agent/start-recognition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startPage: page }),
      });
      console.log(`[ArmenianLearner] Set current page to ${page}`);
    } catch (error) {
      console.error('[ArmenianLearner] Error setting page:', error);
    }
  }

  /**
   * Set sensitivity threshold (0.0 - 1.0)
   */
  async setSensitivity(sensitivity: number) {
    try {
      // FIXED: No direct sensitivity API - log for now
      console.log(`[ArmenianLearner] Sensitivity setting (${(sensitivity * 100).toFixed(0)}%) - agent uses fixed threshold`);
      // The agent uses a fixed threshold configured in its settings
    } catch (error) {
      console.error('[ArmenianLearner] Error setting sensitivity:', error);
    }
  }

  /**
   * Get diagnostics from backend
   */
  async getDiagnostics() {
    try {
      // FIXED: Use new agent status API
      const response = await fetch('/api/agent/status');
      const data = await response.json();
      this.lastDiagnostics = data.status;
      return data.status;
    } catch (error) {
      console.error('[ArmenianLearner] Error getting diagnostics:', error);
      return null;
    }
  }

  /**
   * Get last cached diagnostics (without making a request)
   */
  getLastDiagnostics() {
    return this.lastDiagnostics;
  }
}
