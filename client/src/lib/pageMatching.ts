export type PdfPageText = {
  pageNumber: number;
  norm: string;
  phoneticNorm?: string;
};

export type DictEntry = {
  armenian: string;
  phonetic: string;
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

function armenianToPhonetic(text: string, dict: Map<string, string>): string {
  const tokens = tokenize(text);
  const converted: string[] = [];
  
  for (const token of tokens) {
    const phonetic = dict.get(token);
    if (phonetic) {
      converted.push(phonetic);
    } else {
      converted.push(token);
    }
  }
  
  return converted.join(" ");
}

function trigramSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 3 || b.length < 3) {
    return a === b ? 1 : (a.includes(b) || b.includes(a)) ? 0.5 : 0;
  }
  
  const trigramsA = new Set<string>();
  const trigramsB = new Set<string>();
  
  for (let i = 0; i <= a.length - 3; i++) {
    trigramsA.add(a.slice(i, i + 3));
  }
  for (let i = 0; i <= b.length - 3; i++) {
    trigramsB.add(b.slice(i, i + 3));
  }
  
  let overlap = 0;
  Array.from(trigramsA).forEach(t => {
    if (trigramsB.has(t)) overlap++;
  });
  
  const union = trigramsA.size + trigramsB.size - overlap;
  return union > 0 ? overlap / union : 0;
}

function buildIdf(pages: PdfPageText[], usePhonetic = true) {
  const df = new Map<string, number>();
  const N = Math.max(1, pages.length);

  for (const p of pages) {
    const text = usePhonetic && p.phoneticNorm ? p.phoneticNorm : p.norm;
    const seen = new Set(tokenize(text));
    Array.from(seen).forEach(t => df.set(t, (df.get(t) || 0) + 1));
  }

  const idf = new Map<string, number>();
  Array.from(df.entries()).forEach(([t, d]) => {
    idf.set(t, Math.log((N + 1) / (d + 1)) + 1);
  });
  return idf;
}

function fuzzyMatchScore(
  pageTokens: Set<string>,
  transcriptTokens: string[],
  idf: Map<string, number>
): number {
  if (pageTokens.size === 0 || transcriptTokens.length === 0) return 0;

  let hit = 0;
  let total = 0;
  const pageTokensArr = Array.from(pageTokens);

  for (const tToken of transcriptTokens) {
    const w = idf.get(tToken) ?? 1;
    total += w;
    
    if (pageTokens.has(tToken)) {
      hit += w;
    } else {
      let bestSim = 0;
      for (const pToken of pageTokensArr) {
        if (tToken.length >= 4 && pToken.length >= 4) {
          const sim = trigramSimilarity(tToken, pToken);
          if (sim > bestSim) bestSim = sim;
        }
      }
      if (bestSim > 0.4) {
        hit += w * bestSim;
      }
    }
  }

  const minWords = 3;
  if (transcriptTokens.length < minWords) return 0;

  return hit / Math.max(1e-9, total);
}

export function createPageMatcher(
  pages: PdfPageText[],
  dictionary?: DictEntry[]
) {
  const dictMap = new Map<string, string>();
  if (dictionary) {
    for (const entry of dictionary) {
      dictMap.set(normalizeText(entry.armenian), normalizeText(entry.phonetic));
    }
  }

  const idf = buildIdf(pages, true);

  return function choosePage(
    transcriptWindow: string,
    currentPage: number,
    lookAheadPages = 3
  ): { page: number; score: number } {
    let tNorm = normalizeText(transcriptWindow);
    if (!tNorm) return { page: currentPage, score: 0 };

    if (dictMap.size > 0) {
      tNorm = armenianToPhonetic(tNorm, dictMap);
    }

    const tTokens = tokenize(tNorm);
    if (tTokens.length === 0) return { page: currentPage, score: 0 };

    const min = currentPage;
    const max = Math.min(currentPage + lookAheadPages, pages.length);

    let bestPage = currentPage;
    let bestScore = 0;

    for (let p = min; p <= max; p++) {
      const page = pages[p - 1];
      if (!page) continue;

      const pageText = page.phoneticNorm || page.norm;
      const pageTokens = new Set(tokenize(pageText));

      const score = fuzzyMatchScore(pageTokens, tTokens, idf);
      if (score > bestScore) {
        bestScore = score;
        bestPage = p;
      }
    }

    return { page: bestPage, score: bestScore };
  };
}
