import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { useStore } from '@/lib/store';
import { useRef, useState, useEffect } from 'react';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewportProps {
  pageNumber?: number;
  onLoadSuccess?: (data: { numPages: number }) => void;
  showPageNumber?: boolean;
  className?: string;
}

export function PdfViewport({ 
  pageNumber, 
  onLoadSuccess,
  showPageNumber = true,
  className = ""
}: PdfViewportProps) {
  const store = useStore();
  const displayPage = pageNumber ?? store.currentPage;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth - 16);
      }
    };
    
    updateWidth();
    window.addEventListener('resize', updateWidth);
    
    const observer = new ResizeObserver(updateWidth);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    
    return () => {
      window.removeEventListener('resize', updateWidth);
      observer.disconnect();
    };
  }, []);
  
  const pdfSrc = store.pdfFile?.startsWith('blob:') 
    ? store.pdfFile 
    : store.pdfFile?.startsWith('/') 
      ? store.pdfFile 
      : store.pdfFile ? `/${store.pdfFile}` : null;

  if (!store.pdfFile) {
    return (
      <div ref={containerRef} className={`flex items-center justify-center bg-gray-100 dark:bg-gray-900 rounded-lg p-8 min-h-[400px] ${className}`}>
        <div className="text-center">
          <div className="text-xl text-gray-500 mb-2">No PDF Uploaded</div>
          <div className="text-sm text-gray-400">Upload a Badarak PDF from the Home page first.</div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative bg-gray-900 rounded-lg overflow-auto ${className}`}>
      {showPageNumber && (
        <div className="absolute top-2 right-2 z-10 bg-black/70 text-white px-3 py-1 rounded-full text-sm font-medium">
          Page {displayPage}
        </div>
      )}
      <Document
        file={pdfSrc}
        onLoadSuccess={onLoadSuccess}
        onLoadError={(error) => console.error('PDF load error:', error)}
        className="flex items-center justify-center"
        loading={<div className="flex items-center justify-center p-8 text-white">Loading PDF...</div>}
        error={<div className="flex items-center justify-center p-8 text-red-500">Failed to load PDF</div>}
      >
        {containerWidth > 0 && (
          <Page 
            pageNumber={displayPage} 
            renderTextLayer={false}
            renderAnnotationLayer={false}
            width={containerWidth}
            className="flex justify-center"
          />
        )}
      </Document>
    </div>
  );
}
