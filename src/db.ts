import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export async function waitForPostgres(attempts = 30): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch (error) {
      lastError = error;
      await delay(1_000);
    }
  }
  const message = lastError instanceof Error ? lastError.message : "unknown error";
  throw new Error(`PostgreSQL did not become ready: ${message}`);
}

export async function waitForRedis(ping: () => Promise<string>, attempts = 30): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const reply = await ping();
      if (reply === "PONG") return;
    } catch (error) {
      lastError = error;
    }
    await delay(1_000);
  }
  const message = lastError instanceof Error ? lastError.message : "unknown error";
  throw new Error(`Redis did not become ready: ${message}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
