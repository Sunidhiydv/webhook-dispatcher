import { keys } from "./keys.js";
import { ACK, CLAIM, ENQUEUE, REAP, RESCHEDULE, TOKEN_BUCKET } from "./lua.js";
import { redis } from "./redis.js";

export type QueueDepth = {
  ready: number;
  processing: number;
};

export async function enqueue(items: readonly { id: string; score: number }[]): Promise<number> {
  if (items.length === 0) return 0;
  const args: Array<string | number> = [];
  for (const item of items) {
    args.push(item.score, item.id);
  }
  const added = await redis.eval(ENQUEUE, 2, keys.ready, keys.processing, ...args);
  return Number(added);
}

export async function claim(limit: number, visibilityMs: number, now = Date.now()): Promise<string[]> {
  if (limit <= 0) return [];
  const result = await redis.eval(CLAIM, 2, keys.ready, keys.processing, now, limit, visibilityMs);
  if (!Array.isArray(result)) return [];
  return result.filter((item): item is string => typeof item === "string");
}

export async function reap(now = Date.now(), limit = 100): Promise<number> {
  const moved = await redis.eval(REAP, 2, keys.ready, keys.processing, now, limit);
  return Number(moved);
}

export async function ack(id: string): Promise<void> {
  await redis.eval(ACK, 2, keys.ready, keys.processing, id);
}

export async function reschedule(id: string, score: number): Promise<void> {
  await redis.eval(RESCHEDULE, 2, keys.ready, keys.processing, id, score);
}

export async function locate(id: string): Promise<"ready" | "processing" | "none"> {
  const pipeline = redis.pipeline();
  pipeline.zscore(keys.ready, id);
  pipeline.zscore(keys.processing, id);
  const result = await pipeline.exec();
  const processingScore = result?.[1]?.[1];
  const readyScore = result?.[0]?.[1];
  if (typeof processingScore === "string") return "processing";
  if (typeof readyScore === "string") return "ready";
  return "none";
}

export async function depth(): Promise<QueueDepth> {
  const [ready, processing] = await Promise.all([redis.zcard(keys.ready), redis.zcard(keys.processing)]);
  return { ready, processing };
}

export async function takeToken(
  endpointId: string,
  ratePerSecond: number,
  now = Date.now(),
): Promise<{ allowed: boolean; retryMs: number }> {
  const rate = Math.max(1, Math.floor(ratePerSecond));
  const result = await redis.eval(TOKEN_BUCKET, 1, keys.rateLimit(endpointId), now, rate, rate);
  if (!Array.isArray(result)) return { allowed: false, retryMs: 1_000 };
  const allowed = Number(result[0] ?? 0) === 1;
  const retryMs = Math.max(0, Number(result[1] ?? 1_000));
  return { allowed, retryMs };
}

export async function touchWorkerHeartbeat(): Promise<void> {
  await redis.set(keys.workerHeartbeat, String(Date.now()), "PX", 5_000);
}

export async function workerHeartbeatAgeMs(now = Date.now()): Promise<number | null> {
  const raw = await redis.get(keys.workerHeartbeat);
  if (!raw) return null;
  const stamped = Number(raw);
  if (!Number.isFinite(stamped)) return null;
  return Math.max(0, now - stamped);
}
