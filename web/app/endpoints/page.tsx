"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { hostOf } from "@/lib/format";
import { usePolling } from "@/lib/use-polling";
import type { Endpoint, Page } from "@/lib/types";

export default function EndpointsPage() {
  const { data, error, refresh } = usePolling<Page<Endpoint>>("/v1/endpoints?limit=100", 3000);
  const [message, setMessage] = useState<string | null>(null);

  async function toggle(endpoint: Endpoint) {
    setMessage(null);
    try {
      await api(`/v1/endpoints/${endpoint.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !endpoint.active }),
      });
      refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Update failed");
    }
  }

  async function remove(endpoint: Endpoint) {
    setMessage(null);
    try {
      await api(`/v1/endpoints/${endpoint.id}`, { method: "DELETE" });
      refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Delete failed");
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Endpoints</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Empty event types subscribe to everything. Each endpoint has its own HMAC secret and Redis token bucket.
          </p>
        </div>
        <CreateEndpoint onCreated={refresh} />
      </div>
      {error ? <p className="mb-3 text-sm text-red-200">{error}</p> : null}
      {message ? <p className="mb-3 text-sm text-muted-foreground">{message}</p> : null}
      <div className="grid gap-3">
        {(data?.items ?? []).map((endpoint) => (
          <Card key={endpoint.id}>
            <CardContent className="flex flex-wrap items-start justify-between gap-4 pt-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-sm font-medium">{endpoint.description ?? hostOf(endpoint.url)}</h2>
                  <span className={endpoint.active ? "text-xs text-emerald-300" : "text-xs text-zinc-400"}>
                    {endpoint.active ? "active" : "disabled"}
                  </span>
                </div>
                <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{endpoint.url}</p>
                <p className="mt-2 font-mono text-[11px] text-muted-foreground">{endpoint.secret}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {(endpoint.eventTypes.length === 0 ? ["*"] : endpoint.eventTypes).join(", ")} · {endpoint.rateLimitPerSecond} req/s ·{" "}
                  {endpoint.deliveryCount} {endpoint.deliveryCount === 1 ? "delivery" : "deliveries"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => void toggle(endpoint)}>
                  {endpoint.active ? "Disable" : "Enable"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void remove(endpoint)}>
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {data && data.items.length === 0 ? <p className="text-sm text-muted-foreground">No endpoints yet.</p> : null}
      </div>
    </div>
  );
}

function CreateEndpoint({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("https://example.com/hooks/billing");
  const [description, setDescription] = useState("");
  const [eventTypes, setEventTypes] = useState("");
  const [rate, setRate] = useState("25");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const types = eventTypes
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      await api("/v1/endpoints", {
        method: "POST",
        body: JSON.stringify({
          url,
          description: description || undefined,
          eventTypes: types,
          rateLimitPerSecond: Number(rate),
        }),
      });
      setOpen(false);
      onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Create failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New endpoint</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register an endpoint</DialogTitle>
          <DialogDescription>The secret is generated and shown on the endpoint card.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(event) => void submit(event)}>
          <div className="space-y-1">
            <Label htmlFor="url">URL</Label>
            <Input id="url" value={url} onChange={(event) => setUrl(event.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="description">Description</Label>
            <Input id="description" value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="types">Event types</Label>
            <Input id="types" placeholder="invoice.paid, user.created" value={eventTypes} onChange={(event) => setEventTypes(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rate">Rate limit / second</Label>
            <Input id="rate" type="number" min={1} max={5000} value={rate} onChange={(event) => setRate(event.target.value)} />
          </div>
          {error ? <p className="text-sm text-red-200">{error}</p> : null}
          <Button type="submit" disabled={pending}>
            Create
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
