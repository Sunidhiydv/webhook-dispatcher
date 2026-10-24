import { Prisma, type Delivery, type Event } from "@prisma/client";
import { z } from "zod";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { HttpError, isUniqueViolation } from "./errors.js";
import { selectTargets } from "./fanout.js";
import { log } from "./log.js";
import { recordMetricQuiet } from "./metrics.js";
import { enqueue } from "./queue.js";
import { eventTypeSchema } from "./schemas.js";

const payloadSchema = z.record(z.string(), z.unknown());

export const ingestBodySchema = z.object({
  type: eventTypeSchema,
  payload: payloadSchema,
  endpointIds: z.array(z.string().min(1)).max(config.maxFanout).optional(),
  idempotencyKey: z.string().min(8).max(200).optional(),
});

export type IngestBody = z.infer<typeof ingestBodySchema>;

export type IngestResult = {
  replayed: boolean;
  event: Event;
  deliveries: Delivery[];
};

export async function ingestEvent(input: IngestBody): Promise<IngestResult> {
  if (input.idempotencyKey) {
    const existing = await loadByIdempotencyKey(input.idempotencyKey);
    if (existing) return { ...existing, replayed: true };
  }

  const targets = await resolveTargets(input);
  const payloadRaw = JSON.stringify(input.payload);

  try {
    const created = await prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          type: input.type,
          payload: input.payload as Prisma.InputJsonValue,
          payloadRaw,
          idempotencyKey: input.idempotencyKey ?? null,
        },
      });
      const deliveries =
        targets.length === 0
          ? []
          : await tx.delivery.createManyAndReturn({
              data: targets.map((target) => ({
                eventId: event.id,
                endpointId: target.id,
                status: "pending",
                nextAttemptAt: new Date(),
              })),
            });
      return { event, deliveries };
    });

    await publish(created.deliveries.map((delivery) => delivery.id));
    await recordMetricQuiet("ingested");
    const refreshed = await loadEvent(created.event.id);
    return { ...refreshed, replayed: false };
  } catch (error) {
    if (input.idempotencyKey && isUniqueViolation(error, "idempotency_key")) {
      const existing = await loadByIdempotencyKey(input.idempotencyKey);
      if (existing) return { ...existing, replayed: true };
    }
    throw error;
  }
}

async function resolveTargets(input: IngestBody): Promise<Array<{ id: string }>> {
  if (input.endpointIds && input.endpointIds.length > 0) {
    const endpoints = await prisma.endpoint.findMany({
      where: { id: { in: [...input.endpointIds] } },
      select: { id: true, active: true, eventTypes: true },
    });
    const found = new Set(endpoints.map((endpoint) => endpoint.id));
    const missing = input.endpointIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new HttpError(404, "endpoint_not_found", `Unknown endpoints: ${missing.join(", ")}`);
    }
    const inactive = endpoints.filter((endpoint) => !endpoint.active).map((endpoint) => endpoint.id);
    if (inactive.length > 0) {
      throw new HttpError(409, "endpoint_inactive", `Inactive endpoints: ${inactive.join(", ")}`);
    }
    return endpoints;
  }

  const active = await prisma.endpoint.findMany({
    where: { active: true },
    select: { id: true, active: true, eventTypes: true },
    take: 1_000,
  });
  if (active.length === 1_000) {
    throw new HttpError(
      400,
      "fanout_too_wide",
      "Too many active endpoints; pass endpointIds to target a subset",
    );
  }
  const selected = selectTargets(active, input.type);
  if (selected.length > config.maxFanout) {
    throw new HttpError(
      400,
      "fanout_too_wide",
      `Event matches ${selected.length} endpoints; the limit is ${config.maxFanout}`,
    );
  }
  return selected;
}

async function publish(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const score = Date.now();
  try {
    await enqueue(ids.map((id) => ({ id, score })));
    await prisma.delivery.updateMany({
      where: { id: { in: ids }, status: "pending" },
      data: { status: "queued" },
    });
  } catch (error) {
    log("warn", "enqueue failed; outbox will retry", {
      deliveries: ids.length,
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}

async function loadByIdempotencyKey(idempotencyKey: string): Promise<{ event: Event; deliveries: Delivery[] } | null> {
  const event = await prisma.event.findUnique({ where: { idempotencyKey } });
  if (!event) return null;
  return loadEvent(event.id);
}

async function loadEvent(id: string): Promise<{ event: Event; deliveries: Delivery[] }> {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id },
    include: { deliveries: { orderBy: { createdAt: "asc" } } },
  });
  const { deliveries, ...rest } = event;
  return { event: rest, deliveries };
}
