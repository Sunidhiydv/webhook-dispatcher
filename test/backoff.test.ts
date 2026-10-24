import { describe, expect, it } from "vitest";
import { fullJitterDelayMs } from "../src/backoff.js";

describe("full jitter backoff", () => {
  it("stays inside the exponential bound for the failed attempt", () => {
    expect(fullJitterDelayMs(1, 1_000, 60_000, () => 0)).toBe(0);
    expect(fullJitterDelayMs(1, 1_000, 60_000, () => 0.999999)).toBe(1_000);
    expect(fullJitterDelayMs(2, 1_000, 60_000, () => 0.999999)).toBe(2_000);
    expect(fullJitterDelayMs(5, 1_000, 60_000, () => 0.999999)).toBe(16_000);
  });

  it("never exceeds the cap", () => {
    expect(fullJitterDelayMs(12, 1_000, 60_000, () => 0.999999)).toBe(60_000);
    for (let index = 0; index < 200; index += 1) {
      const delay = fullJitterDelayMs(8, 1_000, 5_000, Math.random);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(5_000);
    }
  });
});
