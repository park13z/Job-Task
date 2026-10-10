import { z } from "zod";
import { errorSchema } from "../shared/contracts";

type ErrorCode = z.infer<typeof errorSchema>["error"]["code"];
export class ApiError extends Error {
  constructor(readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 503, readonly code: ErrorCode, message: string) {
    super(message);
  }
}
export const conflict = () => new ApiError(409, "CONFLICT", "The record changed or the requested operation is unavailable. Refresh and retry.");
export const forbidden = () => new ApiError(403, "FORBIDDEN", "You do not have permission for this operation.");
export const notFound = () => new ApiError(404, "NOT_FOUND", "The requested resource was not found.");
export const unavailable = () => new ApiError(503, "TEMPORARILY_UNAVAILABLE", "The service is temporarily unavailable.");

export function input<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, "VALIDATION_ERROR", "The request contains invalid fields.");
  return result.data;
}

export function output<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw unavailable();
  return result.data;
}

export function isConstraint(error: unknown): boolean {
  return error instanceof Error && /SQLITE_CONSTRAINT|constraint failed|UNIQUE constraint|NOT NULL constraint/i.test(error.message);
}
