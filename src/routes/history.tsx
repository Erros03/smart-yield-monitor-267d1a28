import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { History } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useDashboardData } from "@/hooks/useDashboardData";
import {
  getAllDetections,
  getActionColor,
  getLabelColor,
  formatDateTime,
  type TomatoAction,
} from "@/lib/dashboard-data";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "History | Sprout Savvy Connect" },
      {
        name: "description",
        content:
          "Full detection history from the tomato sorting line with action, size, ripeness, and confidence filters.",
      },
      { property: "og:title", content: "History | Sprout Savvy Connect" },
      {
        property: "og:description",
        content:
          "Full detection history from the tomato sorting line with action, size, ripeness, and confidence filters.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoryPage,
});

type Filter = "All" | TomatoAction;
const FILTERS: Filter[] = ["All", "Accepted", "Rejected"];

function HistoryPage() {
  const { data, loading, error } = useDashboardData();
  const [filter, setFilter] = useState<Filter>("All");

  const all = getAllDetections(data.detections);
  const rows = filter === "All" ? all : all.filter((d) => d.action === filter);

  const counts: Record<Filter, number> = {
    All: all.length,
    Accepted: all.filter((d) => d.action === "Accepted").length,
    Rejected: all.filter((d) => d.action === "Rejected").length,
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-info/10 text-info">
            <History className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">History</h1>
            <p className="text-sm text-muted-foreground">
              Every detection recorded by the sorting system
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
            Failed to connect to Firebase: {error.message}
          </div>
        )}

        {loading && !error && (
          <div className="mt-4 text-sm text-muted-foreground">Loading live data…</div>
        )}

        <div className="mt-6 rounded-xl border border-border/60 bg-card shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-6 py-4">
            <h2 className="text-base font-semibold text-foreground">Detection Log</h2>
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    filter === f
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f} ({counts[f]})
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Ripeness</TableHead>
                  <TableHead className="text-right">Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No detections recorded{filter !== "All" ? ` for “${filter}”` : ""}.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((detection) => (
                    <TableRow key={detection.id}>
                      <TableCell className="font-medium text-foreground">
                        {formatDateTime(detection.timestamp)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getLabelColor(detection.label)}>
                          {detection.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getActionColor(detection.action)}>
                          {detection.action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {detection.size}{" "}
                        <span className="text-muted-foreground">({detection.diameterMm} mm)</span>
                      </TableCell>
                      <TableCell>{detection.ripeness}</TableCell>
                      <TableCell className="text-right font-medium text-foreground">
                        {detection.confidence}%
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </main>
    </div>
  );
}
