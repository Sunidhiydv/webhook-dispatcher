"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeliveryTable } from "@/components/delivery-table";
import { formatMs, formatPercent } from "@/lib/format";
import { usePolling } from "@/lib/use-polling";
import type { Delivery, Page, Stats } from "@/lib/types";

export default function OverviewPage() {
  const stats = usePolling<Stats>("/v1/stats", 2000);
  const deliveries = usePolling<Page<Delivery>>("/v1/deliveries?limit=8", 2000);
  const recent = stats.data?.recent;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live delivery traffic for the last minute. Events are durable in Postgres before they enter Redis.
        </p>
      </div>

      {stats.error ? <Banner message={stats.error} /> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Ingested" value={recent ? String(recent.ingested) : "—"} hint="events / min" />
        <Metric label="Delivered" value={recent ? String(recent.delivered) : "—"} hint="2xx attempts / min" />
        <Metric label="Success" value={formatPercent(recent?.successRate)} hint={`${recent?.dlq ?? "—"} dead letters / min`} />
        <Metric label="p95 latency" value={formatMs(recent?.p95LatencyMs)} hint={`avg ${formatMs(recent?.avgLatencyMs)}`} />
      </div>

      <Card className="mt-4">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Throughput, 5s buckets</CardTitle>
          <div className="flex gap-3 text-[11px] uppercase tracking-wide">
            <span className="text-primary">delivered</span>
            <span className="text-amber-200">retry</span>
            <span className="text-red-300">dlq</span>
          </div>
        </CardHeader>
        <CardContent>
          <Sparkline series={stats.data?.series ?? []} />
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <Count label="Queued" value={stats.data?.counts.queued} />
            <Count label="Retrying" value={stats.data?.counts.retrying} />
            <Count label="Delivered" value={stats.data?.counts.delivered} />
            <Count label="Dead letter" value={stats.data?.counts.dlq} />
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Recent deliveries</CardTitle>
          <Link href="/deliveries" className="text-xs text-primary">
            View all
          </Link>
        </CardHeader>
        <CardContent className="px-0">
          {deliveries.error ? <Banner message={deliveries.error} /> : null}
          <DeliveryTable deliveries={deliveries.data?.items ?? []} loading={deliveries.loading} />
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="tabular text-3xl font-semibold tracking-tight">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
      </CardContent>
    </Card>
  );
}

function Count({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="tabular text-lg">{value ?? "—"}</div>
    </div>
  );
}

function Banner({ message }: { message: string }) {
  return <div className="mb-4 rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-100">{message}</div>;
}

function Sparkline({ series }: { series: Stats["series"] }) {
  const width = 640;
  const height = 96;
  if (series.length === 0) {
    return <div className="h-24 text-sm text-muted-foreground">Waiting for metric buckets.</div>;
  }
  const max = Math.max(1, ...series.map((point) => point.delivered + point.retry + point.dlq));
  const step = series.length > 1 ? width / (series.length - 1) : width;
  const path = (key: "delivered" | "retry" | "dlq") =>
    series
      .map((point, index) => {
        const x = index * step;
        const y = height - (point[key] / max) * (height - 8) - 4;
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-24 w-full">
      <path d={path("delivered")} fill="none" stroke="hsl(73 76% 72%)" strokeWidth="2" />
      <path d={path("retry")} fill="none" stroke="hsl(38 80% 66%)" strokeWidth="1.5" />
      <path d={path("dlq")} fill="none" stroke="hsl(0 72% 68%)" strokeWidth="1.5" />
    </svg>
  );
}
