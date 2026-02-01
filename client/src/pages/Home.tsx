import { Link } from "wouter";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { Music, Mic, Monitor, Play, Upload } from "lucide-react";
import { useState } from "react";

async function safeJson(res: Response) {
  const text = await res.text();
  if (!text) return { __empty: true };
  try {
    return JSON.parse(text);
  } catch {
    return { __notJson: true, raw: text.slice(0, 500) };
  }
}

async function uploadPdf(file: File) {
  const form = new FormData();
  form.append("pdf", file); // IMPORTANT: must match backend field name

  const res = await fetch("/api/upload-pdf", {
    method: "POST",
    body: form,
  });

  const data = await safeJson(res);

  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) ||
      (data?.__notJson ? `Server returned non-JSON: ${data.raw}` : null) ||
      (data?.__empty ? "Server returned empty response (likely crashed)." : null) ||
      `Upload failed (HTTP ${res.status})`;

    throw new Error(msg);
  }

  // expected shape: { ok: true, pdf: { pdfId, path, originalName, numPages? } }
  if (!data?.ok || !data?.pdf?.path) {
    throw new Error("Upload succeeded but response shape was unexpected.");
  }

  return data.pdf;
}

async function fetchPdfPages(pdfPath: string) {
  const res = await fetch(`/api/pdf-text?path=${encodeURIComponent(pdfPath)}`);
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data?.error || "Failed to load PDF text");
  return data as {
    ok: true;
    pdf: { pdfId: string; path: string; numPages: number };
    pages: { pageNumber: number; pageId: string; norm: string }[];
  };
}

export default function Home() {
  const store = useStore();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  const handleSaveDisplayConfig = () => {
    toast({
      title: "Configuration Saved",
      description: "Display settings have been updated.",
    });
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);

    try {
      const pdf = await uploadPdf(file);
      useStore.getState().setPdfFromServer(pdf.path, pdf.pdfId);
      // Publish to display sync bus so TVs update immediately
      try {
        await fetch('/api/control/pdf/set', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfPath: pdf.path, pdfId: pdf.pdfId ?? null }),
        });
      } catch {}
      toast({ title: "Upload complete", description: pdf.originalName });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Upload Failed", description: e.message || "Unknown error" });
    } finally {
      setUploading(false);
      // Reset input
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100">Armenian Liturgy Turner</h1>
        <p className="mt-2 text-gray-500">Automated page turning for church services</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Setup Section */}
        <Card className="glass-panel border-l-4 border-l-primary">
          <CardHeader>
            <CardTitle>Liturgy Configuration</CardTitle>
            <CardDescription>Upload your Badarak PDF file for projection</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center dark:border-gray-700 dark:bg-gray-800">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
                <Upload className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <p className="mb-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                {store.pdfFile?.startsWith('/uploads/') ? 'Custom PDF Uploaded' : 'Using Pre-loaded PDF'}
              </p>
              <p className="text-xs text-gray-500">
                Liturgy PDF is loaded and ready for projection.
                <br />
                Page transitions are synced with audio.
              </p>
            </div>
            
            <div className="space-y-2">
               <label className="text-sm font-medium">Upload Custom PDF</label>
               <div className="flex gap-2">
                 <input 
                   type="file" 
                   accept="application/pdf"
                   onChange={handlePdfUpload}
                   disabled={uploading}
                   className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                 />
               </div>
               {uploading && (
                 <p className="text-xs text-blue-600">Uploading...</p>
               )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Active PDF File</label>
              <div className="rounded-md border bg-gray-50 p-2 text-sm dark:bg-gray-800">
                {store.pdfFile?.startsWith('/uploads/') 
                  ? store.pdfFile.split('/').pop() 
                  : 'liturgy.pdf (default)'}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Modes Section */}
        <Card className="glass-panel border-l-4 border-l-purple-500">
          <CardHeader>
            <CardTitle>Modes</CardTitle>
            <CardDescription>Select operation mode</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <Link href="/playback">
              <Button className="h-24 w-full flex-col gap-2 bg-purple-600 hover:bg-purple-700" variant="default">
                <Music className="h-8 w-8" />
                Playback
              </Button>
            </Link>
            <Link href="/training">
              <Button className="h-24 w-full flex-col gap-2 bg-amber-600 hover:bg-amber-700" variant="default">
                <Mic className="h-8 w-8" />
                Training
              </Button>
            </Link>
            <Link href="/live">
              <Button className="h-24 w-full flex-col gap-2 bg-emerald-600 hover:bg-emerald-700" variant="default">
                <Play className="h-8 w-8" />
                Live Mode
              </Button>
            </Link>
            <Link href="/display" target="_blank">
              <Button className="h-24 w-full flex-col gap-2 bg-blue-500 hover:bg-blue-600" variant="default">
                <Monitor className="h-8 w-8" />
                Projection
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Display Settings */}
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Display Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Display Mode</label>
              <Select 
                value={store.displayMode} 
                onValueChange={(val: 'text' | 'pdf') => store.setDisplayConfig(val, store.pdfFile)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF (Page images)</SelectItem>
                  <SelectItem value="text">Text (Armenian/English)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <Button onClick={handleSaveDisplayConfig} variant="outline" className="w-full">
              Save Display Settings
            </Button>
          </CardContent>
        </Card>

        {/* Stats & Settings */}
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Statistics & Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
             <div className="grid grid-cols-3 text-center">
               <div>
                 <p className="text-sm text-gray-500">Total Pages</p>
                 <p className="text-2xl font-bold text-primary">{store.totalPages}</p>
               </div>
               <div>
                 <p className="text-sm text-gray-500">Trained</p>
                 <p className="text-2xl font-bold text-primary">0</p>
               </div>
               <div>
                 <p className="text-sm text-gray-500">Current</p>
                 <p className="text-2xl font-bold text-primary">{store.currentPage}</p>
               </div>
             </div>
             
             <div className="space-y-2">
               <div className="flex justify-between">
                 <label className="text-sm font-medium">Match Threshold</label>
                 <span className="text-sm font-bold text-primary">{store.matchThreshold}</span>
               </div>
               <Slider 
                 value={[store.matchThreshold]} 
                 min={0.5} 
                 max={1.0} 
                 step={0.05} 
                 onValueChange={(vals) => store.setThreshold(vals[0])}
               />
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
