import http from "k6/http";
import { check } from "k6";

export const options = {
  scenarios: {
    ingest: {
      executor: "constant-arrival-rate",
      rate: 50,
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 20,
      maxVUs: 100,
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
};

export default function () {
  const response = http.post(
    `${__ENV.API_URL || "http://127.0.0.1:4000"}/v1/events`,
    JSON.stringify({
      type: "invoice.paid",
      payload: { amount: 1000, currency: "usd" },
    }),
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${__ENV.API_KEY || "dev-local-key"}`,
      },
    },
  );
  check(response, {
    accepted: (result) => result.status === 202 || result.status === 200,
  });
}
