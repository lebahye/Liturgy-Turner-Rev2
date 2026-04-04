import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AudioVisualizer } from "@/components/AudioVisualizer";
import { PdfViewport } from "@/components/PdfViewport";
import { audioHandler } from "@/lib/audio-handler";
import { useStore } from "@/lib/store";
import { ArrowLeft, Mic, Square, Upload, Flag, ChevronLeft, ChevronRight, Save, Check, BookOpen, Loader2, Eye, X, Trash2, Clock } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { createAudioAnalyzer, averageFeatures, type AudioFeatures, type MeydaAnalyzer } from "@/lib/audio-features";

interface LocalMarker {
  page: number;
  time: number;
  audioFeatures: AudioFeatures | null;
  triggerTokens?: string[];
  triggerConfidence?: number;
}


// Display sync bus: broadcast current PDF/page so remote Displays (TVs) stay in sync.
// Best-effort only; Live/Training UX must work even if the bus is offline.
async function publishPdfToBus(pdfPath: string, pdfId: string | null, totalPages?: number) {
  try {
    await fetch('/api/control/pdf/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdfPath, pdfId, totalPages }),
    });
  } catch {}
}

async function publishPageToBus(page: number, reason?: string, confidence?: number) {
  try {
    await fetch('/api/control/page/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page, reason, confidence }),
    });
  } catch {}
}

export default function Training() {
  const store = useStore();
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [markers, setMarkers] = useState<LocalMarker[]>([]);
  const [startTime, setStartTime] = useState<number>(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [numPages, setNumPages] = useState<number>(0);
  const [sessionName, setSessionName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [audioFiles, setAudioFiles] = useState<Array<{filename: string; path: string; sizeFormatted: string}>>([]);
  const [selectedAudioForLearning, setSelectedAudioForLearning] = useState<string>("");
  const [learningProgress, setLearningProgress] = useState<string>("");
  const [isLearning, setIsLearning] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [insightsData, setInsightsData] = useState<{
    pages: Array<{
      pageNumber: number;
      pdfText: string;
      learnedText: string;
      sessionCount: number;
      hasTraining: boolean;
      status: string;
    }>;
    summary: { totalPages: number; trainedPages: number; percentTrained: number };
  } | null>(null);
  const [selectedInsightPage, setSelectedInsightPage] = useState<number | null>(null);
  const [learningAttempts, setLearningAttempts] = useState<Array<{
    id: string;
    name: string | null;
    createdAt: string;
    pagesProcessed: number;
    status: string;
  }>>([]);
  const [selectedAttempt, setSelectedAttempt] = useState<string | null>(null);
  const [attemptPages, setAttemptPages] = useState<Array<{
    pageNumber: number;
    transcript: string;
    duration: number | null;
  }>>([]);
  
  const meydaAnalyzerRef = useRef<MeydaAnalyzer | null>(null);
  const recentFeaturesRef = useRef<AudioFeatures[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const learningAbortRef = useRef<AbortController | null>(null);
  const insightsPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<{blob: Blob; timestamp: number}[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRecording && startTime) {
      interval = setInterval(() => {
        setElapsedTime((Date.now() - startTime) / 1000);
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isRecording, startTime]);

  useEffect(() => {
    return () => {
      if (meydaAnalyzerRef.current) {
        meydaAnalyzerRef.current.stop();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    const fetchAudioFiles = async () => {
      try {
        const response = await fetch('/api/audio-files');
        const data = await response.json();
        if (data.audioFiles) {
          setAudioFiles(data.audioFiles);
        }
      } catch (error) {
        console.error('Failed to load audio files:', error);
      }
    };
    fetchAudioFiles();
  }, []);

  const fetchLearningInsights = async (openModal = true) => {
    if (!store.pdfFile) return;
    try {
      const response = await fetch(`/api/learning-progress?pdfPath=${encodeURIComponent(store.pdfFile)}`);
      const data = await response.json();
      setInsightsData(data);
      if (openModal) {
        setShowInsights(true);
        // Also fetch learning attempts when opening modal
        fetchLearningAttempts();
      }
    } catch (error) {
      console.error('Failed to fetch learning insights:', error);
      if (openModal) {
        toast({
          title: "Error",
          description: "Failed to load learning insights",
          variant: "destructive",
        });
      }
    }
  };

  const fetchLearningAttempts = async () => {
    if (!store.pdfFile) return;
    try {
      const response = await fetch(`/api/learning-attempts?pdfPath=${encodeURIComponent(store.pdfFile)}`);
      const data = await response.json();
      setLearningAttempts(data);
    } catch (error) {
      console.error('Failed to fetch learning attempts:', error);
    }
  };

  const fetchAttemptDetails = async (attemptId: string) => {
    try {
      const response = await fetch(`/api/learning-attempts/${attemptId}`);
      const data = await response.json();
      setAttemptPages(data.pages || []);
    } catch (error) {
      console.error('Failed to fetch attempt details:', error);
    }
  };

  const deleteAttempt = async (attemptId: string) => {
    try {
      await fetch(`/api/learning-attempts/${attemptId}`, { method: 'DELETE' });
      setLearningAttempts(prev => prev.filter(a => a.id !== attemptId));
      if (selectedAttempt === attemptId) {
        setSelectedAttempt(null);
        setAttemptPages([]);
      }
      toast({
        title: "Deleted",
        description: "Learning attempt deleted successfully",
      });
    } catch (error) {
      console.error('Failed to delete attempt:', error);
    }
  };

  const stopLearning = () => {
    if (learningAbortRef.current) {
      learningAbortRef.current.abort();
      learningAbortRef.current = null;
    }
    if (insightsPollingRef.current) {
      clearInterval(insightsPollingRef.current);
      insightsPollingRef.current = null;
    }
    setIsLearning(false);
    setLearningProgress("Learning stopped");
  };

  const learnFromRecording = async () => {
    if (!selectedAudioForLearning || !store.pdfFile) {
      toast({
        title: "Missing Information",
        description: "Please select an audio recording and ensure a PDF is loaded.",
        variant: "destructive",
      });
      return;
    }

    // Create abort controller for this request
    learningAbortRef.current = new AbortController();
    
    setIsLearning(true);
    setLearningProgress("Processing recording...");
    
    // Start polling for insights updates (refresh every 3 seconds)
    // Auto-open the insights modal so user can watch progress
    setShowInsights(true);
    insightsPollingRef.current = setInterval(() => {
      fetchLearningInsights(false);
    }, 3000);

    try {
      const response = await fetch('/api/process-training-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioPath: selectedAudioForLearning,
          pdfPath: store.pdfFile,
          pdfId: store.pdfId,
          startPage: 1,
          endPage: 182
        }),
        signal: learningAbortRef.current.signal
      });

      const data = await response.json();

      if (data.success) {
        setLearningProgress(`Learned ${data.pages.length} pages!`);
        toast({
          title: "Learning Complete",
          description: `Successfully learned pronunciation for ${data.pages.length} pages from your recording.`,
        });
        // Final refresh to show all learned pages and attempts
        fetchLearningInsights(false);
        fetchLearningAttempts();
      } else {
        throw new Error(data.error || 'Learning failed');
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // User stopped the learning - already handled in stopLearning
        return;
      }
      setLearningProgress("");
      toast({
        title: "Learning Failed",
        description: error instanceof Error ? error.message : "Failed to process recording",
        variant: "destructive",
      });
    } finally {
      setIsLearning(false);
      learningAbortRef.current = null;
      if (insightsPollingRef.current) {
        clearInterval(insightsPollingRef.current);
        insightsPollingRef.current = null;
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    
    setUploading(true);
    const formData = new FormData();
    formData.append('audio', selectedFile);

    try {
      const response = await fetch('/api/upload/audio', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "Upload Complete",
          description: `Successfully uploaded ${data.file.originalName}. Audio saved for training.`,
        });
        setSelectedFile(null);
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload audio",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const startRecording = async () => {
    if (!store.pdfFile) {
      toast({
        title: "No PDF Loaded",
        description: "Please upload a Badarak PDF from the Home page first.",
        variant: "destructive",
      });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      
      audioContextRef.current = new AudioContext();
      // Ensure AudioContext is running (Chrome/Safari suspend by default)
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
        console.log("[Training] AudioContext resumed from suspended state");
      }
      sourceNodeRef.current = audioContextRef.current.createMediaStreamSource(stream);

      const analyserNode = audioContextRef.current.createAnalyser();
      analyserNode.fftSize = 2048;
      sourceNodeRef.current.connect(analyserNode);

      recentFeaturesRef.current = [];
      let featureCount = 0;
      meydaAnalyzerRef.current = createAudioAnalyzer(
        audioContextRef.current,
        sourceNodeRef.current,
        (features) => {
          featureCount++;
          if (featureCount === 1) console.log("[Training] First Meyda features:", features.rms > 0 ? "REAL DATA" : "ZEROS — check mic");
          recentFeaturesRef.current.push(features);
          if (recentFeaturesRef.current.length > 20) {
            recentFeaturesRef.current.shift();
          }
        }
      );
      meydaAnalyzerRef.current.start();
      console.log(`[Training] Meyda started, AudioContext: ${audioContextRef.current.state}`);
      
      // Set up MediaRecorder for capturing audio chunks (for trigger word extraction)
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push({
            blob: event.data,
            timestamp: Date.now()
          });
          // Keep only last 10 seconds of chunks (at 500ms each = 20 chunks)
          if (audioChunksRef.current.length > 20) {
            audioChunksRef.current.shift();
          }
        }
      };
      
      // Record in 500ms chunks for fine-grained buffer extraction
      mediaRecorder.start(500);
      
      await audioHandler.startRecording();
      setAnalyser(audioHandler.getAnalyser());
      setIsRecording(true);
      setStartTime(Date.now());
      setMarkers([]);
      setSaved(false);
      store.setPage(1);
      publishPageToBus(1, 'training_start', 1.0);
    } catch (e) {
      console.error(e);
      toast({
        title: "Microphone Error",
        description: "Could not access microphone. Please allow microphone access.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (meydaAnalyzerRef.current) {
      meydaAnalyzerRef.current.stop();
      meydaAnalyzerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    audioChunksRef.current = [];
    audioHandler.stopRecording();
    setIsRecording(false);
    toast({
      title: "Recording Complete",
      description: `Captured ${markers.length} page markers with audio features and trigger words. Don't forget to save!`,
    });
  };

  const markPageTurn = async () => {
    const time = (Date.now() - startTime) / 1000;
    
    const features = recentFeaturesRef.current.length > 0 
      ? averageFeatures(recentFeaturesRef.current.slice(-10))
      : null;
    
    // Extract last 3 seconds of audio for trigger word transcription
    const now = Date.now();
    const threeSecondsAgo = now - 3000;
    const recentChunks = audioChunksRef.current.filter(c => c.timestamp >= threeSecondsAgo);
    
    // Create the marker immediately with pending trigger status
    const newMarker: LocalMarker = { 
      page: store.currentPage, 
      time, 
      audioFeatures: features,
      triggerTokens: undefined,
      triggerConfidence: undefined
    };
    
    const markerIndex = markers.length;
    setMarkers(prev => [...prev, newMarker]);
    store.nextPage();
    publishPageToBus(store.currentPage + 1, 'training_mark', 1.0);

    if (features) {
      console.log('Captured audio features at marker:', features.rms.toFixed(4), features.spectralCentroid.toFixed(0));
    }
    
    // Transcribe audio in background to get trigger words
    if (recentChunks.length > 0) {
      try {
        const audioBlob = new Blob(recentChunks.map(c => c.blob), { type: 'audio/webm' });
        const arrayBuffer = await audioBlob.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        
        const response = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            audioBase64: base64,
            mimeType: 'audio/webm'
          })
        });
        
        const data = await response.json();
        const transcript = data.transcript || '';
        
        if (transcript && transcript !== '[silence]' && transcript !== '[error]') {
          // Extract last 5 words as trigger tokens
          const words = transcript.toLowerCase().split(/\s+/).filter((w: string) => w.length > 0);
          const triggerTokens = words.slice(-5);
          
          // Update the marker with trigger words
          setMarkers(prev => {
            const updated = [...prev];
            if (updated[markerIndex]) {
              updated[markerIndex] = {
                ...updated[markerIndex],
                triggerTokens,
                triggerConfidence: 0.8 // Default confidence for new triggers
              };
            }
            return updated;
          });
          
          console.log('Captured trigger words:', triggerTokens.join(', '));
        }
      } catch (error) {
        console.error('Failed to transcribe trigger audio:', error);
      }
    }
  };

  const handlePdfLoad = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    store.setPage(1);
    if (store.pdfFile) {
      publishPdfToBus(store.pdfFile, store.pdfId ?? null, numPages);
      publishPageToBus(1, 'training_pdf_loaded', 1.0);
    }
  };

  const saveTrainingSession = async () => {
    if (markers.length === 0) {
      toast({
        title: "No Markers",
        description: "Record and mark some page turns before saving.",
        variant: "destructive",
      });
      return;
    }

    if (!sessionName.trim()) {
      toast({
        title: "Name Required",
        description: "Please enter a name for this training session.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/training-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: sessionName.trim(),
          pdfPath: store.pdfFile || '/uploads/pdfs/7ad0d220e9292f359b6cb0949e923a03.pdf',
          pdfId: store.pdfId,
          totalPages: numPages || 183,
          markers: markers.map(m => ({
            pageNumber: m.page,
            timestampMs: Math.round(m.time * 1000),
            audioFeatures: m.audioFeatures,
            triggerTokens: m.triggerTokens,
            triggerConfidence: m.triggerConfidence,
          })),
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Auto-merge into aggregated fingerprints for multi-session learning
        try {
          await fetch('/api/aggregated-fingerprints/merge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: data.session.id }),
          });
        } catch (mergeError) {
          console.error('Failed to merge fingerprints:', mergeError);
        }
        
        setSaved(true);
        toast({
          title: "Training Saved & Merged!",
          description: `Session "${sessionName}" saved and merged into master fingerprints. More training sessions = better accuracy!`,
        });
      } else {
        throw new Error(data.error || 'Save failed');
      }
    } catch (error) {
      toast({
        title: "Save Failed",
        description: error instanceof Error ? error.message : "Failed to save training session",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/">
          <Button variant="outline" size="sm" data-testid="button-back">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Training Mode</h1>
        {isRecording && (
          <div className="ml-auto flex items-center gap-2 text-red-500">
            <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
            <span className="font-mono text-lg">{formatTime(elapsedTime)}</span>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="glass-panel h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>PDF Preview</CardTitle>
                  <CardDescription>Follow along as you mark page turns</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => { store.prevPage(); publishPageToBus(store.currentPage - 1, 'training_prev', 1.0); }}
                    disabled={store.currentPage <= 1}
                    data-testid="button-prev-page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium min-w-[100px] text-center">
                    Page {store.currentPage} {numPages > 0 && `of ${numPages}`}
                  </span>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => { store.nextPage(); publishPageToBus(store.currentPage + 1, 'training_next', 1.0); }}
                    disabled={numPages > 0 && store.currentPage >= numPages}
                    data-testid="button-next-page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <PdfViewport 
                onLoadSuccess={handlePdfLoad}
                showPageNumber={false}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="glass-panel">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recording Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-center gap-2">
                <Button 
                  onClick={startRecording} 
                  disabled={isRecording || !store.pdfFile}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  data-testid="button-start-recording"
                >
                  <Mic className="mr-1 h-4 w-4" /> Record
                </Button>
                <Button 
                  onClick={stopRecording} 
                  disabled={!isRecording}
                  size="sm"
                  variant="destructive"
                  data-testid="button-stop-recording"
                >
                  <Square className="mr-1 h-4 w-4 fill-current" /> Stop
                </Button>
              </div>

              <AudioVisualizer analyser={analyser} isActive={isRecording} height={50} />

              <Button 
                onClick={markPageTurn} 
                disabled={!isRecording} 
                className="w-full bg-blue-600 hover:bg-blue-700 h-12"
                data-testid="button-mark-page"
              >
                <Flag className="mr-2 h-4 w-4" /> Mark Turn ({store.currentPage} → {store.currentPage + 1})
              </Button>

              {!store.pdfFile && (
                <p className="text-xs text-amber-600 text-center">
                  Upload a PDF from Home first.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Markers ({markers.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {markers.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  Press "Mark Turn" when page changes.
                </p>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {markers.map((m, i) => (
                    <div key={i} className="rounded border bg-white p-2 text-sm dark:bg-gray-800" data-testid={`marker-${i}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-primary">P{m.page}→{m.page + 1}</span>
                        <div className="flex items-center gap-2">
                          {m.audioFeatures && (
                            <span className="text-xs text-emerald-600">audio</span>
                          )}
                          {m.triggerTokens && m.triggerTokens.length > 0 && (
                            <span className="text-xs text-purple-600">triggers</span>
                          )}
                          <span className="font-mono text-xs text-gray-500">{formatTime(m.time)}</span>
                        </div>
                      </div>
                      {m.triggerTokens && m.triggerTokens.length > 0 && (
                        <div className="mt-1 text-xs text-muted-foreground italic truncate">
                          "{m.triggerTokens.join(' ')}"
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className={`glass-panel ${saved ? 'border-emerald-500 border-2' : ''}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                Save Training
                {saved && <Check className="h-4 w-4 text-emerald-500" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input
                placeholder="Session name (e.g., Sunday Liturgy)"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                className="text-sm"
                data-testid="input-session-name"
              />
              <Button 
                onClick={saveTrainingSession} 
                disabled={markers.length === 0 || saving || saved}
                size="sm"
                className="w-full bg-purple-600 hover:bg-purple-700"
                data-testid="button-save-session"
              >
                <Save className="mr-2 h-4 w-4" /> 
                {saving ? 'Saving...' : saved ? 'Saved!' : 'Save for Live Mode'}
              </Button>
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Upload Audio</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Input 
                  type="file" 
                  accept="audio/*" 
                  onChange={handleFileSelect}
                  disabled={uploading}
                  className="text-sm"
                  data-testid="input-audio-file"
                />
                <Button onClick={handleUpload} disabled={!selectedFile || uploading} size="sm" className="w-full" data-testid="button-upload-audio">
                  <Upload className="mr-2 h-4 w-4" /> {uploading ? 'Uploading...' : 'Upload'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel border-amber-500 border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Learn from Recording
              </CardTitle>
              <CardDescription className="text-xs">
                Process a training recording to learn how words are pronounced
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Select 
                value={selectedAudioForLearning} 
                onValueChange={setSelectedAudioForLearning}
                disabled={isLearning || audioFiles.length === 0}
              >
                <SelectTrigger className="text-sm" data-testid="select-audio-learning">
                  <SelectValue placeholder={audioFiles.length === 0 ? "No recordings available" : "Select a recording"} />
                </SelectTrigger>
                <SelectContent>
                  {audioFiles.map((file) => (
                    <SelectItem key={file.path} value={file.path}>
                      {file.filename} ({file.sizeFormatted})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button 
                  onClick={learnFromRecording} 
                  disabled={!selectedAudioForLearning || isLearning || !store.pdfFile}
                  size="sm"
                  className="flex-1 bg-amber-600 hover:bg-amber-700"
                  data-testid="button-learn-recording"
                >
                  {isLearning ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Learning...
                    </>
                  ) : (
                    <>
                      <BookOpen className="mr-2 h-4 w-4" />
                      Learn Pronunciation
                    </>
                  )}
                </Button>
                {isLearning && (
                  <Button 
                    onClick={stopLearning}
                    size="sm"
                    variant="destructive"
                    data-testid="button-stop-learning"
                  >
                    <Square className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {learningProgress && (
                <p className="text-xs text-center text-emerald-600">{learningProgress}</p>
              )}
              <Button 
                onClick={() => fetchLearningInsights(true)} 
                disabled={!store.pdfFile}
                size="sm"
                variant="outline"
                className="w-full"
                data-testid="button-view-learning"
              >
                <Eye className="mr-2 h-4 w-4" />
                View What I Learned
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Learning Insights Modal */}
      {showInsights && insightsData && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-4xl max-h-[80vh] overflow-hidden bg-white dark:bg-gray-900">
            <CardHeader className="pb-2 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  Learning Insights
                  {isLearning && <Loader2 className="h-4 w-4 animate-spin text-amber-500" />}
                </CardTitle>
                <CardDescription>
                  {insightsData.summary.trainedPages} of {insightsData.summary.totalPages} pages trained ({insightsData.summary.percentTrained}%)
                  {isLearning && <span className="text-amber-500 ml-2">- Learning in progress...</span>}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {isLearning && (
                  <Button variant="destructive" size="sm" onClick={stopLearning} data-testid="button-stop-learning-modal">
                    <Square className="h-4 w-4 mr-1" /> Stop
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setShowInsights(false)} data-testid="button-close-insights">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Tabs defaultValue="combined" className="h-[60vh]">
                <div className="border-b px-4 pt-2">
                  <TabsList>
                    <TabsTrigger value="combined">Combined View</TabsTrigger>
                    <TabsTrigger value="attempts">Learning Attempts ({learningAttempts.length})</TabsTrigger>
                  </TabsList>
                </div>
                
                <TabsContent value="combined" className="h-[calc(100%-48px)] mt-0">
                  <div className="flex h-full">
                    {/* Page List */}
                    <ScrollArea className="w-1/3 border-r">
                      <div className="p-2 space-y-1">
                        {insightsData.pages.map((page) => (
                          <button
                            key={page.pageNumber}
                            onClick={() => setSelectedInsightPage(page.pageNumber)}
                            className={`w-full text-left px-3 py-2 rounded text-sm flex items-center justify-between
                              ${selectedInsightPage === page.pageNumber ? 'bg-blue-100 dark:bg-blue-900' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}
                              ${page.hasTraining ? 'border-l-4 border-green-500' : 'border-l-4 border-gray-300'}`}
                            data-testid={`insight-page-${page.pageNumber}`}
                          >
                            <span>Page {page.pageNumber}</span>
                            {page.hasTraining && (
                              <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">Trained</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </ScrollArea>

                    {/* Page Details */}
                    <div className="flex-1 p-4 overflow-auto">
                      {selectedInsightPage ? (
                        (() => {
                          const page = insightsData.pages.find(p => p.pageNumber === selectedInsightPage);
                          if (!page) return <p>Select a page</p>;
                          return (
                            <div className="space-y-4">
                              <h3 className="font-bold text-lg">Page {page.pageNumber}</h3>
                              
                              <div>
                                <h4 className="font-medium text-sm text-gray-600 mb-1">PDF Text (what's written):</h4>
                                <pre className="bg-gray-50 dark:bg-gray-800 p-3 rounded text-sm max-h-48 overflow-auto whitespace-pre-wrap break-words font-sans leading-relaxed" data-testid="insight-pdf-text">
                                  {page.pdfText || <span className="text-gray-400 italic">No text extracted</span>}
                                </pre>
                              </div>
                              
                              <div>
                                <h4 className="font-medium text-sm text-amber-600 mb-1">Learned from Audio (what I heard):</h4>
                                <pre className={`p-3 rounded text-sm max-h-48 overflow-auto whitespace-pre-wrap break-words font-sans leading-relaxed ${page.learnedText ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-gray-50 dark:bg-gray-800'}`} data-testid="insight-learned-text">
                                  {page.learnedText || <span className="text-gray-400 italic">Not trained yet - process a recording to learn this page</span>}
                                </pre>
                              </div>
                              
                              <div className="text-xs text-gray-500">
                                Training sessions: {page.sessionCount}
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        <div className="text-center text-gray-400 py-8">
                          <p>Select a page to see what was learned</p>
                          <p className="text-xs mt-2">Pages with green border have been trained</p>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="attempts" className="h-[calc(100%-48px)] mt-0">
                  <div className="flex h-full">
                    {/* Attempts List */}
                    <ScrollArea className="w-1/3 border-r">
                      <div className="p-2 space-y-1">
                        {learningAttempts.length === 0 ? (
                          <p className="text-sm text-gray-400 p-3 text-center">No learning attempts yet. Run "Learn Pronunciation" to create one.</p>
                        ) : (
                          learningAttempts.map((attempt) => (
                            <div
                              key={attempt.id}
                              className={`w-full text-left px-3 py-2 rounded text-sm border-l-4 
                                ${selectedAttempt === attempt.id ? 'bg-blue-100 dark:bg-blue-900 border-blue-500' : 'hover:bg-gray-100 dark:hover:bg-gray-800 border-gray-300'}`}
                            >
                              <button
                                onClick={() => {
                                  setSelectedAttempt(attempt.id);
                                  fetchAttemptDetails(attempt.id);
                                }}
                                className="w-full text-left"
                                data-testid={`attempt-${attempt.id}`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-medium truncate">{attempt.name || 'Unnamed'}</span>
                                  <span className={`text-xs px-2 py-0.5 rounded ${attempt.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                                    {attempt.pagesProcessed} pages
                                  </span>
                                </div>
                                <div className="flex items-center text-xs text-gray-500 mt-1">
                                  <Clock className="h-3 w-3 mr-1" />
                                  {new Date(attempt.createdAt).toLocaleString()}
                                </div>
                              </button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="mt-1 h-6 text-xs text-red-500 hover:text-red-700"
                                onClick={() => deleteAttempt(attempt.id)}
                                data-testid={`delete-attempt-${attempt.id}`}
                              >
                                <Trash2 className="h-3 w-3 mr-1" /> Delete
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>

                    {/* Attempt Details */}
                    <div className="flex-1 p-4 overflow-auto">
                      {selectedAttempt && attemptPages.length > 0 ? (
                        <div className="space-y-4">
                          <h3 className="font-bold text-lg">
                            Attempt: {learningAttempts.find(a => a.id === selectedAttempt)?.name || 'Unnamed'}
                          </h3>
                          <p className="text-sm text-gray-500">
                            {attemptPages.length} pages transcribed in this attempt
                          </p>
                          
                          <div className="space-y-3">
                            {attemptPages.map((page) => (
                              <div key={page.pageNumber} className="border rounded p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-medium">Page {page.pageNumber}</span>
                                  {page.duration && (
                                    <span className="text-xs text-gray-500">{page.duration.toFixed(1)}s</span>
                                  )}
                                </div>
                                <pre className="bg-amber-50 dark:bg-amber-900/20 p-2 rounded text-sm whitespace-pre-wrap break-words font-sans leading-relaxed">
                                  {page.transcript}
                                </pre>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center text-gray-400 py-8">
                          <p>Select a learning attempt to see what was transcribed</p>
                          <p className="text-xs mt-2">Each attempt represents a separate "Learn from Recording" run</p>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
