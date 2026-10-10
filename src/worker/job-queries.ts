import { z } from "zod";
import { type JobQuery, type User, businessDateSchema, uuidSchema } from "../shared/contracts";
import { input } from "./errors";
import { assertLineAccess, parseJobRow } from "./reads";
import { jobJson, readPermission } from "./job-projection";

const cursorSchema = z.strictObject({
  binding: z.string(), date: businessDateSchema, order: z.int().positive(), id: uuidSchema,
});
const binding = (actor: User, query: JobQuery) => JSON.stringify([actor.id, actor.role, query.from, query.to, query.lineId ?? null, query.status ?? null]);

function decodeCursor(cursor: string) {
  let decoded: unknown;
  try { decoded = JSON.parse(atob(cursor)); } catch { decoded = null; }
  return input(cursorSchema, decoded);
}

export async function queryJobs(db: D1Database, actor: User, query: JobQuery, at: number, paginate: boolean) {
  if (query.lineId) await assertLineAccess(db, actor, query.lineId);
  const predicates = ["j.work_date BETWEEN ? AND ?", readPermission];
  const values: (string | number)[] = [query.from, query.to, actor.id];
  if (query.lineId) { predicates.push("j.line_id=?"); values.push(query.lineId); }
  if (query.status) { predicates.push("j.status=?"); values.push(query.status); }
  if (paginate && query.cursor) {
    const cursor = decodeCursor(query.cursor);
    input(z.literal(binding(actor, query)), cursor.binding);
    predicates.push("(j.work_date,j.day_order,j.id)>(?,?,?)");
    values.push(cursor.date, cursor.order, cursor.id);
  }
  const limit = query.limit ?? 100;
  if (paginate) values.push(limit + 1);
  const result = await db.prepare(`SELECT ${jobJson(at)} AS json FROM jobs j WHERE ${predicates.join(" AND ")}
    ORDER BY j.work_date,j.day_order,j.id ${paginate ? "LIMIT ?" : ""}`).bind(...values).all<unknown>();
  const jobs = result.results.map(parseJobRow);
  const hasMore = paginate && jobs.length > limit;
  if (hasMore) jobs.pop();
  const last = jobs.at(-1);
  return {
    jobs,
    nextCursor: hasMore && last ? btoa(JSON.stringify({ binding: binding(actor, query), date: last.workDate, order: last.dayOrder, id: last.id })) : null,
    window: { from: query.from, to: query.to }, filters: { lineId: query.lineId ?? null, status: query.status ?? null },
  };
}

export async function summary(db: D1Database, actor: User, query: JobQuery, at: number) {
  const result = await queryJobs(db, actor, query, at, false);
  return {
    window: result.window, filters: result.filters,
    todo: result.jobs.filter((job) => job.status === "todo").length,
    inProgress: result.jobs.filter((job) => job.status === "in_progress").length,
    paused: result.jobs.filter((job) => job.status === "paused").length,
    done: result.jobs.filter((job) => job.status === "done").length,
    overdue: result.jobs.filter((job) => job.overdue).length,
    total: result.jobs.length, activeMs: result.jobs.reduce((total, job) => total + job.activeMs, 0),
  };
}
