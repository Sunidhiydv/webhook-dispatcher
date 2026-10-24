import { Agent, fetch as undiciFetch } from "undici";
import { config } from "./config.js";

const agent = new Agent({
  connections: config.httpPoolConnections,
  pipelining: 1,
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
});

export type WebhookPostResult = {
  statusCode?: number;
  timedOut: boolean;
  networkError?: string;
  snippet: string | null;
};

export async function postWebhook(input: {
  url: string;
  body: string;
  headers: Record<string, string>;
  timeoutMs: number;
}): Promise<WebhookPostResult> {
  try {
    const response = await undiciFetch(input.url, {
      method: "POST",
      dispatcher: agent,
      body: input.body,
      headers: input.headers,
      redirect: "manual",
      signal: AbortSignal.timeout(input.timeoutMs),
    });
    const text = await response.text();
    return {
      statusCode: response.status,
      timedOut: false,
      snippet: truncate(text),
    };
  } catch (error) {
    const timedOut = isTimeout(error);
    return {
      timedOut,
      networkError: timedOut ? undefined : errorCode(error),
      snippet: null,
    };
  }
}

export async function closeWebhookClient(): Promise<void> {
  await agent.close();
}

function truncate(value: string): string {
  const clean = value.replaceAll("\u0000", "");
  if (clean.length <= 512) return clean;
  return `${clean.slice(0, 512)}…`;
}

function isTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = "code" in error ? String(error.code) : "";
  return (
    error.name === "TimeoutError" ||
    error.name === "AbortError" ||
    code === "UND_ERR_HEADERS_TIMEOUT" ||
    code === "UND_ERR_BODY_TIMEOUT" ||
    code === "UND_ERR_CONNECT_TIMEOUT"
  );
}

function errorCode(error: unknown): string {
  if (!(error instanceof Error)) return "network_error";
  if ("code" in error && typeof error.code === "string") return error.code;
  return error.name || "network_error";
}
