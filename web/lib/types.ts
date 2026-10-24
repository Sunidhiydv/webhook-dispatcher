export type DeliveryStatus = "pending" | "queued" | "delivering" | "retrying" | "delivered" | "dlq";

export type Health = {
  ok: boolean;
  postgres: "up" | "down";
  redis: "up" | "down";
  worker: "up" | "down";
  queue: { ready: number; processing: number };
};

export type MetricPoint = {
  bucket: number;
  ingested: number;
  delivered: number;
  retry: number;
  dlq: number;
};

export type Stats = {
  health: Health;
  queue: { ready: number; processing: number };
  counts: Record<DeliveryStatus, number>;
  endpoints: { active: number; disabled: number };
  windowSeconds: number;
  maxAttempts: number;
  recent: {
    ingested: number;
    attempts: number;
    delivered: number;
    dlq: number;
    successRate: number | null;
    avgLatencyMs: number | null;
    p95LatencyMs: number | null;
  };
  series: MetricPoint[];
};

export type Delivery = {
  id: string;
  status: DeliveryStatus;
  attempt: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastStatusCode: number | null;
  lastError: string | null;
  lastDurationMs: number | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  event: { id: string; type: string; createdAt: string };
  endpoint: { id: string; url: string; description: string | null };
};

export type Attempt = {
  id: string;
  attempt: number;
  statusCode: number | null;
  error: string | null;
  durationMs: number;
  responseSnippet: string | null;
  createdAt: string;
};

export type DeliveryDetail = Delivery & {
  event: Delivery["event"] & { payload: unknown; payloadRaw: string };
  attempts: Attempt[];
  signature: {
    algorithm: string;
    header: string;
    timestampHeader: string;
    canonical: string;
  };
};

export type Endpoint = {
  id: string;
  url: string;
  secret: string;
  description: string | null;
  eventTypes: string[];
  active: boolean;
  rateLimitPerSecond: number;
  deliveryCount: number;
  createdAt: string;
  updatedAt: string;
};

export type Page<T> = {
  items: T[];
  limit: number;
  offset: number;
  total: number;
};

export type IngestResponse = {
  replayed: boolean;
  event: { id: string; type: string; createdAt: string };
  deliveries: Delivery[];
};
