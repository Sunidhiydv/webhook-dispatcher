"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArchiveX, Gauge, Radio, Send, Webhook, Waypoints } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { usePolling } from "@/lib/use-polling";
import type { Health } from "@/lib/types";

const nav = [
  { href: "/", label: "Overview", icon: Gauge },
  { href: "/deliveries", label: "Deliveries", icon: Waypoints },
  { href: "/dlq", label: "Dead letter", icon: ArchiveX },
  { href: "/endpoints", label: "Endpoints", icon: Webhook },
  { href: "/emit", label: "Emit", icon: Send },
];

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data } = usePolling<Health>("/health", 3000);

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px]">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-card/70 px-4 py-5 md:flex">
        <Brand />
        <Nav pathname={pathname} className="mt-8 flex flex-col gap-1" />
        <HealthList health={data} className="mt-auto" />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3 md:hidden">
          <Brand />
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b px-3 py-2 md:hidden">
          <Nav pathname={pathname} className="flex gap-1" />
        </nav>
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
        <footer className="border-t px-4 py-3 font-mono text-[11px] text-muted-foreground md:px-8">
          Postgres before Redis · atomic Lua claims · full-jitter backoff · HMAC-SHA256
        </footer>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
        <Radio className="h-4 w-4" />
      </span>
      <span>
        <span className="block text-sm font-semibold leading-none">Dispatch</span>
        <span className="mt-1 block text-[11px] text-muted-foreground">Delivery control plane</span>
      </span>
    </Link>
  );
}

function Nav({ pathname, className }: { pathname: string; className?: string }) {
  return (
    <div className={className}>
      {nav.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground",
              active && "bg-primary/15 text-primary",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

function HealthList({ health, className }: { health: Health | null; className?: string }) {
  const rows = [
    ["Postgres", health?.postgres],
    ["Redis", health?.redis],
    ["Worker", health?.worker],
  ] as const;
  return (
    <div className={cn("space-y-2 rounded-md border bg-background/50 p-3", className)}>
      {rows.map(([label, state]) => (
        <div key={label} className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{label}</span>
          <span className={state === "up" ? "text-emerald-300" : state === "down" ? "text-red-300" : "text-muted-foreground"}>
            {state ?? "…"}
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Ready / inflight</span>
        <span className="tabular">
          {health ? `${health.queue.ready} / ${health.queue.processing}` : "—"}
        </span>
      </div>
    </div>
  );
}
