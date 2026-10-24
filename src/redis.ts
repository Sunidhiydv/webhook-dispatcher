import { Redis } from "ioredis";
import { config } from "./config.js";
import { log } from "./log.js";

export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 2,
  connectTimeout: 5_000,
  enableReadyCheck: true,
});

redis.on("error", (error: Error) => {
  log("error", "redis connection error", { message: error.message });
});

export async function closeRedis(): Promise<void> {
  if (redis.status === "end") return;
  await redis.quit();
}
