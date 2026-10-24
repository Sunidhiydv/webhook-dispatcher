"use client";

import { useState } from "react";
import { DeliveryTable } from "@/components/delivery-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { usePolling } from "@/lib/use-polling";
import type { Delivery, DeliveryStatus, Page } from "@/lib/types";

const filters: Array<DeliveryStatus | "all"> = ["all", "queued", "delivering", "retrying", "delivered", "dlq", "pending"];

export default function DeliveriesPage() {
  const [status, setStatus] = useState<DeliveryStatus | "all">("all");
  const path = status === "all" ? "/v1/deliveries?limit=50" : `/v1/deliveries?limit=50&status=${status}`;
  const { data, error, loading } = usePolling<Page<Delivery>>(path, 2000);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Deliveries</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every fan-out target is a durable row. Open one to see attempts, payload, and the signature contract.
        </p>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((filter) => (
          <Button key={filter} size="sm" variant={status === filter ? "default" : "outline"} onClick={() => setStatus(filter)}>
            {filter}
          </Button>
        ))}
      </div>
      {error ? <p className="mb-3 text-sm text-red-200">{error}</p> : null}
      <Card>
        <DeliveryTable deliveries={data?.items ?? []} loading={loading && !data} />
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">{data ? `${data.total} matching` : "Loading"}</p>
    </div>
  );
}
