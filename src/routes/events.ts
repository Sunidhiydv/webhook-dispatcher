import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { ingestBodySchema, ingestEvent } from "../ingest.js";
import { presentDelivery, presentEvent } from "../present.js";
import { parseInput } from "../schemas.js";

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

export async function registerEventRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/events", async (request, reply) => {
    const body = parseInput(ingestBodySchema, request.body);
    const result = await ingestEvent(body);
    const deliveries = await prisma.delivery.findMany({
      where: { eventId: result.event.id },
      orderBy: { createdAt: "asc" },
      include: {
        endpoint: { select: { id: true, url: true, description: true } },
        event: { select: { id: true, type: true, createdAt: true } },
      },
    });
    return reply.status(result.replayed ? 200 : 202).send({
      replayed: result.replayed,
      event: presentEvent(result.event),
      deliveries: deliveries.map(presentDelivery),
    });
  });

  app.get("/v1/events", async (request) => {
    const query = parseInput(listQuery, request.query);
    const [items, total] = await Promise.all([
      prisma.event.findMany({
        orderBy: { createdAt: "desc" },
        take: query.limit,
        skip: query.offset,
        include: { _count: { select: { deliveries: true } } },
      }),
      prisma.event.count(),
    ]);
    return {
      items: items.map((event) => presentEvent(event)),
      limit: query.limit,
      offset: query.offset,
      total,
    };
  });

  app.get("/v1/events/:id", async (request) => {
    const { id } = request.params as { id: string };
    const event = await prisma.event.findUnique({
      where: { id },
      include: { _count: { select: { deliveries: true } } },
    });
    if (!event) throw new HttpError(404, "not_found", "Event not found");
    return presentEvent(event);
  });
}
