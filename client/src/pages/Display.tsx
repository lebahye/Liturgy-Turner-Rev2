import { useStore } from "@/lib/store";
import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function Display() {
  const store = useStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  // Track container size so we can fit the PDF page exactly on screen
  useEffect(() => {
    const update = () => {
      const el = containerRef.current;
      if (!el) return;
      setBox({ w: el.clientWidth, h: el.clientHeight });
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

  // Always use the PDF exactly as uploaded (no conversion)
  const pdfSrc = useMemo(() => {
    if (!store.pdfFile) return null;
    if (store.pdfFile.startsWith("blob:")) return store.pdfFile;
    if (store.pdfFile.startsWith("/")) return store.pdfFile;
    return `/${store.pdfFile}`;
  }, [store.pdfFile]);

  // Space = next page, B = back
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

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    // CRITICAL: the PDF decides how many pages exist
    store.setTotalPagesFromPdf(numPages);
  }

  return (
    <div ref={containerRef} className="flex h-screen w-screen items-center justify-center bg-black">
      {!pdfSrc ? (
        <div className="text-center text-white">
          <div className="text-4xl text-gray-300 mb-4">Waiting for PDF</div>
          <div className="text-xl text-gray-400">The laptop will select a PDF shortly. This screen will update automatically.</div>
        </div>
      ) : (
        <div className="relative h-full w-full overflow-hidden">
          <div className="absolute top-3 right-4 z-10 rounded-full bg-black/70 px-4 py-2 text-white text-sm font-semibold">
            Page {store.currentPage} / {store.totalPages}
          </div>

          <Document
            file={pdfSrc}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={(err) => console.error("PDF load error:", err)}
            loading={<div className="flex h-full w-full items-center justify-center text-white text-2xl">Loading PDF...</div>}
            error={<div className="flex h-full w-full items-center justify-center text-red-400 text-2xl">Failed to load PDF.</div>}
            className="flex h-full w-full items-center justify-center"
          >
            {/* Fit page into available box while preserving exact PDF rendering */}
            {box.w > 0 && box.h > 0 && (
              <Page
                pageNumber={store.currentPage}
                // Render the PDF appearance exactly. Text/annotations off avoids overlay artifacts.
                renderTextLayer={false}
                renderAnnotationLayer={false}
                // Fit to screen: width-based scaling tends to be most stable.
                // If your PDF is tall, it may letterbox—this is correct and preserves the page.
                width={Math.floor(box.w)}
                className="flex items-center justify-center"
              />
            )}
          </Document>
        </div>
      )}
    </div>
  );
}
