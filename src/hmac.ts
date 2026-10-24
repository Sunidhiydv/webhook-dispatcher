import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function signWebhook(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
}

export function verifyWebhook(input: {
  secret: string;
  timestamp: string;
  rawBody: string;
  signature: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): boolean {
  if (!/^\d+$/.test(input.timestamp)) return false;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const stamped = Number(input.timestamp);
  const tolerance = input.toleranceSeconds ?? 300;
  if (Math.abs(now - stamped) > tolerance) return false;

  const expected = signWebhook(input.secret, input.timestamp, input.rawBody);
  const actual = input.signature.trim().toLowerCase();
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(actual, "utf8");
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export function generateSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}
