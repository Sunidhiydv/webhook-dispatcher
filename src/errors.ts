export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function isUniqueViolation(error: unknown, field?: string): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  if ((error as { code: unknown }).code !== "P2002") return false;
  if (!field) return true;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  if (Array.isArray(target)) return target.includes(field);
  if (typeof target === "string") return target.includes(field);
  return false;
}
