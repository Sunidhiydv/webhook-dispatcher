import { describe, expect, it } from "vitest";
import { classifyDelivery } from "../src/classify.js";

describe("delivery classification", () => {
  it("accepts 2xx", () => {
    expect(classifyDelivery({ statusCode: 204, timedOut: false })).toMatchObject({ disposition: "success" });
  });

  it("retries timeouts, 429, and 5xx", () => {
    expect(classifyDelivery({ timedOut: true })).toMatchObject({ disposition: "retry", reason: "timeout" });
    expect(classifyDelivery({ statusCode: 429, timedOut: false })).toMatchObject({
      disposition: "retry",
      reason: "rate_limited",
    });
    expect(classifyDelivery({ statusCode: 503, timedOut: false })).toMatchObject({ disposition: "retry" });
    expect(classifyDelivery({ timedOut: false, networkError: "ECONNRESET" })).toMatchObject({
      disposition: "retry",
      reason: "ECONNRESET",
    });
  });

  it("dead-letters non-retryable 4xx and redirects", () => {
    expect(classifyDelivery({ statusCode: 400, timedOut: false })).toMatchObject({
      disposition: "dlq",
      reason: "client_error",
    });
    expect(classifyDelivery({ statusCode: 404, timedOut: false })).toMatchObject({ disposition: "dlq" });
    expect(classifyDelivery({ statusCode: 302, timedOut: false })).toMatchObject({
      disposition: "dlq",
      reason: "redirect",
    });
  });
});
