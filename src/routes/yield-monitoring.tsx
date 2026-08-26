import { createFileRoute } from "@tanstack/react-router";
import { Sprout, Percent, Ruler, XCircle } from "lucide-react";
import { StatCardGrid, type StatCardItem } from "@/components/dashboard/StatCards";
import { SizeRipenessPanel } from "@/components/dashboard/SizeRipenessPanel";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useDashboardData } from "@/hooks/useDashboardData";
import {
  computeMetrics,
  getAcceptedDetections,
  type TomatoSize,
} from "@/lib/dashboard-data";

export const Route = createFileRoute("/yield-monitoring")({
  head: () => ({
    meta: [
      { title: "Yield Monitoring | Sprout Savvy Connect" },
      {
        name: "description",
        content:
          "Track marketable yield, acceptance rate, average diameter, and size-class distribution of sorted tomatoes.",
      },
      { property: "og:title", content: "Yield Monitoring | Sprout Savvy Connect" },
      {
        property: "og:description",
        content:
          "Track marketable yield, acceptance rate, average diameter, and size-class distribution of sorted tomatoes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: YieldMonitoringPage,
});

const SIZE_ORDER: TomatoSize[] = ["Small", "Medium", "Large"];

function YieldMonitoringPage() {
  const { data, loading, error } = useDashboardData();
  const metrics = computeMetrics(data.detections);
  const accepted = getAcceptedDetections(data.detections);
  const acceptedMetrics = computeMetrics(accepted);

  const items: StatCardItem[] = [
    {
      label: "Marketable Yield",
      value: metrics.accepted,
      icon: Sprout,
      color: "text-leaf",
      bg: "bg-leaf/10",
    },
    {
      label: "Acceptance Rate",
      value: `${metrics.acceptanceRate}%`,
      icon: Percent,
      color: "text-accent",
      bg: "bg-accent/10",
    },
    {
      label: "Average Diameter",
      value: `${metrics.size.avgDiameter} mm`,
      icon: Ruler,
      color: "text-tomato",
      bg: "bg-tomato/10",
    },
    {
      label: "Rejected Fruit",
      value: metrics.rejected,
      icon: XCircle,
      color: "text-danger",
      bg: "bg-danger/10",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-leaf/10 text-leaf">
            <Sprout className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Yield Monitoring</h1>
            <p className="text-sm text-muted-foreground">
              Marketable output and grading quality of the sorting line
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

        <div className="mt-6 space-y-6">
          <StatCardGrid items={items} />

          <div className="grid gap-6 lg:grid-cols-3">
            <SizeRipenessPanel
              detections={accepted}
              title="Marketable Size & Ripeness"
              description="Grading breakdown of accepted fruit only"
            />

            <Card className="border border-border/60 bg-card shadow-sm lg:col-span-2">
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold">Yield by Size Class</CardTitle>
                <CardDescription>
                  Accepted fruit per size class, with share of marketable yield
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {SIZE_ORDER.map((size) => {
                  const count = acceptedMetrics.size.counts[size] ?? 0;
                  const totalAccepted = Math.max(acceptedMetrics.total, 1);
                  const pct = Math.round((count / totalAccepted) * 100);
                  return (
                    <div
                      key={size}
                      className="flex items-center justify-between rounded-lg border border-border/60 bg-background p-4"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{size}</p>
                        <p className="text-xs text-muted-foreground">
                          {size === "Small" && "< 55 mm"}
                          {size === "Medium" && "55 – 70 mm"}
                          {size === "Large" && "> 70 mm"}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="h-2 w-32 overflow-hidden rounded-full bg-muted sm:w-48">
                          <div className="h-full rounded-full bg-leaf" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="w-20 text-right">
                          <span className="text-lg font-bold text-foreground">{count}</span>
                          <span className="ml-1 text-xs text-muted-foreground">({pct}%)</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground">
                  Accepted fruit average {acceptedMetrics.size.avgDiameter} mm in diameter across{" "}
                  {acceptedMetrics.total} marketable tomatoes.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
