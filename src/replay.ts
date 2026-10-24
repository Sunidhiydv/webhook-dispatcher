import { prisma } from "./db.js";
import { HttpError } from "./errors.js";
import { log } from "./log.js";
import { enqueue } from "./queue.js";

const replayable = new Set(["dlq", "delivered"]);

export async function replayDelivery(id: string): Promise<void> {
  const existing = await prisma.delivery.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "not_found", "Delivery not found");
  if (!replayable.has(existing.status)) {
    throw new HttpError(
      409,
      "not_replayable",
      "Only delivered or dead-lettered deliveries can be replayed",
    );
  }

  await prisma.delivery.update({
    where: { id },
    data: {
      status: "pending",
      attempt: 0,
      nextAttemptAt: new Date(),
      lockToken: null,
      lockedUntil: null,
      lastStatusCode: null,
      lastError: null,
      lastDurationMs: null,
      deliveredAt: null,
    },
  });

  try {
    await enqueue([{ id, score: Date.now() }]);
    await prisma.delivery.updateMany({
      where: { id, status: "pending" },
      data: { status: "queued" },
    });
  } catch (error) {
    log("warn", "replay enqueue failed; outbox will retry", {
      deliveryId: id,
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}

export async function replayDeadLetters(limit: number): Promise<string[]> {
  const rows = await prisma.delivery.findMany({
    where: { status: "dlq" },
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: { id: true },
  });
  const ids: string[] = [];
  for (const row of rows) {
    await replayDelivery(row.id);
    ids.push(row.id);
  }
  return ids;
}
