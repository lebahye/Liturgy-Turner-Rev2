export type PdfPageText = {
  pageNumber: number;
  norm: string;
  phoneticNorm?: string;
};

export type DictEntry = {
  armenian: string;
  phonetic: string;
};

export type MatcherConfig = {
  ngramSize: number;
  minNgramMatches: number;
  usePhonetic: boolean;
};

export const DEFAULT_CONFIG: MatcherConfig = {
  ngramSize: 2,
  minNgramMatches: 1,
  usePhonetic: true,
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
  dictionary?: DictEntry[],
  config: MatcherConfig = DEFAULT_CONFIG
) {
  const dictMap = new Map<string, string>();
  if (dictionary) {
    for (const entry of dictionary) {
      const key = normalizeText(entry.armenian);
      const val = normalizeText(entry.phonetic);
      if (key && val) dictMap.set(key, val);
    }
  }

  const pageNgrams: Map<number, Set<string>> = new Map();
  
  for (const page of pages) {
    const text = config.usePhonetic && page.phoneticNorm 
      ? page.phoneticNorm 
      : page.norm;
    const tokens = tokenize(text);
    const ngrams = extractNgrams(tokens, config.ngramSize);
    pageNgrams.set(page.pageNumber, new Set(ngrams));
  }

  return function matchPage(
    transcript: string,
    currentPage: number,
    lookAhead: number = 1
  ): { page: number; score: number; matchedNgrams: number; totalNgrams: number } {
    let transcriptTokens = tokenize(transcript);
    
    const originalTokens = [...transcriptTokens];
    if (dictMap.size > 0) {
      transcriptTokens = armenianToPhonetic(transcriptTokens, dictMap);
    }
    
    const translated = transcriptTokens.filter((t, i) => t !== originalTokens[i]).length;
    if (originalTokens.length > 0 && translated === 0) {
      console.log(`[Matcher] No translations found. Sample tokens: ${originalTokens.slice(0, 5).join(", ")}`);
      console.log(`[Matcher] Sample dict keys: ${Array.from(dictMap.keys()).slice(0, 5).join(", ")}`);
    } else if (translated > 0) {
      console.log(`[Matcher] Translated ${translated}/${originalTokens.length} tokens`);
    }
    
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
