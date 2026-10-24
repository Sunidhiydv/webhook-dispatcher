"use client";

import { useState } from "react";
import { DeliveryTable } from "@/components/delivery-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { usePolling } from "@/lib/use-polling";
import type { Delivery, Page } from "@/lib/types";

export default function DeadLetterPage() {
  const { data, error, loading, refresh } = usePolling<Page<Delivery>>("/v1/deliveries?status=dlq&limit=50", 2000);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function replay() {
    setPending(true);
    setMessage(null);
    try {
      const result = await api<{ replayed: number }>("/v1/dlq/replay", {
        method: "POST",
        body: JSON.stringify({ limit: 50 }),
      });
      setMessage(`Requeued ${result.replayed} deliveries.`);
      refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Replay failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dead letter</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Non-retryable 4xx responses land here immediately. Transient failures land here after five attempts.
          </p>
        </div>
        <Button disabled={pending || (data?.total ?? 0) === 0} onClick={() => void replay()}>
          Replay 50
        </Button>
      </div>
      {error ? <p className="mb-3 text-sm text-red-200">{error}</p> : null}
      {message ? <p className="mb-3 text-sm text-muted-foreground">{message}</p> : null}
      <Card>
        <DeliveryTable deliveries={data?.items ?? []} loading={loading && !data} />
      </Card>
    </div>
  );
}
