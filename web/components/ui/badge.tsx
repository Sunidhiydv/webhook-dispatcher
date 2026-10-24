import type * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-transparent px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
        className,
      )}
      {...props}
    />
  );
}
