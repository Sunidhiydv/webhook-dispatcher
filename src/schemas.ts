import { z } from "zod";
import { HttpError } from "./errors.js";

export const eventTypeSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/, "Use letters, numbers, dots, underscores, or hyphens");

export const deliveryStatusSchema = z.enum([
  "pending",
  "queued",
  "delivering",
  "retrying",
  "delivered",
  "dlq",
]);

export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue && issue.path.length > 0 ? issue.path.join(".") : "request";
    const message = issue ? `${path}: ${issue.message}` : "Invalid request";
    throw new HttpError(400, "validation_error", message);
  }
  return parsed.data;
}
