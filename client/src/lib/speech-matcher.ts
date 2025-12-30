interface PageTranscript {
  pageNumber: number;
  transcript: string;
  keywords: string[] | null;
  // Optional stable identifiers
  pageId?: string | null;
}

interface MatchResult {
  matchedPage: number;
  confidence: number;
  matchedWords: number;
  totalWords: number;
  windowIndex?: number;
}

interface PageWindow {
  pageNumber: number;
  windowIndex: number;
  words: string[];
  startOffset: number;
}

/**
 * SpeechMatcher (Live Mode)
 *
 * Goal: make page turning resilient to timing drift.
 * Approach:
 *  - Rolling transcription (short chunks)
 *  - Sliding-window text matching with IDF weighting (downweights repeated/common phrases)
 *  - Sequential constraint: mostly stay, advance +1..+3 (resync can jump further)
 *  - Debounce: requires repeated evidence before turning
 */
export class SpeechMatcher {
  private transcripts: PageTranscript[] = [];
  private pageWindows: PageWindow[] = [];
  private currentPage: number = 1;
  private currentWindowIndex: number = 0;

  // Rolling transcript buffer (recent chunks)
  private recentTranscripts: Array<{ t: number; text: string }> = [];
  private recentWindowMs = 12_000;

  private pdfPath: string = '';
  private pdfId: string | null = null;

  private lastTurnTime = 0;
  private minTimeBetweenTurns = 2500;
  private isReady = false;

  private mediaRecorder: MediaRecorder | null = null;
  private chunkIntervalMs = 2200;
  private isRecording = false;

  private onPageChange: ((page: number, confidence: number) => void) | null = null;
  private onTranscriptUpdate: ((text: string) => void) | null = null;
  private onPositionUpdate: ((page: number, windowIndex: number, totalWindows: number) => void) | null = null;

  private windowSize = 14;
  private windowSlide = 7;

  // IDF weighting to downweight common phrases
  private dfByWord = new Map<string, number>();
  private totalWindows = 0;

  // Debounce / stability
  private lastCandidatePage: number = 1;
  private candidateStreak = 0;

  // Resync logic
  private lastGoodMatchAt = 0;
  private resyncAfterMs = 15_000;

  async loadTranscripts(pdfPath: string, pdfId?: string | null): Promise<boolean> {
    try {
      this.pdfPath = pdfPath;
      this.pdfId = pdfId || null;

      const qs = this.pdfId
        ? `pdfId=${encodeURIComponent(this.pdfId)}`
        : `pdfPath=${encodeURIComponent(pdfPath)}`;

      const response = await fetch(`/api/page-transcripts?${qs}`);
      const data = await response.json();

      if (data.transcripts && data.transcripts.length > 0) {
        this.transcripts = data.transcripts.map((t: any) => ({
          pageNumber: t.pageNumber,
          transcript: t.transcript,
          keywords: t.keywords,
          pageId: t.pageId ?? null,
        }));

        this.buildSlidingWindows();
        console.log(`SpeechMatcher: Loaded ${this.transcripts.length} pages with ${this.pageWindows.length} windows`);
        this.isReady = true;
        return true;
      }

      this.isReady = false;
      return false;
    } catch (error) {
      console.error('Failed to load transcripts:', error);
      this.isReady = false;
      return false;
    }
  }

  private buildSlidingWindows(): void {
    this.pageWindows = [];
    this.dfByWord.clear();

    for (const transcript of this.transcripts) {
      const words = this.normalizeText(transcript.transcript).split(/\s+/).filter(w => w.length > 2);

      const pushWindow = (pageNumber: number, windowIndex: number, windowWords: string[], startOffset: number) => {
        // document frequency update (unique words per window)
        const uniq = new Set(windowWords);
        for (const w of uniq) {
          this.dfByWord.set(w, (this.dfByWord.get(w) || 0) + 1);
        }

        this.pageWindows.push({
          pageNumber,
          windowIndex,
          words: windowWords,
          startOffset,
        });
      };

      if (words.length <= this.windowSize) {
        pushWindow(transcript.pageNumber, 0, words, 0);
      } else {
        let windowIndex = 0;
        for (let i = 0; i < words.length; i += this.windowSlide) {
          const windowWords = words.slice(i, i + this.windowSize);
          if (windowWords.length >= 4) {
            pushWindow(transcript.pageNumber, windowIndex, windowWords, i);
            windowIndex++;
          }
        }
      }
    }

    this.totalWindows = this.pageWindows.length;
  }

  getWindowsForPage(pageNumber: number): number {
    return this.pageWindows.filter(w => w.pageNumber === pageNumber).length;
  }

  hasTranscripts(): boolean {
    return this.transcripts.length > 0;
  }

  getTranscriptCount(): number {
    return this.transcripts.length;
  }

  setCallbacks(
    onPageChange: (page: number, confidence: number) => void,
    onTranscriptUpdate: (text: string) => void,
    onPositionUpdate?: (page: number, windowIndex: number, totalWindows: number) => void
  ) {
    this.onPageChange = onPageChange;
    this.onTranscriptUpdate = onTranscriptUpdate;
    if (onPositionUpdate) this.onPositionUpdate = onPositionUpdate;
  }

  async start(stream: MediaStream): Promise<void> {
    if (!this.isReady || this.transcripts.length === 0) {
      throw new Error('No transcripts loaded');
    }

    this.currentPage = 1;
    this.currentWindowIndex = 0;
    this.recentTranscripts = [];
    this.isRecording = true;
    this.lastTurnTime = Date.now();
    this.lastGoodMatchAt = Date.now();
    this.lastCandidatePage = 1;
    this.candidateStreak = 0;

    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
    this.mediaRecorder = new MediaRecorder(stream, { mimeType });

    this.mediaRecorder.ondataavailable = async (event) => {
      if (event.data.size > 0 && this.isRecording) {
        await this.processAudioChunk(event.data);
      }
    };

    this.mediaRecorder.start(this.chunkIntervalMs);
    console.log('SpeechMatcher: Started recording');
  }

  stop(): void {
    this.isRecording = false;
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;
    this.recentTranscripts = [];
    console.log('SpeechMatcher: Stopped');
  }

  private async processAudioChunk(audioBlob: Blob): Promise<void> {
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64,
          mimeType: audioBlob.type,
        }),
      });

      const data = await response.json();
      const transcript: string = data.transcript;

      if (!transcript || transcript === '[silence]' || transcript === '[error]') {
        return;
      }

      const now = Date.now();
      this.recentTranscripts.push({ t: now, text: transcript });
      this.recentTranscripts = this.recentTranscripts.filter(x => now - x.t <= this.recentWindowMs);

      if (this.onTranscriptUpdate) this.onTranscriptUpdate(transcript);

      const combinedText = this.recentTranscripts.map(x => x.text).join(' ');

      // If we haven't had a confident match recently, expand search for resync.
      const resyncMode = now - this.lastGoodMatchAt >= this.resyncAfterMs;

      const matchResult = this.matchTextWithWindows(combinedText, resyncMode);

      if (matchResult.confidence >= 55) {
        this.lastGoodMatchAt = now;
      }

      // Position updates (same page, later window)
      if (
        matchResult.windowIndex !== undefined &&
        matchResult.matchedPage === this.currentPage &&
        matchResult.windowIndex > this.currentWindowIndex &&
        matchResult.confidence > 45
      ) {
        this.currentWindowIndex = matchResult.windowIndex;
        const totalWindows = this.getWindowsForPage(this.currentPage);
        if (this.onPositionUpdate) {
          this.onPositionUpdate(this.currentPage, this.currentWindowIndex, totalWindows);
        }
      }

      // Candidate page turn logic
      const candidatePage = matchResult.matchedPage;
      const timeSinceLastTurn = now - this.lastTurnTime;

      const maxStep = resyncMode ? 12 : 3;
      const withinForwardRange = candidatePage > this.currentPage && candidatePage <= this.currentPage + maxStep;

      if (withinForwardRange) {
        if (candidatePage === this.lastCandidatePage) {
          this.candidateStreak++;
        } else {
          this.lastCandidatePage = candidatePage;
          this.candidateStreak = 1;
        }

        // Require stronger evidence for bigger jumps
        const requiredStreak = candidatePage === this.currentPage + 1 ? 2 : 3;
        const requiredConfidence = candidatePage === this.currentPage + 1 ? 55 : 65;

        if (
          matchResult.confidence >= requiredConfidence &&
          this.candidateStreak >= requiredStreak &&
          timeSinceLastTurn >= this.minTimeBetweenTurns
        ) {
          console.log(
            `SpeechMatcher: Page turn ${this.currentPage} -> ${candidatePage} (${matchResult.confidence.toFixed(0)}%, streak=${this.candidateStreak}, resync=${resyncMode})`
          );

          this.currentPage = candidatePage;
          this.currentWindowIndex = matchResult.windowIndex || 0;
          this.lastTurnTime = now;
          this.candidateStreak = 0;

          if (this.onPageChange) this.onPageChange(candidatePage, matchResult.confidence);
        }
      } else {
        // reset streak when evidence isn't forward-consistent
        if (candidatePage !== this.currentPage) {
          this.candidateStreak = 0;
          this.lastCandidatePage = candidatePage;
        }
      }
    } catch (error) {
      console.error('Failed to process audio chunk:', error);
    }
  }

  private matchTextWithWindows(liveText: string, resyncMode: boolean): MatchResult {
    if (!liveText || this.pageWindows.length === 0) {
      return { matchedPage: this.currentPage, confidence: 0, matchedWords: 0, totalWords: 0 };
    }

    const liveWords = this.normalizeText(liveText).split(/\s+/).filter(w => w.length > 2);

    const best: MatchResult = {
      matchedPage: this.currentPage,
      confidence: 0,
      matchedWords: 0,
      totalWords: liveWords.length,
      windowIndex: this.currentWindowIndex,
    };

    const pageMax = resyncMode ? this.currentPage + 12 : this.currentPage + 3;

    const relevantWindows = this.pageWindows.filter(w => {
      if (w.pageNumber < this.currentPage) return false;
      if (w.pageNumber > pageMax) return false;
      if (w.pageNumber === this.currentPage) return w.windowIndex >= this.currentWindowIndex;
      return true;
    });

    const totalLiveWeight = liveWords.reduce((sum, w) => sum + this.idf(w), 0) || 1;

    for (const window of relevantWindows) {
      let matchedWords = 0;
      let matchedWeight = 0;

      for (const lw of liveWords) {
        for (const ww of window.words) {
          if (this.wordsMatch(lw, ww)) {
            matchedWords++;
            matchedWeight += this.idf(lw);
            break;
          }
        }
      }

      // IDF-weighted overlap score
      const score = (matchedWeight / totalLiveWeight) * 100;

      // small bias towards earlier pages to avoid skipping
      const pageBias = window.pageNumber === this.currentPage + 1 ? 0.5 : window.pageNumber === this.currentPage ? 0.8 : 1.0;
      const adjusted = score * pageBias;

      if (adjusted > best.confidence) {
        best.matchedPage = window.pageNumber;
        best.confidence = adjusted;
        best.matchedWords = matchedWords;
        best.totalWords = liveWords.length;
        best.windowIndex = window.windowIndex;
      }
    }

    return best;
  }

  private idf(word: string): number {
    const df = this.dfByWord.get(word) || 0;
    // Smooth IDF, always >= 1
    return Math.log((this.totalWindows + 1) / (df + 1)) + 1;
  }

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-zA-Z\u0531-\u0587\u0561-\u0587\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private wordsMatch(word1: string, word2: string): boolean {
    if (word1 === word2) return true;
    if (word1.includes(word2) || word2.includes(word1)) return true;
    if (this.levenshteinDistance(word1, word2) <= 2) return true;
    return false;
  }

  private levenshteinDistance(s1: string, s2: string): number {
    const len1 = s1.length;
    const len2 = s2.length;

    if (len1 === 0) return len2;
    if (len2 === 0) return len1;

    const matrix: number[][] = [];

    for (let i = 0; i <= len1; i++) matrix[i] = [i];
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    return matrix[len1][len2];
  }

  getCurrentPage(): number {
    return this.currentPage;
  }

  setCurrentPage(page: number): void {
    this.currentPage = page;
    this.currentWindowIndex = 0;
    this.lastCandidatePage = page;
    this.candidateStreak = 0;
  }
}

export const speechMatcher = new SpeechMatcher();
