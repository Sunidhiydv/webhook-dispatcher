import { describe, expect, it } from "vitest";
import { selectTargets, type EndpointTarget } from "../src/fanout.js";

const endpoints: EndpointTarget[] = [
  { id: "all", active: true, eventTypes: [] },
  { id: "star", active: true, eventTypes: ["*"] },
  { id: "invoices", active: true, eventTypes: ["invoice.paid"] },
  { id: "users", active: true, eventTypes: ["user.created"] },
  { id: "paused", active: false, eventTypes: [] },
];

describe("fan-out selection", () => {
  it("matches wildcard, empty, and exact subscriptions", () => {
    expect(selectTargets(endpoints, "invoice.paid").map((endpoint) => endpoint.id)).toEqual([
      "all",
      "star",
      "invoices",
    ]);
  });

  it("sends explicit targets even when the event type does not match", () => {
    expect(selectTargets(endpoints, "invoice.paid", ["users", "paused"]).map((endpoint) => endpoint.id)).toEqual([
      "users",
    ]);
  });
});
