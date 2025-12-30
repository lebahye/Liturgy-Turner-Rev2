import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AudioVisualizer } from "@/components/AudioVisualizer";
import { PdfViewport } from "@/components/PdfViewport";
import { audioHandler } from "@/lib/audio-handler";
import { speechMatcher } from "@/lib/speech-matcher";
import { type AudioFeatures } from "@/lib/audio-features";

interface PageMarkerData {
  pageNumber: number;
  timestampMs: number;
  audioFeatures: AudioFeatures;
}
import { useStore } from "@/lib/store";
import { ArrowLeft, Play, Square, ChevronLeft, ChevronRight, AlertCircle, RefreshCw, Volume2, TrendingUp, Layers, Clock, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";

interface TrainingStats {
  totalSessions: number;
  pagesWithData: number;
  averageConfidence: number;
  pageStats: Array<{
    pageNumber: number;
    sessionCount: number;
    confidence: number;
    averageTimestampMs: number;
  }>;
}

interface AggregatedFingerprint {
  pageNumber: number;
  sessionCount: number;
  averageTimestampMs: number;
  averagedFeatures: any;
  confidence: number;
}

export default function Live() {
  const store = useStore();
  const { toast } = useToast();
  const [isActive, setIsActive] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [numPages, setNumPages] = useState(0);
  const [markers, setMarkers] = useState<PageMarkerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [trainingStats, setTrainingStats] = useState<TrainingStats | null>(null);
  const [hasTranscripts, setHasTranscripts] = useState(false);
  const [transcriptCount, setTranscriptCount] = useState(0);
  const [lastTranscript, setLastTranscript] = useState("");
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    loadTrainingData();
  }, [store.pdfFile]);

  const startTimeRef = useRef<number>(0);
  
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isActive) {
      interval = setInterval(() => {
        setElapsedTime((Date.now() - startTimeRef.current) / 1000);
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isActive]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    speechMatcher.stop();
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const loadTrainingData = async () => {
    if (!store.pdfFile) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [fingerprintsRes, statsRes, transcriptsLoaded] = await Promise.all([
        fetch(`/api/aggregated-fingerprints?pdfPath=${encodeURIComponent(store.pdfFile)}`),
        fetch(`/api/training-stats?pdfPath=${encodeURIComponent(store.pdfFile)}`),
        speechMatcher.loadTranscripts(store.pdfFile, store.pdfId || undefined)
      ]);
      
      const fingerprintsData = await fingerprintsRes.json();
      const statsData = await statsRes.json();
      
      if (statsData.totalSessions !== undefined) {
        setTrainingStats(statsData);
      }
      
      if (fingerprintsData.fingerprints && fingerprintsData.fingerprints.length > 0) {
        const aggregatedMarkers: PageMarkerData[] = fingerprintsData.fingerprints.map((f: AggregatedFingerprint) => ({
          pageNumber: f.pageNumber,
          timestampMs: f.averageTimestampMs,
          audioFeatures: f.averagedFeatures,
        }));
        setMarkers(aggregatedMarkers);
      }

      if (!transcriptsLoaded && store.pdfFile) {
        console.log('No transcripts found, extracting from PDF...');
        try {
          const extractRes = await fetch('/api/extract-pdf-text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pdfPath: store.pdfFile })
          });
          const extractData = await extractRes.json();
          if (extractData.success) {
            console.log(`Extracted text from ${extractData.pages?.length || 0} pages`);
            await speechMatcher.loadTranscripts(store.pdfFile, store.pdfId || undefined);
            setHasTranscripts(speechMatcher.hasTranscripts());
            setTranscriptCount(speechMatcher.getTranscriptCount());
            return;
          }
        } catch (extractError) {
          console.error('Failed to extract PDF text:', extractError);
        }
      }

      setHasTranscripts(transcriptsLoaded);
      setTranscriptCount(speechMatcher.getTranscriptCount());
    } catch (error) {
      console.error('Failed to load training data:', error);
    } finally {
      setLoading(false);
    }
  };

  const startLive = async () => {
    if (!store.pdfFile) {
      toast({
        title: "No PDF Loaded",
        description: "Please upload a Badarak PDF from the Home page first.",
        variant: "destructive",
      });
      return;
    }

    if (!hasTranscripts && markers.length === 0) {
      toast({
        title: "No Training Data",
        description: "Please complete training mode first to mark page turns.",
        variant: "destructive",
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      audioContextRef.current = new AudioContext();
      sourceNodeRef.current = audioContextRef.current.createMediaStreamSource(stream);
      
      const analyserNode = audioContextRef.current.createAnalyser();
      analyserNode.fftSize = 2048;
      sourceNodeRef.current.connect(analyserNode);
      setAnalyser(analyserNode);
      
      speechMatcher.setCallbacks(
        (page: number, conf: number) => {
          store.setPage(page);
          setConfidence(conf);
          toast({
            title: `Page ${page}`,
            description: `Speech-matched with ${conf.toFixed(0)}% confidence`,
          });
        },
        (text: string) => {
          setLastTranscript(text);
        }
      );
      
      speechMatcher.setCurrentPage(1);
      await speechMatcher.start(stream);
      
      await audioHandler.startRecording();
      setIsActive(true);
      store.setPage(1);
      startTimeRef.current = Date.now();

    } catch (e) {
      console.error(e);
      toast({
        title: "Microphone Error",
        description: "Could not access microphone. Please allow microphone access.",
        variant: "destructive",
      });
    }
  };

  const stopLive = () => {
    cleanup();
    audioHandler.stopRecording();
    setIsActive(false);
    setConfidence(0);
    setLastTranscript("");
    setAnalyser(null);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        store.nextPage();
      } else if (e.code === 'KeyB') {
        store.prevPage();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [store]);

  const handlePdfLoad = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getConfidenceColor = (conf: number) => {
    if (conf >= 80) return "text-emerald-600";
    if (conf >= 60) return "text-amber-600";
    return "text-gray-400";
  };

  const getConfidenceLabel = (conf: number) => {
    if (conf >= 80) return "Strong";
    if (conf >= 60) return "Moderate";
    if (conf >= 40) return "Weak";
    return "Needs Training";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/">
          <Button variant="outline" size="sm" data-testid="button-back">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Live Mode</h1>
        {isActive && (
          <div className="ml-auto flex items-center gap-2 text-emerald-500">
            <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono text-lg">{formatTime(elapsedTime)}</span>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          {!store.pdfFile ? (
            <Card className="glass-panel border-amber-500 border-2">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-amber-600 mb-2">
                  <AlertCircle className="h-5 w-5" />
                  <span className="font-medium">No PDF Loaded</span>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  Upload a Badarak PDF from the Home page first.
                </p>
                <Link href="/">
                  <Button size="sm" className="w-full">Go to Home</Button>
                </Link>
              </CardContent>
            </Card>
          ) : trainingStats && trainingStats.totalSessions === 0 ? (
            <Card className="glass-panel border-amber-500 border-2">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-amber-600 mb-2">
                  <AlertCircle className="h-5 w-5" />
                  <span className="font-medium">No Training Data</span>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  Complete Training Mode first to mark page turns, then return here for automatic page turning.
                </p>
                <Link href="/training">
                  <Button size="sm" className="w-full">Go to Training Mode</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <Card className="glass-panel">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Layers className="h-4 w-4" />
                    Training Status
                  </span>
                  <Button variant="ghost" size="sm" onClick={loadTrainingData} data-testid="button-refresh">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {trainingStats && (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Training Sessions:</span>
                      <span className="font-bold text-primary">{trainingStats.totalSessions}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Pages Trained:</span>
                      <span className="font-bold">{trainingStats.pagesWithData}</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Overall Confidence:</span>
                        <span className={cn("font-bold", getConfidenceColor(trainingStats.averageConfidence))}>
                          {trainingStats.averageConfidence.toFixed(0)}% - {getConfidenceLabel(trainingStats.averageConfidence)}
                        </span>
                      </div>
                      <Progress value={trainingStats.averageConfidence} className="h-2" />
                    </div>
                    
                    {trainingStats.totalSessions < 3 && (
                      <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded p-2">
                        <TrendingUp className="h-3 w-3" />
                        <span>Train {3 - trainingStats.totalSessions} more time(s) for better accuracy</span>
                      </div>
                    )}
                  </>
                )}
                
                {(markers.length > 0 || hasTranscripts) && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{markers.length} page markers loaded</span>
                    {hasTranscripts && (
                      <span className="flex items-center gap-1 text-blue-600">
                        <MessageSquare className="h-3 w-3" />
                        {transcriptCount} transcripts
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="glass-panel">
            <CardContent className="pt-4 space-y-3">
              <div className="flex justify-center gap-2">
                <Button 
                  onClick={startLive} 
                  disabled={isActive || !store.pdfFile || (!hasTranscripts && markers.length === 0)}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  data-testid="button-start"
                >
                  <Play className="mr-1 h-4 w-4" /> Start
                </Button>
                <Button 
                  onClick={stopLive} 
                  disabled={!isActive}
                  size="sm"
                  variant="destructive"
                  data-testid="button-stop"
                >
                  <Square className="mr-1 h-4 w-4 fill-current" /> Stop
                </Button>
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <div className={cn(
                  "flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium",
                  isActive ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-500"
                )}>
                  <div className={cn("h-2 w-2 rounded-full", isActive ? "animate-pulse bg-emerald-500" : "bg-gray-400")} />
                  {isActive ? "Listening" : "Stopped"}
                </div>
                
                <div className="flex flex-col items-end text-xs">
                  <span className={cn(
                    "font-bold",
                    confidence > 60 ? "text-emerald-600" : confidence > 45 ? "text-amber-600" : "text-gray-400"
                  )}>
                    {isActive ? `${confidence.toFixed(0)}% confidence` : "--"}
                  </span>
                </div>
              </div>

              <AudioVisualizer analyser={analyser} isActive={isActive} height={60} />

              {isActive && lastTranscript && (
                <div className="text-xs text-blue-600 text-center bg-blue-50 rounded p-2">
                  <MessageSquare className="h-3 w-3 inline mr-1" />
                  {lastTranscript.substring(0, 100)}{lastTranscript.length > 100 ? '...' : ''}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardContent className="pt-4">
              <h3 className="mb-3 text-center text-sm font-medium text-gray-500">Manual Controls</h3>
              <div className="flex flex-col gap-2">
                <Button 
                  onClick={store.prevPage} 
                  variant="outline" 
                  size="sm"
                  disabled={store.currentPage <= 1}
                  data-testid="button-prev"
                >
                  <ChevronLeft className="mr-1 h-4 w-4" /> Previous (B)
                </Button>
                <Button 
                  onClick={store.nextPage} 
                  variant="outline" 
                  size="sm"
                  disabled={numPages > 0 && store.currentPage >= numPages}
                  data-testid="button-next"
                >
                  Next (Space) <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="glass-panel lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between">
              <span>PDF Display</span>
              <span className="text-sm font-normal text-gray-500">
                Page {store.currentPage} {numPages > 0 && `of ${numPages}`}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PdfViewport 
              onLoadSuccess={handlePdfLoad}
              showPageNumber={false}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
