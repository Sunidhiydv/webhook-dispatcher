import dotenv from "dotenv";

dotenv.config({ override: true, quiet: true });

function integer(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const value = raw === undefined || raw === "" ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function flag(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  throw new Error(`${name} must be true or false`);
}

export const config = {
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgresql://dispatcher:dispatcher@127.0.0.1:5433/dispatcher?schema=public",
  redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6380",
  port: integer("PORT", 4000, 1, 65535),
  host: process.env.HOST ?? "0.0.0.0",
  apiKey: process.env.API_KEY ?? "dev-local-key",
  logLevel: process.env.LOG_LEVEL ?? "info",
  workerConcurrency: integer("WORKER_CONCURRENCY", 16, 1, 512),
  maxAttempts: integer("MAX_ATTEMPTS", 5, 1, 20),
  backoffBaseMs: integer("BACKOFF_BASE_MS", 1_000, 1, 3_600_000),
  backoffCapMs: integer("BACKOFF_CAP_MS", 60_000, 1, 3_600_000),
  visibilityTimeoutMs: integer("VISIBILITY_TIMEOUT_MS", 30_000, 1_000, 600_000),
  httpTimeoutMs: integer("HTTP_TIMEOUT_MS", 10_000, 100, 300_000),
  httpPoolConnections: integer("HTTP_POOL_CONNECTIONS", 64, 1, 512),
  signatureToleranceSeconds: integer("SIGNATURE_TOLERANCE_SECONDS", 300, 0, 86_400),
  allowPrivateTargets: flag("ALLOW_PRIVATE_TARGETS", true),
  sinkSecret: process.env.SINK_SECRET ?? "whsec_sink_dev_secret",
  metricBucketMs: 5_000,
  maxFanout: 200,
};

if (config.visibilityTimeoutMs <= config.httpTimeoutMs) {
  throw new Error("VISIBILITY_TIMEOUT_MS must be greater than HTTP_TIMEOUT_MS");
}

if (config.backoffCapMs < config.backoffBaseMs) {
  throw new Error("BACKOFF_CAP_MS must be greater than or equal to BACKOFF_BASE_MS");
}

if (config.apiKey.length < 8) {
  throw new Error("API_KEY must be at least 8 characters");
}
