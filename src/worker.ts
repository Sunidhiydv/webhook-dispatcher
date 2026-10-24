import { pathToFileURL } from "node:url";
import { config } from "./config.js";
import { prisma, waitForPostgres, waitForRedis } from "./db.js";
import { processDelivery } from "./dispatcher.js";
import { closeWebhookClient } from "./http.js";
import { log } from "./log.js";
import { claim, reap, touchWorkerHeartbeat } from "./queue.js";
import { reconcileOutbox } from "./reconcile.js";
import { closeRedis, redis } from "./redis.js";

export async function runWorker(signal: AbortSignal): Promise<void> {
  const inflight = new Set<Promise<void>>();
  let lastReconcile = 0;

  while (!signal.aborted) {
    try {
      await touchWorkerHeartbeat();
      const reaped = await reap();
      if (reaped > 0) log("warn", "reaped expired claims", { count: reaped });

      const now = Date.now();
      if (now - lastReconcile >= 2_000) {
        lastReconcile = now;
        await reconcileOutbox();
      }

      const slots = config.workerConcurrency - inflight.size;
      if (slots <= 0) {
        await Promise.race(inflight);
        continue;
      }

      const ids = await claim(slots, config.visibilityTimeoutMs);
      if (ids.length === 0) {
        await sleep(200, signal);
        continue;
      }

      for (const id of ids) {
        const job = processDelivery(id)
          .catch((error: unknown) => {
            log("error", "delivery failed open", {
              deliveryId: id,
              message: error instanceof Error ? error.message : "unknown",
            });
          })
          .finally(() => {
            inflight.delete(job);
          });
        inflight.add(job);
      }
    } catch (error) {
      if (signal.aborted) break;
      log("error", "worker loop error", {
        message: error instanceof Error ? error.message : "unknown",
      });
      await sleep(1_000, signal);
    }
  }

  await Promise.allSettled([...inflight]);
}

async function main(): Promise<void> {
  await waitForPostgres();
  await waitForRedis(() => redis.ping());
  const controller = new AbortController();
  const stop = (signalName: string) => {
    log("info", "worker stopping", { signal: signalName });
    controller.abort();
  };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));
  log("info", "worker started", {
    concurrency: config.workerConcurrency,
    maxAttempts: config.maxAttempts,
  });
  try {
    await runWorker(controller.signal);
  } finally {
    await closeWebhookClient();
    await closeRedis();
    await prisma.$disconnect();
  }
}

if (isDirectRun()) {
  main().catch((error: unknown) => {
    log("error", "worker crashed", { message: error instanceof Error ? error.message : "unknown" });
    process.exit(1);
  });
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}
