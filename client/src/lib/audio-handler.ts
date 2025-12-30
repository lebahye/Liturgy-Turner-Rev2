export class AudioHandler {
  mediaRecorder: MediaRecorder | null = null;
  audioContext: AudioContext | null = null;
  analyser: AnalyserNode | null = null;
  isRecording: boolean = false;

  async requestMicrophone() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return stream;
    } catch (error) {
      alert('Microphone access denied. Please allow microphone access to use this feature.');
      throw error;
    }
  }

  async startRecording() {
    const stream = await this.requestMicrophone();
    this.mediaRecorder = new MediaRecorder(stream);
    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(stream);
    this.analyser = this.audioContext.createAnalyser();
    source.connect(this.analyser);

    this.isRecording = true;
    this.mediaRecorder.start();
    return this.mediaRecorder;
  }

  stopRecording() {
    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
      this.isRecording = false;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  getAnalyser() {
    return this.analyser;
  }
}

export const audioHandler = new AudioHandler();
