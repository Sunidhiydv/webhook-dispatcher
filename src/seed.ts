import { config } from "./config.js";
import { prisma } from "./db.js";
import { ingestEvent } from "./ingest.js";
import { log } from "./log.js";
import { closeRedis } from "./redis.js";

const sinks = [
  {
    id: "ep_local_sink",
    url: "http://127.0.0.1:4000/sink",
    description: "Local signed sink",
  },
  {
    id: "ep_local_flaky",
    url: "http://127.0.0.1:4000/sink/flaky",
    description: "Fails attempts 1 and 2, then succeeds",
  },
  {
    id: "ep_local_reject",
    url: "http://127.0.0.1:4000/sink/reject",
    description: "Returns 400 and goes straight to the DLQ",
  },
];

async function main(): Promise<void> {
  for (const sink of sinks) {
    await prisma.endpoint.upsert({
      where: { id: sink.id },
      update: {
        url: sink.url,
        secret: config.sinkSecret,
        description: sink.description,
        active: true,
      },
      create: {
        id: sink.id,
        url: sink.url,
        secret: config.sinkSecret,
        description: sink.description,
        eventTypes: [],
        rateLimitPerSecond: 50,
        active: true,
      },
    });
  }

  const existing = await prisma.event.count();
  if (existing === 0) {
    const result = await ingestEvent({
      type: "invoice.paid",
      payload: { id: "inv_1001", amount: 2500, currency: "usd" },
      idempotencyKey: "seed-invoice-paid",
    });
    log("info", "seeded sample event", { eventId: result.event.id, deliveries: result.deliveries.length });
  }

  log("info", "seed complete", { endpoints: sinks.map((sink) => sink.id) });
  await closeRedis();
  await prisma.$disconnect();
}

main().catch(async (error: unknown) => {
  log("error", "seed failed", { message: error instanceof Error ? error.message : "unknown" });
  await closeRedis().catch(() => undefined);
  await prisma.$disconnect();
  process.exit(1);
});
