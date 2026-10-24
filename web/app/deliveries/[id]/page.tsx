"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { formatMs, formatTime, hostOf } from "@/lib/format";
import { usePolling } from "@/lib/use-polling";
import type { DeliveryDetail } from "@/lib/types";

export default function DeliveryDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, error, refresh } = usePolling<DeliveryDetail>(`/v1/deliveries/${params.id}`, 2000);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function replay() {
    setPending(true);
    setMessage(null);
    try {
      await api(`/v1/deliveries/${params.id}/replay`, { method: "POST" });
      setMessage("Replay queued.");
      refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Replay failed");
    } finally {
      setPending(false);
    }
  }

  if (!data && error) return <p className="text-sm text-red-200">{error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading delivery…</p>;

  const replayable = data.status === "dlq" || data.status === "delivered";

  return (
    <div>
      <Link href="/deliveries" className="text-xs text-primary">
        All deliveries
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{data.event.type}</h1>
            <StatusBadge status={data.status} />
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{data.id}</p>
        </div>
        <Button variant="outline" disabled={!replayable || pending} onClick={() => void replay()}>
          Replay
        </Button>
      </div>
      {message ? <p className="mt-3 text-sm text-muted-foreground">{message}</p> : null}

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <Fact label="Endpoint" value={hostOf(data.endpoint.url)} hint={data.endpoint.description ?? data.endpoint.url} />
        <Fact label="Attempt" value={`${data.attempt}/${data.maxAttempts}`} hint={data.lastError ?? "No error recorded"} />
        <Fact
          label={data.status === "delivered" ? "Delivered" : data.status === "dlq" ? "Dead lettered" : "Next attempt"}
          value={formatTime(
            data.status === "delivered" ? data.deliveredAt : data.status === "dlq" ? data.updatedAt : data.nextAttemptAt,
          )}
          hint={`Created ${formatTime(data.createdAt)}`}
        />
      </div>

      <Tabs defaultValue="timeline" className="mt-5">
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="payload">Payload</TabsTrigger>
          <TabsTrigger value="signature">Signature</TabsTrigger>
        </TabsList>
        <TabsContent value="timeline">
          <Card>
            <CardContent className="pt-5">
              {data.attempts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No HTTP attempts yet.</p>
              ) : (
                <ol className="space-y-4">
                  {data.attempts.map((attempt) => (
                    <li key={attempt.id} className="border-l border-primary/40 pl-4">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-medium">Attempt {attempt.attempt}</span>
                        <span className="text-xs text-muted-foreground">{formatTime(attempt.createdAt)}</span>
                        <span className="tabular text-xs">{attempt.statusCode ?? "no response"}</span>
                        <span className="tabular text-xs text-muted-foreground">{formatMs(attempt.durationMs)}</span>
                      </div>
                      {attempt.error ? <p className="mt-1 text-sm text-red-200">{attempt.error}</p> : null}
                      {attempt.responseSnippet ? (
                        <pre className="mt-2 overflow-x-auto rounded-md bg-background p-3 font-mono text-xs text-muted-foreground">
                          {attempt.responseSnippet}
                        </pre>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="payload">
          <Card>
            <CardHeader>
              <CardTitle>Exact bytes signed and sent</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="overflow-x-auto rounded-md bg-background p-3 font-mono text-xs">{data.event.payloadRaw}</pre>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="signature">
          <Card>
            <CardContent className="space-y-2 pt-5 text-sm">
              <p>
                Algorithm <span className="font-mono">{data.signature.algorithm}</span>
              </p>
              <p>
                Header <span className="font-mono">{data.signature.header}</span>
              </p>
              <p>
                Timestamp <span className="font-mono">{data.signature.timestampHeader}</span>
              </p>
              <p>
                Canonical string <span className="font-mono">{data.signature.canonical}</span>
              </p>
              <p className="text-muted-foreground">
                Receivers recompute the hex digest over the timestamp, a period, and the raw body, then compare it in constant time.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="truncate text-sm font-medium">{value}</div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{hint}</div>
      </CardContent>
    </Card>
  );
}
