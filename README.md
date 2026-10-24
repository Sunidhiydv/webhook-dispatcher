# Dispatch

A webhook delivery engine with a durable Postgres outbox, a Redis sorted-set queue, and an operations console.

Events are committed to PostgreSQL before they are queued. Workers claim jobs with a Lua script so a crash hands the job to another worker instead of dropping it. Transient failures use exponential backoff with full jitter. Non-retryable client errors go straight to the dead-letter queue. Every outbound request is signed with HMAC-SHA256.

## Guarantees

- **Zero data loss on the accept path.** `POST /v1/events` inserts the event and one delivery row per endpoint inside a transaction. Redis is updated only after commit. If Redis is down, rows stay `pending` and the worker reconciles them.
- **At-least-once delivery.** Claiming moves a job from `wh:ready` to `wh:processing` in one Lua script, with a visibility timeout. A second conditional update in Postgres takes a lock token so two workers cannot both record success.
- **Bounded retries.** Timeouts, network errors, `408`, `425`, `429`, and `5xx` are retried up to 5 times. Backoff is `random(0, min(cap, base * 2^(attempt-1)))`. Other `4xx` responses and redirects are dead-lettered immediately.
- **Signed bodies.** The worker sends the stored raw JSON bytes and sets `X-Webhook-Timestamp` plus `X-Webhook-Signature`. The signature is hex HMAC-SHA256 of `timestamp + "." + rawBody`.

## Layout

```
src/                API, worker, queue, delivery
prisma/             schema and migrations
web/                Next.js control plane
k6/ingest.js        ingest load script
docker-compose.yml  Postgres 16 and Redis 7
```

Host ports are **5433** and **6380** so the stack can run beside a local Postgres or Redis.

## Run it

```bash
docker compose up -d
npm install
npm run db:migrate
npm run dev
npm run seed
npm install --prefix web
npm run dev --prefix web
```

The API listens on `http://127.0.0.1:4000` and the console on `http://127.0.0.1:3000`. The dev API key is `dev-local-key`.

`npm run seed` registers three local endpoints and, when the database is empty, emits `invoice.paid`:

| Endpoint | Behavior |
| --- | --- |
| `http://127.0.0.1:4000/sink` | Verifies the signature and returns 200 |
| `http://127.0.0.1:4000/sink/flaky` | Returns 503 until attempt 3 |
| `http://127.0.0.1:4000/sink/reject` | Returns 400 and is dead-lettered |

## API

Authenticated routes expect `Authorization: Bearer $API_KEY`. `/health` and the built-in sinks are public.

```bash
curl -s http://127.0.0.1:4000/v1/events \
  -H "authorization: Bearer dev-local-key" \
  -H "content-type: application/json" \
  -d '{"type":"invoice.paid","payload":{"id":"inv_9","amount":2500}}'
```

- `POST /v1/events` accepts `{ type, payload, endpointIds?, idempotencyKey? }` and returns `202`, or `200` when the idempotency key already exists.
- `GET /v1/deliveries` and `GET /v1/deliveries/:id` show status, attempts, and the raw body that was signed.
- `POST /v1/deliveries/:id/replay` and `POST /v1/dlq/replay` requeue a delivered or dead-lettered job with a fresh attempt budget. Attempt history is kept.
- `POST /v1/endpoints` registers a URL, an optional event filter, a per-endpoint rate limit, and a generated `whsec_` secret.

An empty `eventTypes` list subscribes to every event. Passing `endpointIds` targets those endpoints directly.

## Verify a signature

```js
import { createHmac, timingSafeEqual } from "node:crypto";

const timestamp = request.headers["x-webhook-timestamp"];
const signature = request.headers["x-webhook-signature"];
const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
const valid =
  expected.length === signature.length &&
  timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
```

Reject timestamps outside the skew window (`SIGNATURE_TOLERANCE_SECONDS`, default 300). Compare the raw request body, not a re-serialized object.

## Operations

Multiple worker processes share the queue. Redis holds ready time and the in-flight set; Postgres is the audit log and the recovery source. Per-endpoint rate limits are a Redis token bucket. A denied token parks the job without consuming an attempt.

Outbound HTTP uses an undici agent with a keep-alive pool. Redirects are not followed.

```bash
npm test
npm run k6
```

`k6` expects [k6](https://k6.io) on your PATH. The Docker profile `app` builds the API and worker images: `docker compose --profile app up --build`.
