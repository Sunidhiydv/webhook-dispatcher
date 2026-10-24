"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

export function usePolling<T>(path: string | null, intervalMs = 2000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const next = await api<T>(path);
        if (cancelled) return;
        setData(next);
        setError(null);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Request failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
      if (!cancelled) timer = setTimeout(() => void tick(), intervalMs);
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [path, intervalMs, nonce]);

  return { data, error, loading, refresh };
}
