import { pathToFileURL } from "node:url";
import { buildServer } from "./app.js";
import { config } from "./config.js";
import { prisma, waitForPostgres, waitForRedis } from "./db.js";
import { log } from "./log.js";
import { closeRedis, redis } from "./redis.js";

async function main(): Promise<void> {
  await waitForPostgres();
  try {
    await waitForRedis(() => redis.ping(), 10);
  } catch (error) {
    log("warn", "redis unavailable; accepted events stay in the outbox until it recovers", {
      message: error instanceof Error ? error.message : "unknown",
    });
  }

  const app = await buildServer();
  const shutdown = async (signal: string) => {
    log("info", "api shutting down", { signal });
    await app.close();
    await closeRedis();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  await app.listen({ port: config.port, host: config.host });
  log("info", "api listening", { port: config.port });
}

if (isDirectRun()) {
  main().catch((error: unknown) => {
    log("error", "api crashed", { message: error instanceof Error ? error.message : "unknown" });
    process.exit(1);
  });
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}
