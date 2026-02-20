/**
 * Armenian Learner Audio Capture
 * 
 * COPY THIS FILE TO YOUR FRONTEND:
 * cp /app/agent/ArmenianLearnerAudioCapture.ts ~/Liturgy-Turner-Rev2/frontend/src/utils/
 * 
 * Then import in your Live Mode component:
 * import { ArmenianLearnerAudioCapture } from './utils/ArmenianLearnerAudioCapture';
 */

export class ArmenianLearnerAudioCapture {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private isCapturing = false;
  private chunksSent = 0;

  /**
   * Start capturing audio from microphone
   */
  async start() {
    try {
      console.log('[AudioCapture] Starting...');

      // Get microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 44100
        }
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

      // Tell backend to start recognition
      await fetch('/api/armenian-learner/start-recognition', {
        method: 'POST'
      });

      console.log('[AudioCapture] Started successfully');
      return { success: true };

    } catch (error) {
      console.error('[AudioCapture] Error:', error);
      return { success: false, error };
    }
  }

  /**
   * Stop capturing
   */
  stop() {
    console.log('[AudioCapture] Stopping...');
    this.isCapturing = false;

    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    // Tell backend to stop
    fetch('/api/armenian-learner/stop', { method: 'POST' });

    console.log('[AudioCapture] Stopped');
  }

  /**
   * Send audio chunk to backend
   */
  private async sendAudioChunk(audioData: Float32Array) {
    try {
      // Convert Float32Array to base64
      const buffer = new ArrayBuffer(audioData.length * 4);
      const view = new Float32Array(buffer);
      view.set(audioData);
      
      const uint8Array = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      const base64 = btoa(binary);

      // Send to backend
      const response = await fetch('/api/armenian-learner/audio-chunk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioData: base64,
          sampleRate: 44100
        })
      });

      this.chunksSent++;

      if (this.chunksSent % 10 === 0) {
        console.log(`[AudioCapture] Sent ${this.chunksSent} chunks`);
      }

      const result = await response.json();
      
      // If page was detected, emit event or callback
      if (result.currentPage) {
        this.onPageDetected?.(result.currentPage, result.confidence);
      }

    } catch (error) {
      console.error('[AudioCapture] Error sending chunk:', error);
    }
  }

  /**
   * Set current page manually
   */
  async setCurrentPage(page: number) {
    try {
      await fetch('/api/armenian-learner/set-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page })
      });
      console.log(`[AudioCapture] Set current page to ${page}`);
    } catch (error) {
      console.error('[AudioCapture] Error setting page:', error);
    }
  }

  /**
   * Set sensitivity (0.0 - 1.0)
   */
  async setSensitivity(sensitivity: number) {
    try {
      await fetch('/api/armenian-learner/set-sensitivity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sensitivity })
      });
      console.log(`[AudioCapture] Set sensitivity to ${(sensitivity * 100).toFixed(0)}%`);
    } catch (error) {
      console.error('[AudioCapture] Error setting sensitivity:', error);
    }
  }

  /**
   * Get diagnostics
   */
  async getDiagnostics() {
    try {
      const response = await fetch('/api/armenian-learner/diagnostics');
      return await response.json();
    } catch (error) {
      console.error('[AudioCapture] Error getting diagnostics:', error);
      return null;
    }
  }

  /**
   * Callback for when page is detected
   */
  onPageDetected?: (page: number, confidence: number) => void;
}
