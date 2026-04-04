import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Database, ChevronLeft, ChevronRight, Loader2, ChevronDown, ChevronRight as ChevronRightIcon, Table as TableIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface TableInfo {
  name: string;
  rowCount: number;
}

interface ColumnInfo {
  name: string;
  type: string;
  notNull: boolean;
  defaultValue: string | null;
  pk: boolean;
}

export default function DatabaseViewer() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());
  const [showSchema, setShowSchema] = useState(false);

  const limit = 50;

  useEffect(() => {
    fetchTables();
  }, []);

  useEffect(() => {
    if (selectedTable) {
      setPage(1);
      setExpandedCells(new Set());
      fetchTableData(selectedTable, 1);
    }
  }, [selectedTable]);

  async function fetchTables() {
    setTablesLoading(true);
    try {
      const res = await fetch("/api/db/tables");
      if (res.ok) {
        const data = await res.json();
        setTables(data.tables || data || []);
      }
    } catch (err) {
      console.error("Failed to fetch tables:", err);
    } finally {
      setTablesLoading(false);
    }
  }

  async function fetchTableData(tableName: string, p: number) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(limit) });
      const res = await fetch(`/api/db/query/${encodeURIComponent(tableName)}?${params}`);
      if (res.ok) {
        const data = await res.json();
        setRows(data.rows || data.data || []);
        setColumns(data.columns || data.schema || []);
        const total = data.totalPages || data.total_pages || Math.ceil((data.total || data.rowCount || 0) / limit) || 1;
        setTotalPages(total);
      }
    } catch (err) {
      console.error("Failed to fetch table data:", err);
    } finally {
      setLoading(false);
    }
  }

  function handlePageChange(newPage: number) {
    if (!selectedTable) return;
    setPage(newPage);
    setExpandedCells(new Set());
    fetchTableData(selectedTable, newPage);
  }

  function toggleCell(cellKey: string) {
    setExpandedCells((prev) => {
      const next = new Set(prev);
      if (next.has(cellKey)) next.delete(cellKey);
      else next.add(cellKey);
      return next;
    });
  }

  function isJson(value: unknown): boolean {
    if (typeof value === "object" && value !== null) return true;
    if (typeof value !== "string") return false;
    const s = (value as string).trim();
    return (s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"));
  }

  function parseJson(value: unknown): string {
    if (typeof value === "object" && value !== null) return JSON.stringify(value, null, 2);
    if (typeof value === "string") {
      try {
        return JSON.stringify(JSON.parse(value), null, 2);
      } catch {
        return value;
      }
    }
    return String(value);
  }

  function renderCellValue(value: unknown, rowIdx: number, colName: string) {
    if (value === null || value === undefined) {
      return <span className="text-muted-foreground italic">NULL</span>;
    }

    const cellKey = `${rowIdx}-${colName}`;
    if (isJson(value)) {
      const expanded = expandedCells.has(cellKey);
      const preview = typeof value === "string" ? value : JSON.stringify(value);
      return (
        <div>
          <button
            className="flex items-center gap-1 text-left text-xs text-blue-600 hover:text-blue-800"
            onClick={() => toggleCell(cellKey)}
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRightIcon className="h-3 w-3" />}
            {expanded ? "Collapse" : preview.length > 40 ? preview.slice(0, 40) + "..." : preview}
          </button>
          {expanded && (
            <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-xs">
              {parseJson(value)}
            </pre>
          )}
        </div>
      );
    }

    const str = String(value);
    if (str.length > 100) {
      const cellKey2 = `${rowIdx}-${colName}-long`;
      const expanded = expandedCells.has(cellKey2);
      return (
        <div>
          <span>{expanded ? str : str.slice(0, 100) + "..."}</span>
          {str.length > 100 && (
            <button
              className="ml-1 text-xs text-blue-600 hover:text-blue-800"
              onClick={() => toggleCell(cellKey2)}
            >
              {expanded ? "less" : "more"}
            </button>
          )}
        </div>
      );
    }

    return <span>{str}</span>;
  }

  // Derive column names from rows if columns metadata is empty
  const columnNames = columns.length > 0
    ? columns.map((c) => c.name)
    : rows.length > 0
      ? Object.keys(rows[0])
      : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Viewer
          </CardTitle>
        </CardHeader>
      </Card>

      <div className="flex gap-4">
        {/* Sidebar - Table List */}
        <Card className="w-64 shrink-0">
          <CardHeader className="p-3">
            <CardTitle className="text-sm">Tables</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {tablesLoading ? (
              <div className="flex items-center justify-center p-6">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : (
              <ScrollArea className="h-[65vh]">
                <div className="space-y-0.5 p-2">
                  {tables.map((t) => (
                    <button
                      key={t.name}
                      className={cn(
                        "flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                        selectedTable === t.name && "bg-primary/10 font-medium text-primary"
                      )}
                      onClick={() => setSelectedTable(t.name)}
                    >
                      <span className="flex items-center gap-2">
                        <TableIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        {t.name}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {t.rowCount}
                      </Badge>
                    </button>
                  ))}
                  {tables.length === 0 && (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      No tables found
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Main Content */}
        <div className="flex-1 space-y-4">
          {!selectedTable ? (
            <Card>
              <CardContent className="flex items-center justify-center p-12">
                <div className="text-center text-muted-foreground">
                  <Database className="mx-auto mb-3 h-10 w-10 opacity-40" />
                  <p>Select a table from the sidebar to view its data.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Schema Toggle */}
              {columns.length > 0 && (
                <Card>
                  <CardContent className="p-3">
                    <button
                      className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                      onClick={() => setShowSchema(!showSchema)}
                    >
                      {showSchema ? <ChevronDown className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
                      Schema: {selectedTable} ({columns.length} columns)
                    </button>
                    {showSchema && (
                      <div className="mt-3 overflow-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Column</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead>Not Null</TableHead>
                              <TableHead>Default</TableHead>
                              <TableHead>PK</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {columns.map((col) => (
                              <TableRow key={col.name}>
                                <TableCell className="font-mono text-sm">{col.name}</TableCell>
                                <TableCell>
                                  <Badge variant="outline">{col.type || "unknown"}</Badge>
                                </TableCell>
                                <TableCell>{col.notNull ? "Yes" : "No"}</TableCell>
                                <TableCell className="font-mono text-xs">
                                  {col.defaultValue ?? <span className="text-muted-foreground italic">none</span>}
                                </TableCell>
                                <TableCell>{col.pk ? <Badge>PK</Badge> : ""}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Data Table */}
              <Card>
                <CardContent className="p-0">
                  {loading ? (
                    <div className="flex items-center justify-center p-12">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-muted-foreground">Loading table data...</span>
                    </div>
                  ) : rows.length === 0 ? (
                    <div className="p-12 text-center text-muted-foreground">
                      Table is empty.
                    </div>
                  ) : (
                    <div className="max-h-[55vh] overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {columnNames.map((col) => (
                              <TableHead key={col} className="whitespace-nowrap">
                                {col}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map((row, rowIdx) => (
                            <TableRow key={rowIdx}>
                              {columnNames.map((col) => (
                                <TableCell key={col} className="max-w-xs">
                                  {renderCellValue(row[col], rowIdx, col)}
                                </TableCell>
                              ))}
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
                  Page {page} of {totalPages} ({rows.length} rows shown)
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => handlePageChange(page - 1)}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => handlePageChange(page + 1)}
                  >
                    Next
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
