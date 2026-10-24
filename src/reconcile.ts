import { prisma } from "./db.js";
import { log } from "./log.js";
import { enqueue, locate } from "./queue.js";

export async function reconcileOutbox(limit = 100): Promise<number> {
  const now = new Date();
  const rows = await prisma.delivery.findMany({
    where: {
      status: { in: ["pending", "queued", "retrying"] },
      nextAttemptAt: { lte: now },
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
    },
    select: { id: true, status: true, nextAttemptAt: true },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
  });

  let repaired = 0;
  for (const row of rows) {
    const place = await locate(row.id);
    if (place !== "none") continue;
    const score = Math.max(Date.now(), row.nextAttemptAt.getTime());
    const added = await enqueue([{ id: row.id, score }]);
    if (added < 1) continue;
    if (row.status === "pending") {
      await prisma.delivery.updateMany({
        where: { id: row.id, status: "pending" },
        data: { status: "queued" },
      });
    }
    repaired += 1;
  }

  if (repaired > 0) {
    log("info", "reconciled outbox", { count: repaired });
  }
  return repaired;
}
