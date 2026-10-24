export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/dispatcher${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as { error?: { message?: string } } | T) : null;
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body && body.error?.message
        ? body.error.message
        : response.statusText;
    throw new ApiError(message, response.status);
  }
  return body as T;
}
