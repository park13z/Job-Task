import { ApiError } from "./api";

type Pending = { fingerprint: string; key: string };
export function operationKey(previous: Pending | null, body: unknown): Pending {
  const fingerprint = JSON.stringify(body);
  return previous?.fingerprint === fingerprint ? previous : { fingerprint, key: crypto.randomUUID() };
}
export function friendlyError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return "This task has changed. The latest status has been loaded. Review it and try again.";
    if (error.status === 403) return "Your access has changed. Please contact your manager.";
    if (error.status === 503) return "The system is temporarily unavailable. Try again or contact your administrator.";
    return error.message;
  }
  return error instanceof Error ? error.message : "The operation failed. Please try again.";
}
export type { Pending };
