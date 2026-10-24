import { config } from "./config.js";
import { prisma } from "./db.js";
import { HttpError } from "./errors.js";
import { readSeries } from "./metrics.js";
import { depth, workerHeartbeatAgeMs } from "./queue.js";
import { redis } from "./redis.js";

export type DependencyState = "up" | "down";

export async function getHealth() {
  let postgres: DependencyState = "down";
  let redisState: DependencyState = "down";
  let queue = { ready: 0, processing: 0 };

  try {
    await prisma.$queryRaw`SELECT 1`;
    postgres = "up";
  } catch {
    postgres = "down";
  }

  try {
    const reply = await redis.ping();
    if (reply === "PONG") {
      redisState = "up";
      queue = await depth();
    }
  } catch {
    redisState = "down";
  }

  let worker: DependencyState = "down";
  if (redisState === "up") {
    try {
      const age = await workerHeartbeatAgeMs();
      if (age !== null && age < 5_000) worker = "up";
    } catch {
      worker = "down";
    }
  }

  return {
    ok: postgres === "up" && redisState === "up",
    postgres,
    redis: redisState,
    worker,
    queue,
  };
}

export async function getStats() {
  const health = await getHealth();
  if (health.postgres !== "up") {
    throw new HttpError(503, "postgres_unavailable", "PostgreSQL is unavailable");
  }

  const since = new Date(Date.now() - 60_000);
  const [grouped, attemptCount, successCount, latency, dlqRecent, ingested, activeEndpoints, disabledEndpoints] =
    await Promise.all([
      prisma.delivery.groupBy({ by: ["status"], _count: true }),
      prisma.attempt.count({ where: { createdAt: { gte: since } } }),
      prisma.attempt.count({
        where: { createdAt: { gte: since }, statusCode: { gte: 200, lt: 300 } },
      }),
      prisma.attempt.aggregate({
        where: { createdAt: { gte: since } },
        _avg: { durationMs: true },
      }),
      prisma.delivery.count({ where: { status: "dlq", updatedAt: { gte: since } } }),
      prisma.event.count({ where: { createdAt: { gte: since } } }),
      prisma.endpoint.count({ where: { active: true } }),
      prisma.endpoint.count({ where: { active: false } }),
    ]);

  const counts = {
    pending: 0,
    queued: 0,
    delivering: 0,
    retrying: 0,
    delivered: 0,
    dlq: 0,
  };
  for (const row of grouped) {
    counts[row.status] = row._count;
  }

  const p95Rows = await prisma.$queryRaw<Array<{ p95: number | null }>>`
    SELECT COALESCE(
      percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms),
      0
    )::float8 AS p95
    FROM attempts
    WHERE created_at >= ${since}
  `;

  let series: Awaited<ReturnType<typeof readSeries>> = [];
  if (health.redis === "up") {
    try {
      series = await readSeries(24);
    } catch {
      series = [];
    }
  }

  return {
    health,
    queue: health.queue,
    counts,
    endpoints: { active: activeEndpoints, disabled: disabledEndpoints },
    windowSeconds: 60,
    maxAttempts: config.maxAttempts,
    recent: {
      ingested,
      attempts: attemptCount,
      delivered: successCount,
      dlq: dlqRecent,
      successRate: attemptCount === 0 ? null : successCount / attemptCount,
      avgLatencyMs: latency._avg.durationMs,
      p95LatencyMs: Number(p95Rows[0]?.p95 ?? 0),
    },
    series,
  };
}
