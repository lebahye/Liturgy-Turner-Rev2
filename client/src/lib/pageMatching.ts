export type PdfPageText = {
  pageNumber: number;
  norm: string;
};

function normalizeText(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string) {
  return normalizeText(s)
    .split(" ")
    .map(t => t.trim())
    .filter(Boolean);
}

function buildIdf(pages: PdfPageText[]) {
  const df = new Map<string, number>();
  const N = Math.max(1, pages.length);

  for (const p of pages) {
    const seen = new Set(tokenize(p.norm));
    Array.from(seen).forEach(t => df.set(t, (df.get(t) || 0) + 1));
  }

  const idf = new Map<string, number>();
  Array.from(df.entries()).forEach(([t, d]) => {
    idf.set(t, Math.log((N + 1) / (d + 1)) + 1);
  });
  return idf;
}

function weightedOverlapScore(pageNorm: string, transcriptNorm: string, idf: Map<string, number>) {
  const pageTokens = new Set(tokenize(pageNorm));
  const tTokens = tokenize(transcriptNorm);
  if (pageTokens.size === 0 || tTokens.length === 0) return 0;

  let hit = 0;
  let total = 0;

  for (const t of tTokens) {
    const w = idf.get(t) ?? 1;
    total += w;
    if (pageTokens.has(t)) hit += w;
  }

  const minWords = 6;
  if (tTokens.length < minWords) return 0;

  return hit / Math.max(1e-9, total);
}

export function createPageMatcher(pages: PdfPageText[]) {
  const idf = buildIdf(pages);

  return function choosePage(
    transcriptWindow: string,
    currentPage: number,
    lookAheadPages = 2
  ): { page: number; score: number } {
    const tNorm = normalizeText(transcriptWindow);
    if (!tNorm) return { page: currentPage, score: 0 };

    const min = currentPage;
    const max = Math.min(currentPage + lookAheadPages, pages.length);

    let bestPage = currentPage;
    let bestScore = 0;

    for (let p = min; p <= max; p++) {
      const page = pages[p - 1];
      if (!page) continue;

      const score = weightedOverlapScore(page.norm, tNorm, idf);
      if (score > bestScore) {
        bestScore = score;
        bestPage = p;
      }
    }

    return { page: bestPage, score: bestScore };
  };
}
