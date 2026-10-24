import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMs, formatTime, hostOf } from "@/lib/format";
import type { Delivery } from "@/lib/types";

export function DeliveryTable({ deliveries, loading = false }: { deliveries: Delivery[]; loading?: boolean }) {
  if (loading) {
    return <p className="px-4 py-8 text-sm text-muted-foreground">Loading deliveries…</p>;
  }
  if (deliveries.length === 0) {
    return <p className="px-4 py-8 text-sm text-muted-foreground">No deliveries in this view.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Event</TableHead>
          <TableHead>Endpoint</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Attempt</TableHead>
          <TableHead>Latency</TableHead>
          <TableHead>Last error</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {deliveries.map((delivery) => (
          <TableRow key={delivery.id}>
            <TableCell className="whitespace-nowrap text-muted-foreground">{formatTime(delivery.createdAt)}</TableCell>
            <TableCell>
              <Link href={`/deliveries/${delivery.id}`} className="font-medium hover:text-primary">
                {delivery.event.type}
              </Link>
              <div className="font-mono text-[11px] text-muted-foreground">{delivery.id}</div>
            </TableCell>
            <TableCell>
              <div>{hostOf(delivery.endpoint.url)}</div>
              <div className="max-w-[220px] truncate text-xs text-muted-foreground">
                {delivery.endpoint.description ?? delivery.endpoint.url}
              </div>
            </TableCell>
            <TableCell>
              <StatusBadge status={delivery.status} />
            </TableCell>
            <TableCell className="tabular">
              {delivery.attempt}/{delivery.maxAttempts}
            </TableCell>
            <TableCell className="tabular">{formatMs(delivery.lastDurationMs)}</TableCell>
            <TableCell className="max-w-[240px] truncate text-xs text-muted-foreground">
              {delivery.lastError ?? "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
