function tokenize(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function scoreOverlap(a: string, b: string) {
  const A = new Set(tokenize(a));
  const B = tokenize(b);
  if (A.size === 0 || B.length === 0) return 0;
  let hit = 0;
  for (const w of B) if (A.has(w)) hit++;
  return hit / Math.max(8, B.length);
}

export function choosePage(
  transcriptWindow: string,
  currentPage: number,
  pages: { pageNumber: number; norm: string }[]
) {
  const candidates = pages.filter(p =>
    p.pageNumber >= currentPage && p.pageNumber <= currentPage + 2
  );

  let best = { page: currentPage, score: 0 };

  for (const c of candidates) {
    const s = scoreOverlap(c.norm, transcriptWindow);
    if (s > best.score) best = { page: c.pageNumber, score: s };
  }

  return best;
}
