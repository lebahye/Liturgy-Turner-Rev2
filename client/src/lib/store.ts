import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Page {
  page_number: number;
  armenian_text: string;
  english_text: string;
}

// Keep this for optional “text mode” fallback. PDF mode ignores it.
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
  displayMode: "text" | "pdf";
  pdfFile: string | null; // can be blob: URL or /uploads/... path
  pdfId: string | null;

  pages: Page[];

  setPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;

  setThreshold: (val: number) => void;

  /** Use this when the server returns a stable public path like /uploads/pdfs/xxx.pdf */
  setPdfFromServer: (pdfPath: string, pdfId?: string | null) => void;

  /** Use this when user selects a local file (blob URL) */
  setUploadedPdf: (file: File) => void;

  /** Called after PDF loads successfully (numPages comes from PDF itself) */
  setTotalPagesFromPdf: (numPages: number) => void;

  /** Optional: text mode */
  setDisplayConfig: (mode: "text" | "pdf", file: string | null, pdfId?: string | null) => void;
  addPages: (text: string) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentPage: 1,
      totalPages: 1, // IMPORTANT: don’t guess; let PDF tell us
      matchThreshold: 0.85,
      displayMode: "pdf",
      pdfFile: "/uploads/pdfs/7ad0d220e9292f359b6cb0949e923a03.pdf",
      pdfId: null,
      pages: DEFAULT_PAGES,

      setPage: (page) =>
        set((state) => {
          const p = Math.max(1, Math.min(page, state.totalPages || 1));
          return { currentPage: p };
        }),

      nextPage: () =>
        set((state) => {
          const max = state.totalPages || 1;
          if (state.currentPage < max) return { currentPage: state.currentPage + 1 };
          return {};
        }),

      prevPage: () =>
        set((state) => {
          if (state.currentPage > 1) return { currentPage: state.currentPage - 1 };
          return {};
        }),

      setThreshold: (val) => set({ matchThreshold: val }),

      setDisplayConfig: (mode, file, pdfId = null) => set({ displayMode: mode, pdfFile: file, pdfId }),

      setPdfFromServer: (pdfPath, pdfId = null) => {
        // pdfPath should be something like "/uploads/pdfs/filename.pdf"
        set({
          pdfFile: pdfPath,
          pdfId: pdfId ?? null,
          displayMode: "pdf",
        });
      },

      setUploadedPdf: (file) => {
        const url = URL.createObjectURL(file);
        set({ pdfFile: url, displayMode: "pdf", pdfId: null });
      },

      setTotalPagesFromPdf: (numPages) => {
        const n = Math.max(1, numPages || 1);
        const cur = get().currentPage;
        set({
          totalPages: n,
          currentPage: Math.max(1, Math.min(cur, n)),
        });
      },

      addPages: (text) =>
        set((state) => {
          const lines = text.split("\n");
          const newPages: Page[] = [];
          lines.forEach((line) => {
            const parts = line.split("|");
            if (parts.length >= 2) {
              newPages.push({
                page_number: parseInt(parts[0]) || state.pages.length + newPages.length + 1,
                armenian_text: parts[1] || "",
                english_text: parts[2] || "",
              });
            }
          });

          if (newPages.length > 0) {
            return {
              pages: [...state.pages, ...newPages],
              totalPages: state.pages.length + newPages.length,
            };
          }
          return {};
        }),
    }),
    {
      name: "liturgy-store",
      partialize: (state) => ({
        pdfFile: state.pdfFile,
        pdfId: state.pdfId,
        displayMode: state.displayMode,
        currentPage: state.currentPage,
        totalPages: state.totalPages,
        matchThreshold: state.matchThreshold,
      }),
    }
  )
);
