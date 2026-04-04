import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Search, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

type SortOption = "alphabetical" | "frequency" | "confidence" | "page_number" | "reverse";
type FilterOption = "all" | "common" | "rare" | "high_confidence" | "low_confidence";

interface WordEntry {
  armenian: string;
  phonetic: string;
  pageNumber: number;
  occurrences: number;
  confidence: number;
}

interface WordStats {
  totalWords: number;
  uniqueArmenian: number;
  commonWords: number;
  rareWords: number;
  pagesCovered: number;
}

export default function Dictionary() {
  const [words, setWords] = useState<WordEntry[]>([]);
  const [stats, setStats] = useState<WordStats | null>(null);
  const [sort, setSort] = useState<SortOption>("alphabetical");
  const [filter, setFilter] = useState<FilterOption>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const limit = 100;

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    fetchWords();
  }, [sort, filter, page]);

  async function fetchStats() {
    try {
      const res = await fetch("/api/word-browser/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  }

  async function fetchWords() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        sort,
        filter,
        page: String(page),
        limit: String(limit),
      });
      const res = await fetch(`/api/word-browser?${params}`);
      if (res.ok) {
        const data = await res.json();
        setWords(data.words || data.items || data.data || []);
        const total = data.totalPages || data.total_pages || Math.ceil((data.total || 0) / limit) || 1;
        setTotalPages(total);
      }
    } catch (err) {
      console.error("Failed to fetch words:", err);
    } finally {
      setLoading(false);
    }
  }

  const filteredWords = useMemo(() => {
    if (!searchQuery.trim()) return words;
    const q = searchQuery.toLowerCase();
    return words.filter(
      (w) =>
        w.armenian?.toLowerCase().includes(q) ||
        w.phonetic?.toLowerCase().includes(q)
    );
  }, [words, searchQuery]);

  const filterButtons: { label: string; value: FilterOption; description: string }[] = [
    { label: "All", value: "all", description: "All words" },
    { label: "Common", value: "common", description: "Occurrences > 3" },
    { label: "Rare", value: "rare", description: "Occurrences = 1" },
    { label: "High Conf", value: "high_confidence", description: "Confidence >= 0.9" },
    { label: "Low Conf", value: "low_confidence", description: "Confidence < 0.5" },
  ];

  function confidenceBadge(confidence: number) {
    if (confidence >= 0.9) return <Badge className="bg-green-600">{(confidence * 100).toFixed(0)}%</Badge>;
    if (confidence >= 0.7) return <Badge className="bg-yellow-600">{(confidence * 100).toFixed(0)}%</Badge>;
    if (confidence >= 0.5) return <Badge className="bg-orange-600">{(confidence * 100).toFixed(0)}%</Badge>;
    return <Badge variant="destructive">{(confidence * 100).toFixed(0)}%</Badge>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Word Dictionary
          </CardTitle>
        </CardHeader>
      </Card>

      {/* Stats Bar */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{stats.totalWords?.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Total Words</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{stats.uniqueArmenian?.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Unique Armenian</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{stats.commonWords?.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Common Words</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{stats.rareWords?.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Rare Words</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{stats.pagesCovered?.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Pages Covered</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Controls */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          {/* Sort */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Sort:</span>
            <Select value={sort} onValueChange={(v) => { setSort(v as SortOption); setPage(1); }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alphabetical">Alphabetical</SelectItem>
                <SelectItem value="frequency">Frequency</SelectItem>
                <SelectItem value="confidence">Confidence</SelectItem>
                <SelectItem value="page_number">Page Number</SelectItem>
                <SelectItem value="reverse">Reverse</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Filter buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Filter:</span>
            {filterButtons.map((fb) => (
              <Button
                key={fb.value}
                variant={filter === fb.value ? "default" : "outline"}
                size="sm"
                onClick={() => { setFilter(fb.value); setPage(1); }}
                title={fb.description}
              >
                {fb.label}
              </Button>
            ))}
          </div>

          {/* Search */}
          <div className="relative ml-auto w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search Armenian or phonetic..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading words...</span>
            </div>
          ) : filteredWords.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              No words found for the current filter/search.
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Armenian</TableHead>
                    <TableHead>Phonetic</TableHead>
                    <TableHead className="w-[80px] text-center">Page #</TableHead>
                    <TableHead className="w-[100px] text-center">Occurrences</TableHead>
                    <TableHead className="w-[100px] text-center">Confidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredWords.map((word, i) => (
                    <TableRow key={`${word.armenian}-${word.pageNumber}-${i}`}>
                      <TableCell className="text-lg font-medium">{word.armenian}</TableCell>
                      <TableCell className="text-muted-foreground">{word.phonetic}</TableCell>
                      <TableCell className="text-center">{word.pageNumber}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={word.occurrences > 3 ? "default" : "outline"}>
                          {word.occurrences}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {confidenceBadge(word.confidence)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          Page {page} of {totalPages} ({filteredWords.length} shown)
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
