import { useStore } from "@/lib/store";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Set up the worker for PDF.js
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function Display() {
  const store = useStore();
  const [animate, setAnimate] = useState(false);
  const [prevPage, setPrevPage] = useState(store.currentPage);
  const [numPages, setNumPages] = useState<number | null>(null);

  const currentPageData = store.pages.find(p => p.page_number === store.currentPage);

  useEffect(() => {
    if (store.currentPage !== prevPage) {
      setAnimate(true);
      const timer = setTimeout(() => setAnimate(false), 500);
      setPrevPage(store.currentPage);
      return () => clearTimeout(timer);
    }
  }, [store.currentPage, prevPage]);

  // Listen for key presses even in display mode
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

  const pdfSrc = store.pdfFile?.startsWith('blob:') 
    ? store.pdfFile 
    : store.pdfFile?.startsWith('/') 
      ? store.pdfFile 
      : `/${store.pdfFile}`;

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center overflow-hidden bg-black text-white">
      {store.displayMode === 'pdf' ? (
        <div className="flex h-full w-full items-center justify-center">
           {store.pdfFile ? (
             <Document
               file={pdfSrc}
               onLoadSuccess={onDocumentLoadSuccess}
               onLoadError={(error) => console.error('PDF load error:', error)}
               className="flex h-full w-full items-center justify-center"
               loading={<div className="text-2xl text-white">Loading PDF...</div>}
               error={<div className="text-2xl text-red-500">Failed to load PDF file.</div>}
             >
               <Page 
                 pageNumber={store.currentPage} 
                 renderTextLayer={false}
                 renderAnnotationLayer={false}
                 height={window.innerHeight}
                 className="flex justify-center"
               />
             </Document>
           ) : (
             <div className="text-center">
               <div className="text-4xl text-gray-400 mb-4">No PDF Uploaded</div>
               <div className="text-xl text-gray-500">Upload a Badarak PDF from the Home page to begin.</div>
             </div>
           )}
        </div>
      ) : (
        <div className={cn(
          "w-[90%] max-w-7xl p-12 text-center transition-all duration-500",
          animate ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"
        )}>
           <div className="absolute top-8 right-12 text-4xl font-bold text-blue-500">
             Page {store.currentPage}
           </div>

           {currentPageData ? (
             <>
               <div className="armenian-text mb-12 mt-16 text-7xl font-semibold leading-relaxed text-green-500 md:text-8xl">
                 {currentPageData.armenian_text}
               </div>
               <div className="text-5xl leading-relaxed text-white md:text-6xl">
                 {currentPageData.english_text}
               </div>
             </>
           ) : (
             <div className="text-4xl text-gray-500">Waiting for content...</div>
           )}
        </div>
      )}
    </div>
  );
}
