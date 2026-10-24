import type { FastifyInstance, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { verifyWebhook } from "../hmac.js";
import { getRawBody } from "../raw-body.js";
import { getHealth, getStats } from "../status.js";

export async function registerMetaRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (_request, reply) => {
    const health = await getHealth();
    return reply.status(health.ok ? 200 : 503).send(health);
  });

  app.get("/v1/stats", async () => getStats());

  app.post("/sink", async (request, reply) => {
    if (!signatureOk(request, reply)) return;
    return { ok: true };
  });

  app.post("/sink/flaky", async (request, reply) => {
    if (!signatureOk(request, reply)) return;
    const attempt = Number(headerValue(request, "x-webhook-attempt") ?? "1");
    if (!Number.isInteger(attempt) || attempt < 3) {
      return reply.status(503).send({ ok: false, error: "transient" });
    }
    return { ok: true };
  });

  app.post("/sink/reject", async (request, reply) => {
    if (!signatureOk(request, reply)) return;
    return reply.status(400).send({ ok: false, error: "rejected" });
  });
}

function signatureOk(request: FastifyRequest, reply: { status: (code: number) => { send: (body: unknown) => unknown } }): boolean {
  const timestamp = headerValue(request, "x-webhook-timestamp");
  const signature = headerValue(request, "x-webhook-signature");
  const valid =
    timestamp !== undefined &&
    signature !== undefined &&
    verifyWebhook({
      secret: config.sinkSecret,
      timestamp,
      signature,
      rawBody: getRawBody(request),
      toleranceSeconds: config.signatureToleranceSeconds,
    });
  if (valid) return true;
  reply.status(401).send({ error: { code: "invalid_signature", message: "Invalid webhook signature" } });
  return false;
}

function headerValue(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === "string" ? value : undefined;
}
