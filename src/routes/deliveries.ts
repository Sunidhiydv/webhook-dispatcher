import type { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { presentDelivery, presentDeliveryDetail } from "../present.js";
import { replayDeadLetters, replayDelivery } from "../replay.js";
import { deliveryStatusSchema, parseInput } from "../schemas.js";

const listInclude = {
  endpoint: { select: { id: true, url: true, description: true } },
  event: { select: { id: true, type: true, createdAt: true } },
} satisfies Prisma.DeliveryInclude;

const detailInclude = {
  endpoint: { select: { id: true, url: true, description: true } },
  event: { select: { id: true, type: true, createdAt: true, payload: true, payloadRaw: true } },
  attempts: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.DeliveryInclude;

const listQuery = z.object({
  status: deliveryStatusSchema.optional(),
  endpointId: z.string().min(1).optional(),
  eventType: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

const replaySchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
});

export async function registerDeliveryRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/deliveries", async (request) => {
    const query = parseInput(listQuery, request.query);
    const where: Prisma.DeliveryWhereInput = {
      status: query.status,
      endpointId: query.endpointId,
      event: query.eventType ? { type: query.eventType } : undefined,
    };
    const [items, total] = await Promise.all([
      prisma.delivery.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: query.limit,
        skip: query.offset,
        include: listInclude,
      }),
      prisma.delivery.count({ where }),
    ]);
    return {
      items: items.map(presentDelivery),
      limit: query.limit,
      offset: query.offset,
      total,
    };
  });

  app.get("/v1/deliveries/:id", async (request) => {
    const { id } = request.params as { id: string };
    const delivery = await prisma.delivery.findUnique({ where: { id }, include: detailInclude });
    if (!delivery) throw new HttpError(404, "not_found", "Delivery not found");
    return presentDeliveryDetail(delivery);
  });

  app.post("/v1/deliveries/:id/replay", async (request) => {
    const { id } = request.params as { id: string };
    await replayDelivery(id);
    const delivery = await prisma.delivery.findUniqueOrThrow({ where: { id }, include: listInclude });
    return presentDelivery(delivery);
  });

  app.post("/v1/dlq/replay", async (request) => {
    const body = parseInput(replaySchema, request.body ?? {});
    const ids = await replayDeadLetters(body.limit ?? 50);
    return { replayed: ids.length, ids };
  });
}
