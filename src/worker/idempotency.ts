import { z } from "zod";
import { v5 } from "uuid";
import { jobSchema, type User, idempotencyKeySchema } from "../shared/contracts";
import { ApiError, input, output, notFound } from "./errors";
import { readPermission } from "./job-projection";

function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  throw new Error("Canonical request contains an unsupported value");
}

export async function operation(request: Request, actor: User, body: unknown, count?: number) {
  const key = input(idempotencyKeySchema, request.headers.get("Idempotency-Key"));
  const bytes = new TextEncoder().encode(canonical({ actorId: actor.id, method: request.method, path: new URL(request.url).pathname, key, body }));
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { ids: count === undefined ? [key] : Array.from({ length: count }, (_, index) => v5(`job:${index}`, key)), hash };
}
export type Operation = Awaited<ReturnType<typeof operation>>;

const replayRow = z.strictObject({ operationId: z.string(), actorId: z.string(), hash: z.string(), snapshot: z.string(), permitted: z.union([z.literal(0), z.literal(1)]) });

export async function replay(db: D1Database, actor: User, operation: Operation) {
  const result = await db.prepare(`SELECT e.operation_id AS operationId,e.actor_id AS actorId,e.request_hash AS hash,e.new_state AS snapshot,
    ${readPermission} AS permitted FROM job_events e JOIN jobs j ON j.id=e.job_id
    WHERE e.operation_id IN (${operation.ids.map(() => "?").join(",")})`).bind(actor.id, ...operation.ids).all<unknown>();
  const rows = output(z.array(replayRow), result.results);
  if (!rows.length) return null;
  if (rows.length !== operation.ids.length || rows.some((row) => row.actorId !== actor.id || row.hash !== operation.hash)) {
    throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "This idempotency key belongs to a different request.");
  }
  if (rows.some((row) => !row.permitted)) throw notFound();
  return operation.ids.map((id) => {
    const row = rows.find((candidate) => candidate.operationId === id);
    if (!row) throw new Error("Missing replay event");
    return output(jobSchema, JSON.parse(row.snapshot));
  });
}
