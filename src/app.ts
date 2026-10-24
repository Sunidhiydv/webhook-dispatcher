import { randomUUID, timingSafeEqual } from "node:crypto";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { config } from "./config.js";
import { HttpError } from "./errors.js";
import { setRawBody } from "./raw-body.js";
import { registerDeliveryRoutes } from "./routes/deliveries.js";
import { registerEndpointRoutes } from "./routes/endpoints.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerMetaRoutes } from "./routes/meta.js";

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.logLevel },
    bodyLimit: 1_000_000,
    requestIdHeader: "x-request-id",
    genReqId: (request) => {
      const incoming = request.headers["x-request-id"];
      return typeof incoming === "string" && incoming.length > 0 && incoming.length < 200
        ? incoming
        : randomUUID();
    },
  });

  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    const raw = typeof body === "string" ? body : body.toString("utf8");
    setRawBody(request, raw);
    if (raw.trim().length === 0) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(raw) as unknown);
    } catch {
      done(new HttpError(400, "invalid_json", "Request body must be valid JSON"), undefined);
    }
  });

  await app.register(cors, { origin: true });

  app.addHook("onRequest", async (request, reply) => {
    if (request.method === "OPTIONS" || isPublic(request.url)) return;
    const header = request.headers.authorization;
    const presented = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    if (!safeEqual(presented, config.apiKey)) {
      return reply.status(401).send({ error: { code: "unauthorized", message: "Invalid API key" } });
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
    }
    const statusCode = statusCodeOf(error);
    if (statusCode >= 500) request.log.error(error);
    return reply.status(statusCode).send({
      error: {
        code: statusCode >= 500 ? "internal_error" : "bad_request",
        message: statusCode >= 500 ? "Internal error" : error instanceof Error ? error.message : "Request failed",
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      error: { code: "not_found", message: `No route for ${request.method} ${request.url}` },
    });
  });

  await registerMetaRoutes(app);
  await registerEndpointRoutes(app);
  await registerEventRoutes(app);
  await registerDeliveryRoutes(app);

  app.get("/", async () => ({
    service: "webhook-dispatcher",
    health: "/health",
    docs: "See README.md",
  }));

  return app;
}

function statusCodeOf(error: unknown): number {
  if (typeof error === "object" && error !== null && "statusCode" in error) {
    const statusCode = error.statusCode;
    if (typeof statusCode === "number") return statusCode;
  }
  return 500;
}

function isPublic(url: string): boolean {
  const path = url.split("?")[0] ?? url;
  return path === "/health" || path === "/sink" || path === "/sink/flaky" || path === "/sink/reject";
}

function safeEqual(presented: string, expected: string): boolean {
  const actual = Buffer.from(presented);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length) return false;
  return timingSafeEqual(actual, wanted);
}
