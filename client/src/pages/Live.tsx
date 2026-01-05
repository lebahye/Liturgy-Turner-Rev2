import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { Document, Page, pdfjs } from "react-pdf";
import { createPageMatcher, PdfPageText, DictEntry, MatcherConfig } from "@/lib/pageMatching";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type AudioSource = "mic" | "file";

const MATCHER_CONFIG: MatcherConfig = {
  ngramSize: 1,
  minNgramMatches: 3,
  matchMode: "armenian",
};

const WINDOW_SECONDS = 6;
const CONFIRM_HITS = 2;

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

  const transcriptBufferRef = useRef<{ t: number; text: string }[]>([]);
  const pendingPageRef = useRef<number | null>(null);
  const pendingHitsRef = useRef<number>(0);
  const currentPageRef = useRef<number>(store.currentPage);

  useEffect(() => {
    currentPageRef.current = store.currentPage;
  }, [store.currentPage]);

  function handleManualPageTurn(direction: "prev" | "next") {
    pendingPageRef.current = null;
    pendingHitsRef.current = 0;
    transcriptBufferRef.current = [];
    setMatchInfo(null);
    
    const newPage = direction === "prev" 
      ? Math.max(1, store.currentPage - 1)
      : Math.min(store.totalPages, store.currentPage + 1);
    
    currentPageRef.current = newPage;
    
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
        console.log(`[Live] Loaded ${entries.length} dictionary entries`);
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

  async function postToTranscribe(blob: Blob) {
    const form = new FormData();
    form.append("audio", blob, "chunk.webm");

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

  function feedTranscriptChunk(chunkText: string) {
    const matcher = matcherRef.current;
    if (!matcher || pdfPages.length === 0) return;

    const now = Date.now();
    transcriptBufferRef.current.push({ t: now, text: chunkText });

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
    
    const shouldAdvance = nextMatches >= MATCHER_CONFIG.minNgramMatches && nextMatches > currMatches;
    
    console.log(`[Match] p${currentPage}:${currMatches}ng, p${nextPage}:${nextMatches}ng, total:${currentResult.totalNgrams}ng, advance=${shouldAdvance}`);

    if (shouldAdvance) {
      if (pendingPageRef.current === nextPage) {
        pendingHitsRef.current += 1;
      } else {
        pendingPageRef.current = nextPage;
        pendingHitsRef.current = 1;
      }

      if (pendingHitsRef.current >= CONFIRM_HITS) {
        store.setPage(nextPage);
        currentPageRef.current = nextPage;
        pendingPageRef.current = null;
        pendingHitsRef.current = 0;
        transcriptBufferRef.current = [];
        console.log(`[Auto] Advanced to page ${nextPage}`);
      }
    } else {
      pendingPageRef.current = null;
      pendingHitsRef.current = 0;
    }
  }

  function stopAll() {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

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

  function createRecorderForStream(stream: MediaStream) {
    chunksRef.current = [];
    const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
    
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    rec.onstop = async () => {
      if (chunksRef.current.length === 0) return;
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

  function startRecordingCycle(stream: MediaStream) {
    streamForRecordingRef.current = stream;
    
    const startNewRecording = () => {
      if (!streamForRecordingRef.current) return;
      const rec = createRecorderForStream(streamForRecordingRef.current);
      mediaRecorderRef.current = rec;
      rec.start();
    };

    startNewRecording();

    recordingIntervalRef.current = window.setInterval(() => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      startNewRecording();
    }, 2000);
  }

  async function startMicRecorder() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micStreamRef.current = stream;
    startRecordingCycle(stream);
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

    startRecordingCycle(dest.stream);

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

              <div className="mt-3 text-xs text-gray-600">
                Latest transcript:
                <div data-testid="text-transcript" className="mt-1 rounded bg-gray-50 p-2 text-gray-800">
                  {lastTranscript || "—"}
                </div>
              </div>

              {matchInfo && (
                <div className="mt-3 rounded-lg bg-blue-50 p-3">
                  <div className="text-xs font-medium text-blue-800">N-gram Matching</div>
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
