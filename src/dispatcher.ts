import { randomUUID } from "node:crypto";
import type { Delivery, Endpoint, Event } from "@prisma/client";
import { fullJitterDelayMs } from "./backoff.js";
import { classifyDelivery, outcomeLabel, type DeliveryClassification } from "./classify.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { signWebhook } from "./hmac.js";
import { postWebhook } from "./http.js";
import { log } from "./log.js";
import { recordMetricQuiet } from "./metrics.js";
import { ack, reschedule, takeToken } from "./queue.js";
import { evaluateUrl } from "./urls.js";

type LoadedDelivery = Delivery & { endpoint: Endpoint; event: Event };

export async function processDelivery(id: string): Promise<void> {
  let handled = false;
  try {
    const delivery = await prisma.delivery.findUnique({
      where: { id },
      include: { endpoint: true, event: true },
    });
    if (!delivery) {
      await ack(id);
      handled = true;
      return;
    }
    if (delivery.status === "delivered" || delivery.status === "dlq") {
      await ack(id);
      handled = true;
      return;
    }
    if (delivery.lockedUntil && delivery.lockToken && delivery.lockedUntil.getTime() > Date.now()) {
      await reschedule(id, delivery.lockedUntil.getTime());
      handled = true;
      return;
    }
    if (
      (delivery.status === "pending" || delivery.status === "queued" || delivery.status === "retrying") &&
      delivery.nextAttemptAt.getTime() > Date.now() + 250
    ) {
      await reschedule(id, delivery.nextAttemptAt.getTime());
      handled = true;
      return;
    }

    const urlDecision = evaluateUrl(delivery.endpoint.url, config.allowPrivateTargets);
    if (!urlDecision.ok || !delivery.endpoint.active) {
      const reason = !urlDecision.ok ? urlDecision.reason : "endpoint_disabled";
      handled = await deadLetter(id, reason);
      return;
    }

    const token = randomUUID();
    const lockedUntil = new Date(Date.now() + config.visibilityTimeoutMs);
    const locked = await prisma.delivery.updateMany({
      where: {
        id,
        AND: [
          { OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }] },
          {
            OR: [
              { status: { in: ["pending", "queued", "retrying"] } },
              { status: "delivering", lockedUntil: { lt: new Date() } },
            ],
          },
        ],
      },
      data: { status: "delivering", lockToken: token, lockedUntil },
    });
    if (locked.count !== 1) {
      handled = await releaseToOwner(id);
      return;
    }

    const rate = await takeToken(delivery.endpointId, delivery.endpoint.rateLimitPerSecond);
    if (!rate.allowed) {
      const when = Date.now() + Math.max(50, rate.retryMs);
      const parked = await prisma.delivery.updateMany({
        where: { id, lockToken: token },
        data: {
          status: "queued",
          nextAttemptAt: new Date(when),
          lockToken: null,
          lockedUntil: null,
        },
      });
      if (parked.count === 1) {
        await reschedule(id, when);
      }
      handled = true;
      return;
    }

    const bumped = await prisma.delivery.updateMany({
      where: { id, lockToken: token },
      data: { attempt: { increment: 1 } },
    });
    if (bumped.count !== 1) {
      handled = true;
      return;
    }

    const current = await prisma.delivery.findUnique({
      where: { id },
      include: { endpoint: true, event: true },
    });
    if (!current || current.lockToken !== token) {
      handled = true;
      return;
    }

    const result = await deliver(current);
    const durationMs = result.durationMs;
    const outcome = result.outcome;
    await prisma.attempt.create({
      data: {
        deliveryId: id,
        attempt: current.attempt,
        statusCode: result.statusCode ?? null,
        error: outcome.disposition === "success" ? null : clip(outcomeLabel(outcome), 500),
        durationMs,
        responseSnippet: clip(result.snippet, 512),
      },
    });

    if (outcome.disposition === "success") {
      handled = await markDelivered(current, token, outcome.statusCode, durationMs);
      return;
    }

    const exhausted = current.attempt >= config.maxAttempts;
    if (outcome.disposition === "dlq" || exhausted) {
      handled = await markDlq(id, token, outcomeLabel(outcome), outcome.statusCode ?? null, durationMs);
      return;
    }

    const delay = fullJitterDelayMs(current.attempt, config.backoffBaseMs, config.backoffCapMs);
    const when = Date.now() + delay;
    const retried = await prisma.delivery.updateMany({
      where: { id, lockToken: token },
      data: {
        status: "retrying",
        nextAttemptAt: new Date(when),
        lastStatusCode: outcome.statusCode ?? null,
        lastError: clip(outcomeLabel(outcome), 500),
        lastDurationMs: durationMs,
        lockToken: null,
        lockedUntil: null,
      },
    });
    if (retried.count === 1) {
      await reschedule(id, when);
      await recordMetricQuiet("retry");
      log("info", "scheduled retry", {
        deliveryId: id,
        attempt: current.attempt,
        delayMs: delay,
        reason: outcome.reason,
      });
    }
    handled = true;
  } catch (error) {
    if (!handled) {
      await reschedule(id, Date.now() + 1_000).catch(() => undefined);
    }
    throw error;
  }
}

async function deliver(delivery: LoadedDelivery): Promise<{
  outcome: DeliveryClassification;
  statusCode?: number;
  durationMs: number;
  snippet: string | null;
}> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signWebhook(delivery.endpoint.secret, timestamp, delivery.event.payloadRaw);
  const started = Date.now();
  const posted = await postWebhook({
    url: delivery.endpoint.url,
    body: delivery.event.payloadRaw,
    timeoutMs: config.httpTimeoutMs,
    headers: {
      "content-type": "application/json",
      "user-agent": "webhook-dispatcher/1.0",
      "x-webhook-id": delivery.id,
      "x-webhook-event": delivery.event.type,
      "x-webhook-timestamp": timestamp,
      "x-webhook-signature": signature,
      "x-webhook-attempt": String(delivery.attempt),
    },
  });
  return {
    outcome: classifyDelivery(posted),
    statusCode: posted.statusCode,
    durationMs: Date.now() - started,
    snippet: posted.snippet,
  };
}

async function markDelivered(
  delivery: LoadedDelivery,
  token: string,
  statusCode: number,
  durationMs: number,
): Promise<boolean> {
  const wrote = await prisma.delivery.updateMany({
    where: { id: delivery.id, lockToken: token },
    data: {
      status: "delivered",
      deliveredAt: new Date(),
      lastStatusCode: statusCode,
      lastError: null,
      lastDurationMs: durationMs,
      lockToken: null,
      lockedUntil: null,
    },
  });
  if (wrote.count !== 1) {
    log("warn", "lost delivery lock after success", { deliveryId: delivery.id });
    return true;
  }
  await ack(delivery.id);
  await recordMetricQuiet("delivered");
  log("info", "delivered", {
    deliveryId: delivery.id,
    endpointId: delivery.endpointId,
    attempt: delivery.attempt,
    statusCode,
    durationMs,
    host: safeHost(delivery.endpoint.url),
  });
  return true;
}

async function markDlq(
  id: string,
  token: string,
  reason: string,
  statusCode: number | null,
  durationMs: number,
): Promise<boolean> {
  const wrote = await prisma.delivery.updateMany({
    where: { id, lockToken: token },
    data: {
      status: "dlq",
      lastStatusCode: statusCode,
      lastError: clip(reason, 500),
      lastDurationMs: durationMs,
      lockToken: null,
      lockedUntil: null,
    },
  });
  if (wrote.count !== 1) return true;
  await ack(id);
  await recordMetricQuiet("dlq");
  log("info", "dead lettered", { deliveryId: id, reason, statusCode });
  return true;
}

async function deadLetter(id: string, reason: string): Promise<boolean> {
  const now = new Date();
  const wrote = await prisma.delivery.updateMany({
    where: {
      id,
      OR: [
        { status: { in: ["pending", "queued", "retrying"] } },
        {
          status: "delivering",
          OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
        },
      ],
    },
    data: {
      status: "dlq",
      lastError: clip(reason, 500),
      lockToken: null,
      lockedUntil: null,
    },
  });
  if (wrote.count === 1) {
    await ack(id);
    await recordMetricQuiet("dlq");
    log("info", "dead lettered", { deliveryId: id, reason });
    return true;
  }
  return releaseToOwner(id);
}

async function releaseToOwner(id: string): Promise<boolean> {
  const current = await prisma.delivery.findUnique({ where: { id } });
  if (!current || current.status === "delivered" || current.status === "dlq") {
    await ack(id);
    return true;
  }
  const until = current.lockedUntil?.getTime() ?? Date.now() + 500;
  await reschedule(id, Math.max(Date.now() + 250, until));
  return true;
}

function clip(value: string | null, max: number): string | null {
  if (!value) return null;
  return value.length <= max ? value : value.slice(0, max);
}

function safeHost(raw: string): string {
  try {
    return new URL(raw).host;
  } catch {
    return "invalid";
  }
}
