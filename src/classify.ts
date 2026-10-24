export type DeliveryClassification =
  | { disposition: "success"; statusCode: number; reason: "ok" }
  | { disposition: "retry"; statusCode?: number; reason: string }
  | { disposition: "dlq"; statusCode?: number; reason: string };

const RETRYABLE_STATUS = new Set([408, 425, 429]);

export function classifyDelivery(input: {
  statusCode?: number;
  timedOut: boolean;
  networkError?: string;
}): DeliveryClassification {
  if (input.timedOut) {
    return { disposition: "retry", reason: "timeout" };
  }
  if (input.networkError) {
    return { disposition: "retry", reason: input.networkError };
  }

  const statusCode = input.statusCode;
  if (statusCode === undefined) {
    return { disposition: "retry", reason: "no_response" };
  }
  if (statusCode >= 200 && statusCode < 300) {
    return { disposition: "success", statusCode, reason: "ok" };
  }
  if (RETRYABLE_STATUS.has(statusCode) || statusCode >= 500) {
    return {
      disposition: "retry",
      statusCode,
      reason: statusCode === 429 ? "rate_limited" : "upstream_error",
    };
  }
  return {
    disposition: "dlq",
    statusCode,
    reason: statusCode >= 300 && statusCode < 400 ? "redirect" : "client_error",
  };
}

export function outcomeLabel(outcome: DeliveryClassification): string {
  if (outcome.statusCode === undefined) return outcome.reason;
  return `HTTP ${outcome.statusCode} (${outcome.reason})`;
}
