import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Mock data based on the app
export interface Page {
  page_number: number;
  armenian_text: string;
  english_text: string;
}

export const DEFAULT_PAGES: Page[] = [
  { page_number: 1, armenian_text: "Blessed Kingdom", english_text: "Blessed is the Kingdom" },
  { page_number: 2, armenian_text: "Peace Prayer", english_text: "Prayer for Peace" },
  { page_number: 3, armenian_text: "Lord Mercy", english_text: "Lord have mercy" },
  { page_number: 4, armenian_text: "World Peace", english_text: "For the peace of the whole world" },
  { page_number: 5, armenian_text: "Holy God", english_text: "Holy God" },
  { page_number: 6, armenian_text: "Immortal", english_text: "Immortal" },
];

interface AppState {
  currentPage: number;
  totalPages: number;
  matchThreshold: number;
  displayMode: 'text' | 'pdf';
  pdfFile: string | null;
  pdfId: string | null;
  pages: Page[];
  setPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  setThreshold: (val: number) => void;
  setDisplayConfig: (mode: 'text' | 'pdf', file: string | null, pdfId?: string | null) => void;
  addPages: (text: string) => void;
  setUploadedPdf: (file: File) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      currentPage: 1,
      totalPages: 100,
      matchThreshold: 0.85,
      displayMode: 'pdf',
      pdfFile: null,
      pdfId: null,
      pages: DEFAULT_PAGES,
      
      setPage: (page) => set((state) => {
        if (page >= 1 && page <= state.totalPages) {
          return { currentPage: page };
        }
        return {};
      }),
      
      nextPage: () => set((state) => {
        if (state.currentPage < state.totalPages) {
          return { currentPage: state.currentPage + 1 };
        }
        return {};
      }),
      
      prevPage: () => set((state) => {
        if (state.currentPage > 1) {
          return { currentPage: state.currentPage - 1 };
        }
        return {};
      }),
      
      setThreshold: (val) => set({ matchThreshold: val }),

      setDisplayConfig: (mode, file, pdfId = null) => set({ displayMode: mode, pdfFile: file, pdfId }),


      setUploadedPdf: (file) => {
        const url = URL.createObjectURL(file);
        set({ pdfFile: url, displayMode: 'pdf', pdfId: null });
      },
      
      addPages: (text) => set((state) => {
        const lines = text.split('\n');
        const newPages: Page[] = [];
        lines.forEach(line => {
          const parts = line.split('|');
          if (parts.length >= 2) {
            newPages.push({
              page_number: parseInt(parts[0]) || state.pages.length + newPages.length + 1,
              armenian_text: parts[1] || "",
              english_text: parts[2] || ""
            });
          }
        });
        
        if (newPages.length > 0) {
          return { 
            pages: [...state.pages, ...newPages],
            totalPages: state.pages.length + newPages.length
          };
        }
        return {};
      })
    }),
    {
      name: 'liturgy-store',
      partialize: (state) => ({ 
        pdfFile: state.pdfFile,
        pdfId: state.pdfId, 
        displayMode: state.displayMode,
        currentPage: state.currentPage,
        totalPages: state.totalPages,
        matchThreshold: state.matchThreshold
      }),
    }
  )
);