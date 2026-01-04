export type PdfPageText = {
  pageNumber: number;
  norm: string;
  phoneticNorm?: string;
  armenianNorm?: string;
};

export type DictEntry = {
  armenian: string;
  phonetic: string;
};

export type MatcherConfig = {
  ngramSize: number;
  minNgramMatches: number;
  matchMode: "armenian" | "phonetic" | "combined";
};

export const DEFAULT_CONFIG: MatcherConfig = {
  ngramSize: 2,
  minNgramMatches: 1,
  matchMode: "armenian",
};

function normalizeText(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-zA-Z0-9\u0530-\u058F\u0561-\u0587\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): string[] {
  return normalizeText(s).split(" ").filter(Boolean);
}

function extractNgrams(tokens: string[], n: number): string[] {
  if (tokens.length < n) return tokens.length > 0 ? [tokens.join(" ")] : [];
  const ngrams: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.push(tokens.slice(i, i + n).join(" "));
  }
  return ngrams;
}

function armenianToPhonetic(tokens: string[], dict: Map<string, string>): string[] {
  return tokens.map(token => dict.get(token) || token);
}

export function createPageMatcher(
  pages: PdfPageText[],
  _dictionary?: DictEntry[],
  config: MatcherConfig = DEFAULT_CONFIG
) {
  const pageNgrams: Map<number, Set<string>> = new Map();
  
  for (const page of pages) {
    let text: string;
    if (config.matchMode === "armenian" && page.armenianNorm) {
      text = page.armenianNorm;
    } else if (config.matchMode === "phonetic" && page.phoneticNorm) {
      text = page.phoneticNorm;
    } else {
      text = page.norm;
    }
    const tokens = tokenize(text);
    const ngrams = extractNgrams(tokens, config.ngramSize);
    pageNgrams.set(page.pageNumber, new Set(ngrams));
    
    if (page.pageNumber <= 5) {
      console.log(`[Matcher] Page ${page.pageNumber} sample ngrams: ${ngrams.slice(0, 3).join(" | ")}`);
    }
  }

  return function matchPage(
    transcript: string,
    currentPage: number,
    lookAhead: number = 1
  ): { page: number; score: number; matchedNgrams: number; totalNgrams: number } {
    const transcriptTokens = tokenize(transcript);
    const transcriptNgrams = extractNgrams(transcriptTokens, config.ngramSize);
    const transcriptNgramSet = new Set(transcriptNgrams);
    
    if (transcriptNgrams.length === 0) {
      return { page: currentPage, score: 0, matchedNgrams: 0, totalNgrams: 0 };
    }

    let bestPage = currentPage;
    let bestMatches = 0;
    
    const maxPage = Math.min(currentPage + lookAhead, pages.length);
    
    for (let p = currentPage; p <= maxPage; p++) {
      const pageNgramSet = pageNgrams.get(p);
      if (!pageNgramSet) continue;
      
      let matches = 0;
      for (const ng of transcriptNgramSet) {
        if (pageNgramSet.has(ng)) matches++;
      }
      
      if (matches > bestMatches) {
        bestMatches = matches;
        bestPage = p;
      }
    }

    const score = transcriptNgrams.length > 0 
      ? bestMatches / transcriptNgrams.length 
      : 0;

    return { 
      page: bestPage, 
      score, 
      matchedNgrams: bestMatches, 
      totalNgrams: transcriptNgrams.length 
    };
  };
}

export function checkPageHasContent(
  transcript: string,
  pageText: string,
  ngramSize: number = 2,
  dict?: Map<string, string>
): { matches: number; total: number } {
  let transcriptTokens = tokenize(transcript);
  
  if (dict && dict.size > 0) {
    transcriptTokens = armenianToPhonetic(transcriptTokens, dict);
  }
  
  const pageTokens = tokenize(pageText);
  
  const transcriptNgrams = extractNgrams(transcriptTokens, ngramSize);
  const pageNgramSet = new Set(extractNgrams(pageTokens, ngramSize));
  
  let matches = 0;
  transcriptNgrams.forEach(ng => {
    if (pageNgramSet.has(ng)) matches++;
  });
  
  return { matches, total: transcriptNgrams.length };
}
