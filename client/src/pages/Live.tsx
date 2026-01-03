import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { Document, Page, pdfjs } from "react-pdf";
import { createPageMatcher, PdfPageText } from "@/lib/pageMatching";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

type AudioSource = "mic" | "file";

const WINDOW_SECONDS = 12;
const LOOKAHEAD = 2;
const TURN_THRESHOLD = 0.22;
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

  const [status, setStatus] = useState<"stopped" | "running">("stopped");
  const [lastTranscript, setLastTranscript] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const [pdfPages, setPdfPages] = useState<PdfPageText[]>([]);
  const matcherRef = useRef<ReturnType<typeof createPageMatcher> | null>(null);

  const transcriptBufferRef = useRef<{ t: number; text: string }[]>([]);
  const pendingPageRef = useRef<number | null>(null);
  const pendingHitsRef = useRef<number>(0);

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

  useEffect(() => {
    (async () => {
      try {
        setErrorMsg("");
        if (!store.pdfFile || !store.pdfFile.startsWith("/uploads/")) return;

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
        matcherRef.current = createPageMatcher(pages);
      } catch (e: any) {
        setErrorMsg(e?.message || "Failed to load PDF matching data");
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

    const { page, score } = matcher(windowText, store.currentPage, LOOKAHEAD);

    if (page <= store.currentPage) {
      pendingPageRef.current = null;
      pendingHitsRef.current = 0;
      return;
    }

    if (score >= TURN_THRESHOLD) {
      if (pendingPageRef.current === page) {
        pendingHitsRef.current += 1;
      } else {
        pendingPageRef.current = page;
        pendingHitsRef.current = 1;
      }

      if (pendingHitsRef.current >= CONFIRM_HITS) {
        store.setPage(page);
        pendingPageRef.current = null;
        pendingHitsRef.current = 0;
        transcriptBufferRef.current = [];
      }
    } else {
      pendingPageRef.current = null;
      pendingHitsRef.current = 0;
    }
  }

  function stopAll() {
    try {
      mediaRecorderRef.current?.stop();
    } catch {}

    mediaRecorderRef.current = null;

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

  async function startMicRecorder() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micStreamRef.current = stream;

    const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
    mediaRecorderRef.current = rec;

    rec.ondataavailable = async (e) => {
      if (!e.data || e.data.size === 0) return;
      try {
        const t = await postToTranscribe(e.data);
        if (t.trim()) {
          setLastTranscript(t);
          feedTranscriptChunk(t);
        }
      } catch (err: any) {
        setErrorMsg(err?.message || "Transcribe error");
      }
    };

    rec.start(6000);
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

    const rec = new MediaRecorder(dest.stream, { mimeType: "audio/webm" });
    mediaRecorderRef.current = rec;

    rec.ondataavailable = async (e) => {
      if (!e.data || e.data.size === 0) return;
      try {
        const t = await postToTranscribe(e.data);
        if (t.trim()) {
          setLastTranscript(t);
          feedTranscriptChunk(t);
        }
      } catch (err: any) {
        setErrorMsg(err?.message || "Transcribe error");
      }
    };

    rec.start(6000);

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
      if (e.code === "Space") {
        e.preventDefault();
        store.nextPage();
      } else if (e.code === "KeyB") {
        store.prevPage();
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
                  disabled={status === "running"}
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
            </div>

            <div className="rounded-xl bg-white p-4 shadow">
              <div className="mb-3 font-semibold">Manual Controls</div>
              <div className="space-y-2">
                <button
                  data-testid="button-prev-page"
                  className="w-full rounded-lg bg-gray-100 px-4 py-2"
                  onClick={() => store.prevPage()}
                >
                  Previous (B)
                </button>
                <button
                  data-testid="button-next-page"
                  className="w-full rounded-lg bg-gray-100 px-4 py-2"
                  onClick={() => store.nextPage()}
                >
                  Next (Space)
                </button>
              </div>

              <div className="mt-3 text-xs text-gray-500">
                Auto page turning will be added by plugging the tracker into the transcript callback.
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
