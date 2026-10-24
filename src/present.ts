import { config } from "./config.js";

type DeliveryRow = {
  id: string;
  status: string;
  attempt: number;
  nextAttemptAt: Date;
  lastStatusCode: number | null;
  lastError: string | null;
  lastDurationMs: number | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  event: {
    id: string;
    type: string;
    createdAt: Date;
  };
  endpoint: {
    id: string;
    url: string;
    description: string | null;
  };
};

type AttemptRow = {
  id: string;
  attempt: number;
  statusCode: number | null;
  error: string | null;
  durationMs: number;
  responseSnippet: string | null;
  createdAt: Date;
};

export function presentDelivery(row: DeliveryRow) {
  return {
    id: row.id,
    status: row.status,
    attempt: row.attempt,
    maxAttempts: config.maxAttempts,
    nextAttemptAt: row.nextAttemptAt.toISOString(),
    lastStatusCode: row.lastStatusCode,
    lastError: row.lastError,
    lastDurationMs: row.lastDurationMs,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    event: {
      id: row.event.id,
      type: row.event.type,
      createdAt: row.event.createdAt.toISOString(),
    },
    endpoint: row.endpoint,
  };
}

export function presentDeliveryDetail(
  row: DeliveryRow & {
    event: DeliveryRow["event"] & { payload: unknown; payloadRaw: string };
    attempts: AttemptRow[];
  },
) {
  const base = presentDelivery(row);
  return {
    ...base,
    event: {
      ...base.event,
      payload: row.event.payload,
      payloadRaw: row.event.payloadRaw,
    },
    attempts: row.attempts.map((attempt) => ({
      id: attempt.id,
      attempt: attempt.attempt,
      statusCode: attempt.statusCode,
      error: attempt.error,
      durationMs: attempt.durationMs,
      responseSnippet: attempt.responseSnippet,
      createdAt: attempt.createdAt.toISOString(),
    })),
    signature: {
      algorithm: "HMAC-SHA256",
      header: "X-Webhook-Signature",
      timestampHeader: "X-Webhook-Timestamp",
      canonical: "timestamp + '.' + rawBody",
    },
  };
}

export function presentEndpoint(endpoint: {
  id: string;
  url: string;
  secret: string;
  description: string | null;
  eventTypes: string[];
  active: boolean;
  rateLimitPerSecond: number;
  createdAt: Date;
  updatedAt: Date;
  _count?: { deliveries: number };
}) {
  return {
    id: endpoint.id,
    url: endpoint.url,
    secret: endpoint.secret,
    description: endpoint.description,
    eventTypes: endpoint.eventTypes,
    active: endpoint.active,
    rateLimitPerSecond: endpoint.rateLimitPerSecond,
    deliveryCount: endpoint._count?.deliveries ?? 0,
    createdAt: endpoint.createdAt.toISOString(),
    updatedAt: endpoint.updatedAt.toISOString(),
  };
}

export function presentEvent(event: {
  id: string;
  type: string;
  payload?: unknown;
  createdAt: Date;
  _count?: { deliveries: number };
}) {
  return {
    id: event.id,
    type: event.type,
    payload: event.payload,
    deliveryCount: event._count?.deliveries ?? 0,
    createdAt: event.createdAt.toISOString(),
  };
}
