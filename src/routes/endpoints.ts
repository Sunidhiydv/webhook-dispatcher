import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { generateSecret } from "../hmac.js";
import { presentEndpoint } from "../present.js";
import { eventTypeSchema, parseInput } from "../schemas.js";
import { evaluateUrl } from "../urls.js";

const eventTypesSchema = z.array(z.union([z.literal("*"), eventTypeSchema])).max(50);

const createSchema = z.object({
  url: z.string().min(1).max(2048),
  description: z.string().max(200).optional(),
  secret: z.string().min(16).max(200).optional(),
  eventTypes: eventTypesSchema.optional(),
  rateLimitPerSecond: z.number().int().min(1).max(5_000).optional(),
});

const patchSchema = createSchema
  .partial()
  .extend({
    active: z.boolean().optional(),
    description: z.string().max(200).nullable().optional(),
  });

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

export async function registerEndpointRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/endpoints", async (request) => {
    const query = parseInput(listQuery, request.query);
    const [items, total] = await Promise.all([
      prisma.endpoint.findMany({
        orderBy: { createdAt: "desc" },
        take: query.limit,
        skip: query.offset,
        include: { _count: { select: { deliveries: true } } },
      }),
      prisma.endpoint.count(),
    ]);
    return {
      items: items.map(presentEndpoint),
      limit: query.limit,
      offset: query.offset,
      total,
    };
  });

  app.post("/v1/endpoints", async (request, reply) => {
    const body = parseInput(createSchema, request.body);
    const created = await prisma.endpoint.create({
      data: {
        url: canonicalUrl(body.url),
        secret: body.secret ?? generateSecret(),
        description: blankToNull(body.description),
        eventTypes: body.eventTypes ?? [],
        rateLimitPerSecond: body.rateLimitPerSecond ?? 25,
      },
      include: { _count: { select: { deliveries: true } } },
    });
    return reply.status(201).send(presentEndpoint(created));
  });

  app.patch("/v1/endpoints/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = parseInput(patchSchema, request.body);
    const data: Prisma.EndpointUpdateInput = {};
    if (body.url !== undefined) data.url = canonicalUrl(body.url);
    if (body.secret !== undefined) data.secret = body.secret;
    if (body.description !== undefined) data.description = blankToNull(body.description);
    if (body.eventTypes !== undefined) data.eventTypes = body.eventTypes;
    if (body.rateLimitPerSecond !== undefined) data.rateLimitPerSecond = body.rateLimitPerSecond;
    if (body.active !== undefined) data.active = body.active;
    if (Object.keys(data).length === 0) {
      throw new HttpError(400, "validation_error", "No endpoint fields to update");
    }

    try {
      const updated = await prisma.endpoint.update({
        where: { id },
        data,
        include: { _count: { select: { deliveries: true } } },
      });
      return presentEndpoint(updated);
    } catch (error) {
      if (isNotFound(error)) throw new HttpError(404, "not_found", "Endpoint not found");
      throw error;
    }
  });

  app.delete("/v1/endpoints/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.endpoint.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "not_found", "Endpoint not found");
    const deliveries = await prisma.delivery.count({ where: { endpointId: id } });
    if (deliveries > 0) {
      throw new HttpError(
        409,
        "endpoint_has_history",
        "Disable the endpoint instead of deleting delivery history",
      );
    }
    await prisma.endpoint.delete({ where: { id } });
    return reply.status(204).send();
  });
}

function canonicalUrl(raw: string): string {
  const decision = evaluateUrl(raw, config.allowPrivateTargets);
  if (!decision.ok) {
    throw new HttpError(400, "invalid_url", `Endpoint URL rejected: ${decision.reason}`);
  }
  return decision.url.toString();
}

function blankToNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "P2025";
}
