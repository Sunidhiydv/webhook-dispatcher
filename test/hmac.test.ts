import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signWebhook, verifyWebhook } from "../src/hmac.js";

describe("webhook signatures", () => {
  const secret = "whsec_test_secret";
  const timestamp = "1700000000";
  const rawBody = '{"id":"inv_1001","amount":2500}';

  it("signs timestamp.rawBody with HMAC-SHA256", () => {
    const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
    expect(signWebhook(secret, timestamp, rawBody)).toBe(expected);
    expect(
      verifyWebhook({
        secret,
        timestamp,
        rawBody,
        signature: expected,
        nowSeconds: 1_700_000_000,
      }),
    ).toBe(true);
  });

  it("rejects a tampered body, a bad signature, and a stale timestamp", () => {
    const signature = signWebhook(secret, timestamp, rawBody);
    expect(
      verifyWebhook({
        secret,
        timestamp,
        rawBody: `${rawBody} `,
        signature,
        nowSeconds: 1_700_000_000,
      }),
    ).toBe(false);
    expect(
      verifyWebhook({
        secret,
        timestamp,
        rawBody,
        signature: signature.endsWith("0") ? `${signature.slice(0, -1)}1` : `${signature.slice(0, -1)}0`,
        nowSeconds: 1_700_000_000,
      }),
    ).toBe(false);
    expect(
      verifyWebhook({
        secret,
        timestamp,
        rawBody,
        signature,
        nowSeconds: 1_700_000_000 + 301,
        toleranceSeconds: 300,
      }),
    ).toBe(false);
  });
});
