import { config } from "./config.js";
import { keys } from "./keys.js";
import { log } from "./log.js";
import { redis } from "./redis.js";

export type MetricName = "ingested" | "delivered" | "retry" | "dlq";

export type MetricPoint = {
  bucket: number;
  ingested: number;
  delivered: number;
  retry: number;
  dlq: number;
};

export async function recordMetric(name: MetricName, amount = 1): Promise<void> {
  const bucket = Math.floor(Date.now() / config.metricBucketMs);
  const key = keys.metric(bucket);
  await redis.multi().hincrby(key, name, amount).expire(key, 600).exec();
}

export async function recordMetricQuiet(name: MetricName, amount = 1): Promise<void> {
  try {
    await recordMetric(name, amount);
  } catch (error) {
    log("warn", "metric write failed", {
      name,
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}

export async function readSeries(points = 24): Promise<MetricPoint[]> {
  const current = Math.floor(Date.now() / config.metricBucketMs);
  const buckets = Array.from({ length: points }, (_, index) => current - (points - 1) + index);
  const pipeline = redis.pipeline();
  for (const bucket of buckets) {
    pipeline.hgetall(keys.metric(bucket));
  }
  const rows = await pipeline.exec();
  return buckets.map((bucket, index) => {
    const hash = rows?.[index]?.[1];
    const read = (field: MetricName) => {
      if (!hash || typeof hash !== "object" || Array.isArray(hash)) return 0;
      const value = (hash as Record<string, string>)[field];
      return value ? Number(value) : 0;
    };
    return {
      bucket,
      ingested: read("ingested"),
      delivered: read("delivered"),
      retry: read("retry"),
      dlq: read("dlq"),
    };
  });
}
