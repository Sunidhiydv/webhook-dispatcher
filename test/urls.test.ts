import { describe, expect, it } from "vitest";
import { evaluateUrl } from "../src/urls.js";

describe("webhook URL guard", () => {
  it("allows public https and loopback", () => {
    expect(evaluateUrl("https://example.com/hooks/billing", false).ok).toBe(true);
    expect(evaluateUrl("http://127.0.0.1:4000/sink", false).ok).toBe(true);
    expect(evaluateUrl("http://localhost:4000/sink", false).ok).toBe(true);
  });

  it("blocks metadata addresses even when private targets are allowed", () => {
    expect(evaluateUrl("http://169.254.169.254/latest/meta-data", true)).toMatchObject({
      ok: false,
      reason: "metadata_address_blocked",
    });
  });

  it("blocks private and unsupported URLs", () => {
    expect(evaluateUrl("http://10.0.0.8/hook", false)).toMatchObject({
      ok: false,
      reason: "private_address_blocked",
    });
    expect(evaluateUrl("http://10.0.0.8/hook", true).ok).toBe(true);
    expect(evaluateUrl("ftp://example.com/hook", true)).toMatchObject({ ok: false });
    expect(evaluateUrl("https://user:pass@example.com/hook", true)).toMatchObject({
      ok: false,
      reason: "credentials_in_url",
    });
  });
});
