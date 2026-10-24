import { cn } from "@/lib/utils";
import type { DeliveryStatus } from "@/lib/types";

const tones: Record<DeliveryStatus, string> = {
  delivered: "bg-emerald-400/15 text-emerald-200",
  dlq: "bg-red-400/15 text-red-200",
  retrying: "bg-amber-300/15 text-amber-100",
  delivering: "bg-sky-400/15 text-sky-100",
  queued: "bg-zinc-300/10 text-zinc-200",
  pending: "bg-zinc-300/10 text-zinc-400",
};

export function StatusBadge({ status }: { status: DeliveryStatus }) {
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide", tones[status])}>{status}</span>;
}
