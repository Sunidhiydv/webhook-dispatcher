"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { hostOf } from "@/lib/format";
import { usePolling } from "@/lib/use-polling";
import type { Endpoint, IngestResponse, Page } from "@/lib/types";

const starter = `{
  "id": "inv_1002",
  "amount": 4200,
  "currency": "usd"
}`;

export default function EmitPage() {
  const endpoints = usePolling<Page<Endpoint>>("/v1/endpoints?limit=100", 5000);
  const [type, setType] = useState("invoice.paid");
  const [payload, setPayload] = useState(starter);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [pending, setPending] = useState(false);

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const body = JSON.parse(payload) as unknown;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new Error("Payload must be a JSON object");
      }
      const response = await api<IngestResponse>("/v1/events", {
        method: "POST",
        body: JSON.stringify({
          type,
          payload: body,
          endpointIds: selected.length > 0 ? selected : undefined,
          idempotencyKey: idempotencyKey || undefined,
        }),
      });
      setResult(response);
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : "Emit failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Emit</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The event is committed first. Redis is notified after the database transaction. Leave endpoints unchecked to fan out to every active subscriber.
        </p>
        <form className="mt-5 space-y-4" onSubmit={(event) => void submit(event)}>
          <div className="space-y-1">
            <Label htmlFor="type">Event type</Label>
            <Input id="type" value={type} onChange={(event) => setType(event.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="payload">Payload</Label>
            <Textarea id="payload" value={payload} onChange={(event) => setPayload(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="idempotency">Idempotency key</Label>
            <Input
              id="idempotency"
              placeholder="Optional, 8–200 characters"
              value={idempotencyKey}
              onChange={(event) => setIdempotencyKey(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Sending" : "Send event"}
          </Button>
          {error ? <p className="text-sm text-red-200">{error}</p> : null}
        </form>

        {result ? (
          <Card className="mt-5">
            <CardHeader>
              <CardTitle>{result.replayed ? "Idempotent replay" : "Accepted"} · {result.event.id}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {result.deliveries.length === 0 ? <p className="text-sm text-muted-foreground">No endpoints matched.</p> : null}
              {result.deliveries.map((delivery) => (
                <Link key={delivery.id} href={`/deliveries/${delivery.id}`} className="block text-sm hover:text-primary">
                  <span className="font-mono text-xs">{delivery.status}</span> · {delivery.endpoint.description ?? delivery.endpoint.url}
                </Link>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Targets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(endpoints.data?.items ?? []).map((endpoint) => (
            <label key={endpoint.id} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.includes(endpoint.id)}
                onChange={() => toggle(endpoint.id)}
                disabled={!endpoint.active}
              />
              <span>
                <span className="block">{endpoint.description ?? hostOf(endpoint.url)}</span>
                <span className="block font-mono text-[11px] text-muted-foreground">{hostOf(endpoint.url)}</span>
              </span>
            </label>
          ))}
          <p className="text-xs text-muted-foreground">
            Seeded sinks: a 200, a 503 until attempt 3, and a 400 that dead-letters immediately.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
