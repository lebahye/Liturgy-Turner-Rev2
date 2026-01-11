import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { Document, Page, pdfjs } from "react-pdf";
import { createPageMatcher, PdfPageText, DictEntry, MatcherConfig } from "@/lib/pageMatching";
import { createAudioAnalyzer, AudioFeatures, compareFeatures, MeydaAnalyzer } from "@/lib/audio-features";
import { PageMatchCoordinator, CoordinatorDecision, TriggerData } from "@/lib/pageMatchCoordinator";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type AudioSource = "mic" | "file";

const MATCHER_CONFIG: MatcherConfig = {
  ngramSize: 2,
  minNgramMatches: 1,
  matchMode: "phonetic", // Match against phonetic text on pages
};

const WINDOW_SECONDS = 6;
const CONFIRM_HITS = 2;

// Voice Activity Detection settings
const VAD_THRESHOLD_DEFAULT = 0.10; // Default minimum volume level (10%)
const VAD_CHECK_INTERVAL = 50; // How often to check volume (ms)

async function safeJson(res: Response) {
  const text = await res.text();
  if (!text) return { __empty: true };
  try {
    return JSON.parse(text);
  } catch {
    return { __notJson: true, raw: text.slice(0, 600) };
  }
}

export default function Live() {
  const store = useStore();

  const [audioSource, setAudioSource] = useState<AudioSource>("mic");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<number | null>(null);
  const streamForRecordingRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<"stopped" | "running">("stopped");
  const [lastTranscript, setLastTranscript] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [matchInfo, setMatchInfo] = useState<{ page: number; score: number; matchedNgrams: number; totalNgrams: number; currentPageMatches?: number } | null>(null);

  const [pdfPages, setPdfPages] = useState<PdfPageText[]>([]);
  const [dictionary, setDictionary] = useState<DictEntry[]>([]);
  const matcherRef = useRef<ReturnType<typeof createPageMatcher> | null>(null);
  
  // Set of valid Armenian words for filtering garbage transcriptions
  const validArmenianWordsRef = useRef<Set<string>>(new Set());
  
  // Armenian → Phonetic lookup map for translation
  const armenianToPhoneticRef = useRef<Map<string, string>>(new Map());

  const transcriptBufferRef = useRef<{ t: number; text: string }[]>([]);
  const pendingPageRef = useRef<number | null>(null);
  const pendingHitsRef = useRef<number>(0);
  const currentPageRef = useRef<number>(store.currentPage);

  // Voice Activity Detection refs
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadIntervalRef = useRef<number | null>(null);
  const isSpeechActiveRef = useRef<boolean>(false);
  const [currentVolume, setCurrentVolume] = useState<number>(0);
  const [isSpeechActive, setIsSpeechActive] = useState<boolean>(false);
  const [vadThreshold, setVadThreshold] = useState<number>(VAD_THRESHOLD_DEFAULT);
  const vadThresholdRef = useRef<number>(VAD_THRESHOLD_DEFAULT);
  
  // Audio fingerprint matching state
  type PageMarker = { pageNumber: number; timestampMs: number; audioFeatures: AudioFeatures | null };
  const [trainedMarkers, setTrainedMarkers] = useState<PageMarker[]>([]);
  const [fingerprintStatus, setFingerprintStatus] = useState<"loading" | "ready" | "error" | "none">("loading");
  const meydaAnalyzerRef = useRef<MeydaAnalyzer | null>(null);
  const featureBufferRef = useRef<{ features: AudioFeatures; timestamp: number }[]>([]);
  const [fingerprintScore, setFingerprintScore] = useState<number>(0);
  const [matchingMode, setMatchingMode] = useState<"fingerprint" | "whisper">("fingerprint");
  const matchCooldownRef = useRef<number>(0);
  
  // Coordinator for combining fingerprint and n-gram matching
  const coordinatorRef = useRef<PageMatchCoordinator>(new PageMatchCoordinator());
  const [coordinatorDecision, setCoordinatorDecision] = useState<CoordinatorDecision | null>(null);
  
  // Keep ref in sync with state for use in interval callback
  useEffect(() => {
    vadThresholdRef.current = vadThreshold;
  }, [vadThreshold]);

  useEffect(() => {
    currentPageRef.current = store.currentPage;
    coordinatorRef.current.setCurrentPage(store.currentPage);
  }, [store.currentPage]);

  function handleManualPageTurn(direction: "prev" | "next") {
    pendingPageRef.current = null;
    pendingHitsRef.current = 0;
    transcriptBufferRef.current = [];
    setMatchInfo(null);
    setCoordinatorDecision(null);
    
    const newPage = direction === "prev" 
      ? Math.max(1, store.currentPage - 1)
      : Math.min(store.totalPages, store.currentPage + 1);
    
    currentPageRef.current = newPage;
    coordinatorRef.current.setCurrentPage(newPage);
    
    if (direction === "prev") {
      store.prevPage();
    } else {
      store.nextPage();
    }
    console.log(`[Manual] Page turned ${direction}, now tracking from page ${newPage}`);
  }

  const containerRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(900);

  useEffect(() => {
    const update = () => {
      const el = containerRef.current;
      if (!el) return;
      setW(Math.floor(el.clientWidth));
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      ro.disconnect();
    };
  }, []);

  const pdfSrc = useMemo(() => {
    if (!store.pdfFile) return null;
    if (store.pdfFile.startsWith("blob:")) return store.pdfFile;
    if (store.pdfFile.startsWith("/")) return store.pdfFile;
    return `/${store.pdfFile}`;
  }, [store.pdfFile]);

  function onPdfLoaded({ numPages }: { numPages: number }) {
    store.setTotalPagesFromPdf(numPages);
  }

  useEffect(() => {
    if (!audioFile) {
      setAudioUrl(null);
      return;
    }
    const url = URL.createObjectURL(audioFile);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audioFile]);

  // Load trained audio fingerprints on mount
  useEffect(() => {
    async function loadFingerprints() {
      try {
        setFingerprintStatus("loading");
        const res = await fetch("/api/training-sessions/active/latest");
        if (!res.ok) {
          console.log("[Live] No trained session available");
          setFingerprintStatus("none");
          return;
        }
        const data = await res.json();
        if (data.markers && data.markers.length > 0) {
          const markers: PageMarker[] = data.markers.map((m: any) => ({
            pageNumber: m.pageNumber,
            timestampMs: m.timestampMs,
            audioFeatures: m.audioFeatures || null,
          }));
          setTrainedMarkers(markers);
          setFingerprintStatus("ready");
          coordinatorRef.current.setHasFingerprintData(true);
          
          // Extract trigger words from markers
          const triggers: TriggerData[] = data.markers
            .filter((m: any) => m.triggerTokens && m.triggerTokens.length > 0)
            .map((m: any) => ({
              pageNumber: m.pageNumber,
              tokens: m.triggerTokens,
              confidence: m.triggerConfidence || 0.8,
            }));
          
          if (triggers.length > 0) {
            coordinatorRef.current.setTriggers(triggers);
            console.log(`[Live] Loaded ${triggers.length} page triggers`);
          }
          
          console.log(`[Live] Loaded ${markers.length} trained fingerprints for pages ${markers.map(m => m.pageNumber).join(', ')}`);
        } else {
          setFingerprintStatus("none");
          coordinatorRef.current.setHasFingerprintData(false);
        }
      } catch (e) {
        console.error("[Live] Failed to load fingerprints:", e);
        setFingerprintStatus("error");
      }
    }
    loadFingerprints();
  }, []);

  const [dictionaryStatus, setDictionaryStatus] = useState<"checking" | "cached" | "extracting" | "ready" | "error">("checking");
  const [pdfIdState, setPdfIdState] = useState<string | null>(null);
  const [dictionaryMessage, setDictionaryMessage] = useState<string>("");

  async function loadDictionary(): Promise<DictEntry[]> {
    try {
      const res = await fetch("/api/dictionary-words?pdfId=global_dictionary");
      const data = await res.json();
      if (res.ok && data.ok && Array.isArray(data.words)) {
        const entries: DictEntry[] = data.words.map((w: any) => ({
          armenian: String(w.armenian || ""),
          phonetic: String(w.phonetic || ""),
        }));
        
        // Build set of valid Armenian words and Armenian→Phonetic map
        const validWords = new Set<string>();
        const armenianToPhonetic = new Map<string, string>();
        for (const entry of entries) {
          if (entry.armenian) {
            const armLower = entry.armenian.toLowerCase();
            validWords.add(armLower);
            if (entry.phonetic) {
              armenianToPhonetic.set(armLower, entry.phonetic.toLowerCase());
            }
          }
        }
        validArmenianWordsRef.current = validWords;
        armenianToPhoneticRef.current = armenianToPhonetic;
        
        console.log(`[Live] Loaded ${entries.length} dictionary entries (${armenianToPhonetic.size} translations)`);
        return entries;
      }
    } catch (e) {
      console.warn("[Live] Failed to load dictionary:", e);
    }
    return [];
  }

  async function loadPagesFromSections(pdfId: string): Promise<boolean> {
    try {
      const [sectionsRes, dict] = await Promise.all([
        fetch(`/api/page-sections/${pdfId}`),
        loadDictionary(),
      ]);
      const sectionsData = await sectionsRes.json();
      
      if (sectionsRes.ok && sectionsData.ok && Array.isArray(sectionsData.pages) && sectionsData.pages.length > 0) {
        const pages: PdfPageText[] = sectionsData.pages.map((p: any) => ({
          pageNumber: Number(p.pageNumber),
          norm: String(p.combined || `${p.armenian || ""} ${p.phonetic || ""}`).toLowerCase(),
          phoneticNorm: String(p.phonetic || "").toLowerCase(),
          armenianNorm: String(p.armenian || "").toLowerCase(),
        }));
        
        setPdfPages(pages);
        setDictionary(dict);
        matcherRef.current = createPageMatcher(pages, dict, MATCHER_CONFIG);
        setPdfIdState(pdfId);
        setDictionaryStatus("ready");
        setDictionaryMessage(`Ready: ${pages.length} pages, ${dict.length} words`);
        console.log(`[Live] Loaded ${pages.length} pages + ${dict.length} dictionary words`);
        return true;
      }
    } catch (e) {
      console.warn("[Live] Failed to load page sections:", e);
    }
    return false;
  }

  async function triggerExtraction(): Promise<string | null> {
    setDictionaryStatus("extracting");
    setDictionaryMessage("Extracting text from PDF...");
    try {
      const extractRes = await fetch("/api/extract-dictionary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfPath: store.pdfFile }),
      });
      const extractData = await extractRes.json();
      if (extractRes.ok && extractData.ok && extractData.pdfId) {
        console.log(`[Live] Dictionary extracted: ${extractData.totalPages} pages`);
        setDictionaryMessage(`Extracted ${extractData.totalPages} pages`);
        return extractData.pdfId;
      }
    } catch (e) {
      console.warn("[Live] Extraction failed:", e);
    }
    setDictionaryStatus("error");
    setDictionaryMessage("Failed to extract dictionary");
    return null;
  }
  
  async function rebuildDictionary() {
    if (!store.pdfFile) return;
    setDictionaryStatus("extracting");
    setDictionaryMessage("Rebuilding dictionary...");
    const pdfId = await triggerExtraction();
    if (pdfId) {
      await loadPagesFromSections(pdfId);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        setErrorMsg("");
        setDictionaryStatus("checking");
        setDictionaryMessage("Checking for cached data...");
        console.log("[Live] store.pdfFile =", store.pdfFile);
        if (!store.pdfFile) {
          console.log("[Live] No PDF file set");
          setDictionaryStatus("error");
          setDictionaryMessage("No PDF loaded");
          return;
        }
        if (!store.pdfFile.startsWith("/uploads/")) {
          console.log("[Live] PDF path doesn't start with /uploads/, skipping text extraction");
          setDictionaryStatus("error");
          setDictionaryMessage("Invalid PDF path");
          return;
        }

        console.log("[Live] Checking for existing page sections...");
        
        const checkRes = await fetch(`/api/check-pdf-sections?path=${encodeURIComponent(store.pdfFile)}`);
        const checkData = await checkRes.json();
        
        if (checkRes.ok && checkData.ok && checkData.pdfId && checkData.pageCount > 0) {
          console.log(`[Live] Found existing sections for pdfId=${checkData.pdfId} (${checkData.pageCount} pages)`);
          setDictionaryStatus("cached");
          setDictionaryMessage(`Found cached data: ${checkData.pageCount} pages`);
          if (await loadPagesFromSections(checkData.pdfId)) {
            return;
          }
        }
        
        console.log("[Live] No cached sections, triggering extraction...");
        const pdfId = await triggerExtraction();
        if (pdfId && await loadPagesFromSections(pdfId)) {
          return;
        }

        console.log("[Live] Falling back to pdf-text endpoint");
        setDictionaryMessage("Using fallback text extraction...");
        const res = await fetch(`/api/pdf-text?path=${encodeURIComponent(store.pdfFile)}`);
        const data = await res.json();

        if (!res.ok || !data.ok || !Array.isArray(data.pages)) {
          throw new Error(data?.error || "Failed to load PDF text for matching");
        }

        const pages: PdfPageText[] = data.pages.map((p: any) => ({
          pageNumber: Number(p.pageNumber),
          norm: String(p.norm || ""),
        }));

        setPdfPages(pages);
        matcherRef.current = createPageMatcher(pages, undefined, MATCHER_CONFIG);
        setDictionaryStatus("ready");
        setDictionaryMessage(`Fallback ready: ${pages.length} pages`);
      } catch (e: any) {
        setErrorMsg(e?.message || "Failed to load PDF matching data");
        setDictionaryStatus("error");
        setDictionaryMessage(e?.message || "Failed to load");
        setPdfPages([]);
        matcherRef.current = null;
      }
    })();
  }, [store.pdfFile]);

  // Get Armenian text context from current and next pages to guide Whisper
  function getPageContext(): string {
    const currentPage = currentPageRef.current;
    const pages = pdfPages;
    
    // Get Armenian text from current and next 2 pages
    const contextPages = [currentPage, currentPage + 1, currentPage + 2];
    const contextTexts: string[] = [];
    
    for (const pageNum of contextPages) {
      const page = pages.find(p => p.pageNumber === pageNum);
      if (page) {
        // Use Armenian text if available, otherwise use norm
        const text = (page as any).armenianNorm || page.norm || "";
        if (text) {
          // Take first 100 chars of each page for context
          contextTexts.push(text.slice(0, 100));
        }
      }
    }
    
    return contextTexts.join(" ");
  }

  async function postToTranscribe(blob: Blob) {
    const form = new FormData();
    form.append("audio", blob, "chunk.webm");
    
    // Send page context to guide Whisper recognition
    const context = getPageContext();
    if (context) {
      form.append("context", context);
    }

    const res = await fetch("/api/transcribe", {
      method: "POST",
      body: form,
    });

    const data = await safeJson(res);
    if (!res.ok) {
      throw new Error(data?.error || data?.message || "Transcribe failed");
    }

    const text = data?.text || data?.transcript || "";
    return String(text);
  }

  // Detect if text is a hallucination (same word/phrase repeated many times)
  function isHallucination(text: string): boolean {
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    if (words.length < 3) return false;
    
    // Count word frequencies
    const freq = new Map<string, number>();
    for (const w of words) {
      freq.set(w, (freq.get(w) || 0) + 1);
    }
    
    // If any single word appears more than 50% of the time, it's likely a hallucination
    for (const [word, count] of freq) {
      if (count / words.length > 0.5) {
        console.log(`[Hallucination] Detected repeated word "${word}" (${count}/${words.length})`);
        return true;
      }
    }
    return false;
  }

  // Filter transcript and translate Armenian → Phonetic using dictionary
  function filterAndTranslate(text: string): string {
    // First check for hallucinations (repeated words)
    if (isHallucination(text)) {
      console.log(`[Filter] Skipping hallucinated text: "${text.slice(0, 50)}..."`);
      return '';
    }
    
    const validWords = validArmenianWordsRef.current;
    const armenianToPhonetic = armenianToPhoneticRef.current;
    
    if (validWords.size === 0) return text; // No filtering if dictionary not loaded
    
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    const translated: string[] = [];
    const dropped: string[] = [];
    
    for (const word of words) {
      // Remove punctuation for matching
      const clean = word.replace(/[^\u0530-\u058F\u0561-\u0587]/g, '');
      if (clean.length === 0) continue;
      
      if (validWords.has(clean)) {
        // Translate to phonetic if available
        const phonetic = armenianToPhonetic.get(clean);
        if (phonetic) {
          translated.push(phonetic);
        } else {
          translated.push(clean); // Keep Armenian if no phonetic available
        }
      } else {
        dropped.push(clean);
      }
    }
    
    // Deduplicate consecutive repeated words in output (another hallucination pattern)
    const deduped: string[] = [];
    for (const word of translated) {
      if (deduped.length === 0 || deduped[deduped.length - 1] !== word) {
        deduped.push(word);
      }
    }
    
    // Debug: show raw Whisper output vs what survived dictionary filter
    console.log(`[Whisper] Raw: "${text}"`);
    console.log(`[Filter] Kept ${deduped.length}/${words.length}: ${deduped.join(', ')}`);
    if (dropped.length > 0) {
      console.log(`[Filter] Dropped ${dropped.length}: ${dropped.join(', ')}`);
    }
    
    return deduped.join(' ');
  }

  function feedTranscriptChunk(chunkText: string) {
    const matcher = matcherRef.current;
    if (!matcher || pdfPages.length === 0) return;

    // Filter garbage and translate Armenian → Phonetic
    const phoneticText = filterAndTranslate(chunkText);
    if (!phoneticText.trim()) {
      console.log("[Translate] No valid words found - skipping");
      return;
    }

    const now = Date.now();
    transcriptBufferRef.current.push({ t: now, text: phoneticText });

    const cutoff = now - WINDOW_SECONDS * 1000;
    transcriptBufferRef.current = transcriptBufferRef.current.filter(x => x.t >= cutoff);

    const windowText = transcriptBufferRef.current.map(x => x.text).join(" ");

    const currentPage = currentPageRef.current;
    const nextPage = currentPage + 1;
    
    const currentResult = matcher(windowText, currentPage, 0);
    const nextResult = matcher(windowText, nextPage, 0);
    
    const currMatches = currentResult.matchedNgrams;
    const nextMatches = nextResult.matchedNgrams;
    
    setMatchInfo({ ...nextResult, currentPageMatches: currMatches });

    // Update coordinator with recent transcript tokens for trigger word detection
    const recentTokens = windowText.split(/\s+/).filter(t => t.length > 0);
    coordinatorRef.current.updateRecentTranscript(recentTokens);

    // Report to coordinator instead of turning pages directly
    const decision = coordinatorRef.current.reportNgramMatch(currMatches, nextMatches, currentResult.totalNgrams);
    setCoordinatorDecision(decision);
    
    if (decision.action === "turn" && decision.targetPage) {
      store.setPage(decision.targetPage);
      currentPageRef.current = decision.targetPage;
      coordinatorRef.current.setCurrentPage(decision.targetPage);
      transcriptBufferRef.current = [];
      console.log(`[Coordinator] Auto-advanced to page ${decision.targetPage} (${decision.reason})`);
    }
  }

  function stopAll() {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    // Clean up Meyda analyzer
    if (meydaAnalyzerRef.current) {
      try {
        meydaAnalyzerRef.current.stop();
      } catch {}
      meydaAnalyzerRef.current = null;
    }
    featureBufferRef.current = [];
    setFingerprintScore(0);
    
    // Reset coordinator
    coordinatorRef.current.reset();
    setCoordinatorDecision(null);

    // Clean up VAD
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    analyserRef.current = null;
    isSpeechActiveRef.current = false;
    speechDetectedInChunkRef.current = false;
    setIsSpeechActive(false);
    setCurrentVolume(0);

    try {
      mediaRecorderRef.current?.stop();
    } catch {}

    mediaRecorderRef.current = null;
    chunksRef.current = [];
    streamForRecordingRef.current = null;

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }

    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }

    setStatus("stopped");
  }

  // Track if speech was detected during the current recording chunk
  const speechDetectedInChunkRef = useRef<boolean>(false);

  function createRecorderForStream(stream: MediaStream, checkVAD: boolean = true) {
    chunksRef.current = [];
    const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
    
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    rec.onstop = async () => {
      if (chunksRef.current.length === 0) return;
      
      // Use the captured speech state (captured before stop was called)
      const hadSpeech = chunkHadSpeechRef.current;
      
      // Skip transcription if VAD is enabled and no speech was detected during this chunk
      if (checkVAD && !hadSpeech) {
        console.log("[VAD] Skipping transcription - no speech detected");
        chunksRef.current = [];
        return;
      }
      
      console.log("[VAD] Sending audio for transcription - speech was detected");
      
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      chunksRef.current = [];
      
      try {
        const t = await postToTranscribe(blob);
        if (t.trim()) {
          setLastTranscript(t);
          feedTranscriptChunk(t);
        }
      } catch (err: any) {
        setErrorMsg(err?.message || "Transcribe error");
      }
    };

    return rec;
  }

  // Store the speech state for the current chunk before stopping
  const chunkHadSpeechRef = useRef<boolean>(false);

  function startRecordingCycle(stream: MediaStream, useVAD: boolean = true) {
    streamForRecordingRef.current = stream;
    
    const startNewRecording = () => {
      if (!streamForRecordingRef.current) return;
      // Reset speech detection for the NEW chunk (not affecting the one being processed)
      speechDetectedInChunkRef.current = false;
      isSpeechActiveRef.current = false;
      setIsSpeechActive(false);
      const rec = createRecorderForStream(streamForRecordingRef.current, useVAD);
      mediaRecorderRef.current = rec;
      rec.start();
    };

    startNewRecording();

    recordingIntervalRef.current = window.setInterval(() => {
      // IMPORTANT: Capture speech state BEFORE stopping (stop is async)
      chunkHadSpeechRef.current = speechDetectedInChunkRef.current;
      
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      startNewRecording();
    }, 500); // 500ms chunks for sub-second transcription
  }

  async function startMicRecorder() {
    // Request mic with noise suppression enabled to filter fan noise
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: false, // Don't auto-boost quiet sounds (like fan)
      }
    });
    micStreamRef.current = stream;
    
    // Set up AudioContext with high-pass filter to cut low-frequency fan noise
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    
    const source = ctx.createMediaStreamSource(stream);
    
    // High-pass filter at 150Hz to remove low-frequency fan hum
    const highPassFilter = ctx.createBiquadFilter();
    highPassFilter.type = "highpass";
    highPassFilter.frequency.value = 150;
    highPassFilter.Q.value = 0.7;
    
    source.connect(highPassFilter);
    
    // Create filtered stream for recording
    const dest = ctx.createMediaStreamDestination();
    highPassFilter.connect(dest);
    
    // Use filtered stream for recording
    const filteredStream = dest.stream;
    
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.3;
    highPassFilter.connect(analyser);
    analyserRef.current = analyser;
    
    // Start VAD monitoring
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    vadIntervalRef.current = window.setInterval(() => {
      if (!analyserRef.current) return;
      
      analyserRef.current.getByteFrequencyData(dataArray);
      
      // Calculate RMS volume (0-1 scale)
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += (dataArray[i] / 255) ** 2;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      setCurrentVolume(rms);
      
      // Check if volume exceeds threshold (use ref to get latest value)
      const hasSpeech = rms > vadThresholdRef.current;
      if (hasSpeech) {
        // Mark that speech was detected in this chunk (persists until chunk ends)
        if (!speechDetectedInChunkRef.current) {
          console.log(`[VAD] Speech detected! Volume: ${(rms * 100).toFixed(2)}%`);
        }
        speechDetectedInChunkRef.current = true;
        isSpeechActiveRef.current = true;
        setIsSpeechActive(true);
      }
    }, VAD_CHECK_INTERVAL);
    
    // Start Meyda audio feature extraction for fingerprint matching
    if (trainedMarkers.length > 0 && matchingMode === "fingerprint") {
      try {
        const meydaAnalyzer = createAudioAnalyzer(ctx, source, (features: AudioFeatures) => {
          // Add to buffer for averaging
          featureBufferRef.current.push({ features, timestamp: Date.now() });
          
          // Keep only last 1 second of features
          const now = Date.now();
          featureBufferRef.current = featureBufferRef.current.filter(f => now - f.timestamp < 1000);
          
          // Need at least a few samples for reliable matching
          if (featureBufferRef.current.length < 3) return;
          
          // Cooldown to prevent rapid page turns
          if (now < matchCooldownRef.current) return;
          
          // Find best matching page
          const currentPage = currentPageRef.current;
          const nextPage = currentPage + 1;
          
          // Get markers for current and next page
          const currentMarkers = trainedMarkers.filter(m => m.pageNumber === currentPage && m.audioFeatures);
          const nextMarkers = trainedMarkers.filter(m => m.pageNumber === nextPage && m.audioFeatures);
          
          if (nextMarkers.length === 0) return; // No fingerprint for next page
          
          // Average the recent features for more stable matching
          const avgFeatures: AudioFeatures = {
            rms: 0,
            zcr: 0,
            spectralCentroid: 0,
            spectralRolloff: 0,
            mfcc: new Array(13).fill(0),
          };
          
          for (const { features: f } of featureBufferRef.current) {
            avgFeatures.rms += f.rms;
            avgFeatures.zcr += f.zcr;
            avgFeatures.spectralCentroid += f.spectralCentroid;
            avgFeatures.spectralRolloff += f.spectralRolloff;
            for (let i = 0; i < Math.min(f.mfcc.length, 13); i++) {
              avgFeatures.mfcc[i] += f.mfcc[i];
            }
          }
          
          const count = featureBufferRef.current.length;
          avgFeatures.rms /= count;
          avgFeatures.zcr /= count;
          avgFeatures.spectralCentroid /= count;
          avgFeatures.spectralRolloff /= count;
          avgFeatures.mfcc = avgFeatures.mfcc.map(v => v / count);
          
          // Compare with next page fingerprints
          let bestNextScore = 0;
          for (const marker of nextMarkers) {
            if (!marker.audioFeatures) continue;
            const score = compareFeatures(avgFeatures, marker.audioFeatures as AudioFeatures);
            if (score > bestNextScore) bestNextScore = score;
          }
          
          // Compare with current page fingerprints
          let bestCurrentScore = 0;
          for (const marker of currentMarkers) {
            if (!marker.audioFeatures) continue;
            const score = compareFeatures(avgFeatures, marker.audioFeatures as AudioFeatures);
            if (score > bestCurrentScore) bestCurrentScore = score;
          }
          
          setFingerprintScore(bestNextScore);
          
          // Report to coordinator instead of turning pages directly
          const decision = coordinatorRef.current.reportFingerprintMatch(bestCurrentScore, bestNextScore);
          setCoordinatorDecision(decision);
          
          if (decision.action === "turn" && decision.targetPage) {
            console.log(`[Coordinator] Fingerprint triggered page turn to ${decision.targetPage} (${decision.reason})`);
            store.setPage(decision.targetPage);
            currentPageRef.current = decision.targetPage;
            coordinatorRef.current.setCurrentPage(decision.targetPage);
            featureBufferRef.current = []; // Clear buffer after turn
            matchCooldownRef.current = now + 3000; // 3 second cooldown
          }
        });
        
        meydaAnalyzer.start();
        meydaAnalyzerRef.current = meydaAnalyzer;
        console.log("[Live] Meyda fingerprint analyzer started");
      } catch (e) {
        console.error("[Live] Failed to start Meyda analyzer:", e);
      }
    }
    
    // Use the filtered stream (with high-pass filter applied) for recording
    startRecordingCycle(filteredStream);
    setStatus("running");
  }

  async function startFileRecorder() {
    if (!audioUrl) {
      throw new Error("Please choose an audio file first.");
    }

    if (!audioElRef.current) {
      audioElRef.current = new Audio();
      audioElRef.current.controls = true;
    }

    audioElRef.current.src = audioUrl;

    const ctx = new AudioContext();
    audioCtxRef.current = ctx;

    const sourceNode = ctx.createMediaElementSource(audioElRef.current);
    const dest = ctx.createMediaStreamDestination();

    sourceNode.connect(ctx.destination);
    sourceNode.connect(dest);

    // For audio files, disable VAD since we want to process all audio
    startRecordingCycle(dest.stream, false);

    await ctx.resume();
    await audioElRef.current.play();

    setStatus("running");
  }

  async function start() {
    setErrorMsg("");
    setLastTranscript("");

    try {
      stopAll();
      if (audioSource === "mic") {
        await startMicRecorder();
      } else {
        await startFileRecorder();
      }
    } catch (err: any) {
      stopAll();
      setErrorMsg(err?.message || "Failed to start");
    }
  }

  function stop() {
    stopAll();
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        handleManualPageTurn("next");
      } else if (e.code === "KeyB") {
        handleManualPageTurn("prev");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [store]);

  return (
    <div className="min-h-screen bg-[#6b63d6]">
      <div className="mx-auto max-w-7xl p-6">
        <div className="mb-4 rounded-xl bg-white p-4 shadow">
          <div className="flex items-center justify-between">
            <div className="text-xl font-bold">Live Mode</div>
            <div className="text-sm text-gray-600">
              PDF pages: {store.currentPage} / {store.totalPages}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6">
            <div className="rounded-xl bg-white p-4 shadow">
              <div className="mb-2 font-semibold">Audio Source</div>

              <div className="flex gap-2">
                <button
                  data-testid="button-audio-mic"
                  className={`rounded-lg px-3 py-2 text-sm ${
                    audioSource === "mic" ? "bg-blue-600 text-white" : "bg-gray-100"
                  }`}
                  onClick={() => setAudioSource("mic")}
                  disabled={status === "running"}
                >
                  Microphone
                </button>

                <button
                  data-testid="button-audio-file"
                  className={`rounded-lg px-3 py-2 text-sm ${
                    audioSource === "file" ? "bg-blue-600 text-white" : "bg-gray-100"
                  }`}
                  onClick={() => setAudioSource("file")}
                  disabled={status === "running"}
                >
                  Audio File
                </button>
              </div>

              {audioSource === "file" && (
                <div className="mt-4 space-y-2">
                  <input
                    data-testid="input-audio-file"
                    type="file"
                    accept="audio/*"
                    disabled={status === "running"}
                    onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                  />
                  {audioUrl && (
                    <div className="text-xs text-gray-600">
                      Selected: {audioFile?.name}
                      <div className="mt-2">
                        <audio src={audioUrl} controls className="w-full" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-xl bg-white p-4 shadow">
              <div className="mb-3 font-semibold">Controls</div>
              <div className="flex items-center gap-3">
                <button
                  data-testid="button-start"
                  className="rounded-lg bg-green-500 px-4 py-2 text-white disabled:opacity-50"
                  onClick={start}
                  disabled={status === "running" || dictionaryStatus !== "ready"}
                >
                  Start
                </button>
                <button
                  data-testid="button-stop"
                  className="rounded-lg bg-red-500 px-4 py-2 text-white disabled:opacity-50"
                  onClick={stop}
                  disabled={status !== "running"}
                >
                  Stop
                </button>
                <div data-testid="text-status" className="text-sm text-gray-700">
                  {status === "running" ? "Running" : "Stopped"}
                </div>
              </div>

              {errorMsg && (
                <div data-testid="text-error" className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">
                  {errorMsg}
                </div>
              )}

              {status === "running" && audioSource === "mic" && (
                <div className="mt-3 rounded-lg bg-gray-50 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-700">Voice Detection</span>
                    <span className={`text-xs font-bold ${isSpeechActive ? "text-green-600" : "text-gray-400"}`}>
                      {isSpeechActive ? "Speech Detected" : "Waiting for speech..."}
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className={`h-3 transition-all duration-100 ${currentVolume > vadThreshold ? "bg-green-500" : "bg-gray-400"}`}
                      style={{ width: `${Math.min(100, currentVolume * 500)}%` }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-gray-500">
                    <span>Volume: {(currentVolume * 100).toFixed(1)}%</span>
                    <span>Threshold: {(vadThreshold * 100).toFixed(0)}%</span>
                  </div>
                  <div className="mt-3">
                    <label className="text-xs font-medium text-gray-700 block mb-1">
                      Mic Sensitivity (lower = more sensitive)
                    </label>
                    <input
                      data-testid="slider-mic-threshold"
                      type="range"
                      min="1"
                      max="50"
                      value={vadThreshold * 100}
                      onChange={(e) => setVadThreshold(Number(e.target.value) / 100)}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>1%</span>
                      <span>50%</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-3 text-xs text-gray-600">
                Latest transcript:
                <div data-testid="text-transcript" className="mt-1 rounded bg-gray-50 p-2 text-gray-800">
                  {lastTranscript || "—"}
                </div>
              </div>

              {/* Fingerprint matching status */}
              {fingerprintStatus !== "none" && (
                <div className="mt-3 rounded-lg bg-purple-50 p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-purple-800">Audio Fingerprint Matching</div>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      fingerprintStatus === "ready" ? "bg-green-100 text-green-700" :
                      fingerprintStatus === "loading" ? "bg-yellow-100 text-yellow-700" :
                      "bg-red-100 text-red-700"
                    }`}>
                      {fingerprintStatus === "ready" ? `${trainedMarkers.length} fingerprints` :
                       fingerprintStatus === "loading" ? "Loading..." : "Error"}
                    </span>
                  </div>
                  {status === "running" && fingerprintStatus === "ready" && (
                    <div className="mt-2">
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="h-2 rounded-full bg-purple-200">
                            <div
                              className="h-2 rounded-full bg-purple-600 transition-all"
                              style={{ width: `${Math.min(100, fingerprintScore)}%` }}
                            />
                          </div>
                        </div>
                        <div className="text-sm font-bold text-purple-700">
                          {fingerprintScore.toFixed(0)}%
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-purple-600">
                        Comparing live audio to page {store.currentPage + 1} fingerprint (threshold: 65%)
                      </div>
                    </div>
                  )}
                </div>
              )}

              {matchInfo && (
                <div className="mt-3 rounded-lg bg-blue-50 p-3">
                  <div className="text-xs font-medium text-blue-800">N-gram Matching (Whisper)</div>
                  <div className="mt-1 flex items-center gap-3">
                    <div className="flex-1">
                      <div className="h-2 rounded-full bg-blue-200">
                        <div
                          className="h-2 rounded-full bg-blue-600 transition-all"
                          style={{ width: `${Math.min(100, matchInfo.score * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div data-testid="text-confidence" className="text-sm font-bold text-blue-700">
                      {matchInfo.matchedNgrams}/{matchInfo.totalNgrams}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-blue-600">
                    Current: {matchInfo.currentPageMatches ?? 0} | Next: {matchInfo.matchedNgrams} (need {MATCHER_CONFIG.minNgramMatches}+ and more than current)
                  </div>
                </div>
              )}

              {/* Coordinator Decision Display */}
              {status === "running" && coordinatorDecision && (
                <div className={`mt-3 rounded-lg p-3 ${
                  coordinatorDecision.action === "turn" ? "bg-green-50" : 
                  coordinatorDecision.agreement ? "bg-yellow-50" : "bg-gray-50"
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-gray-800">Coordinator Decision</div>
                    <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                      coordinatorDecision.action === "turn" ? "bg-green-200 text-green-800" : 
                      coordinatorDecision.agreement ? "bg-yellow-200 text-yellow-800" : "bg-gray-200 text-gray-700"
                    }`}>
                      {coordinatorDecision.action.toUpperCase()}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div className="bg-white/50 rounded p-1">
                      <div className="text-gray-500">Fingerprint</div>
                      <div className="font-bold text-purple-700">{coordinatorDecision.fingerprintConfidence.toFixed(0)}%</div>
                    </div>
                    <div className="bg-white/50 rounded p-1">
                      <div className="text-gray-500">N-gram</div>
                      <div className="font-bold text-blue-700">{coordinatorDecision.ngramConfidence.toFixed(0)}%</div>
                    </div>
                    <div className="bg-white/50 rounded p-1">
                      <div className="text-gray-500">Trigger</div>
                      <div className="font-bold text-amber-700">{coordinatorDecision.triggerConfidence.toFixed(0)}%</div>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-gray-600">
                    Reason: {coordinatorDecision.reason.replace(/_/g, ' ')}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl bg-white p-4 shadow">
              <div className="mb-3 font-semibold">Manual Controls</div>
              <div className="space-y-2">
                <button
                  data-testid="button-prev-page"
                  className="w-full rounded-lg bg-gray-100 px-4 py-2"
                  onClick={() => handleManualPageTurn("prev")}
                >
                  Previous (B)
                </button>
                <button
                  data-testid="button-next-page"
                  className="w-full rounded-lg bg-gray-100 px-4 py-2"
                  onClick={() => handleManualPageTurn("next")}
                >
                  Next (Space)
                </button>
              </div>

              <div className="mt-3 rounded-lg bg-gray-50 p-2 text-xs">
                <div className="font-medium text-gray-700">Dictionary Status:</div>
                <div className="mt-1 space-y-1">
                  <div className="flex items-center gap-2">
                    {dictionaryStatus === "checking" && (
                      <span className="text-yellow-600">Checking...</span>
                    )}
                    {dictionaryStatus === "cached" && (
                      <span className="text-blue-600">Using cached data</span>
                    )}
                    {dictionaryStatus === "extracting" && (
                      <span className="text-yellow-600">Extracting...</span>
                    )}
                    {dictionaryStatus === "ready" && (
                      <span className="text-green-600">Ready</span>
                    )}
                    {dictionaryStatus === "error" && (
                      <span className="text-red-600">Error</span>
                    )}
                  </div>
                  <div className="text-gray-600">{dictionaryMessage}</div>
                  <div className={pdfPages.length > 0 ? "text-green-600" : "text-red-600"}>
                    {pdfPages.length > 0 
                      ? `Pages loaded: ${pdfPages.length}`
                      : "No pages loaded"}
                  </div>
                </div>
                <button
                  data-testid="button-rebuild-dictionary"
                  className="mt-2 w-full rounded bg-gray-200 px-2 py-1 text-xs hover:bg-gray-300 disabled:opacity-50"
                  onClick={rebuildDictionary}
                  disabled={dictionaryStatus === "extracting" || dictionaryStatus === "checking" || !store.pdfFile}
                >
                  Rebuild Dictionary
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="rounded-xl bg-white p-4 shadow">
              <div className="mb-3 flex items-center justify-between">
                <div className="font-semibold">PDF Display</div>
                <div data-testid="text-page-info" className="text-sm text-gray-600">
                  Page {store.currentPage} of {store.totalPages}
                </div>
              </div>

              <div ref={containerRef} className="w-full overflow-hidden rounded-lg bg-black p-2">
                {!pdfSrc ? (
                  <div className="flex h-[500px] items-center justify-center text-white">
                    Upload a PDF first.
                  </div>
                ) : (
                  <Document
                    file={pdfSrc}
                    onLoadSuccess={onPdfLoaded}
                    loading={<div className="text-white p-6">Loading PDF…</div>}
                    error={<div className="text-red-300 p-6">Failed to load PDF.</div>}
                  >
                    <Page
                      pageNumber={store.currentPage}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      width={w - 16}
                    />
                  </Document>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
