import { z } from "zod";
import { type User, type JobAction, type JobInput, editJobInputSchema, type Job } from "../shared/contracts";
import { requirePlanner } from "./auth";
import { ApiError, conflict, forbidden, isConstraint, unavailable } from "./errors";
import { jobJson, plannerGuard, executorGuard } from "./job-projection";
import { findJob } from "./reads";
import { replay, type Operation } from "./idempotency";
import { mondayWeekRange } from "../shared/time";

const transitions = {
  start: { from: "todo", to: "in_progress", event: "started", interval: "open" },
  pause: { from: "in_progress", to: "paused", event: "paused", interval: "close" },
  resume: { from: "paused", to: "in_progress", event: "resumed", interval: "open" },
  done: { from: "in_progress", to: "done", event: "completed", interval: "close" },
} satisfies Record<JobAction, { from: Job["status"]; to: Job["status"]; event: "started" | "paused" | "resumed" | "completed"; interval: "open" | "close" }>;

function audit(db: D1Database, args: {
  id: string; actor: User; operationId: string; hash: string; version: number; at: number;
  event: "created" | "edited" | "started" | "paused" | "resumed" | "completed";
  previous: Job | null; interval?: "open" | "close";
}) {
  const { id, actor, operationId, hash, version, at, event, previous, interval } = args;
  const intervalCheck = interval === "open" ? "AND EXISTS (SELECT 1 FROM work_intervals w WHERE w.job_id=j.id AND w.open_operation_id=j.operation_id AND w.closed_at IS NULL)" :
    interval === "close" ? "AND EXISTS (SELECT 1 FROM work_intervals w WHERE w.job_id=j.id AND w.close_operation_id=j.operation_id AND w.closed_at=j.updated_at)" : "";
  const projection = jobJson(at, event === "paused" || event === "resumed" ? event : undefined);
  return db.prepare(`INSERT INTO job_events (id,job_id,actor_id,event_type,version,previous_state,new_state,happened_at,operation_id,request_hash)
    VALUES (?,(SELECT j.id FROM jobs j WHERE j.id=? AND j.operation_id=? AND j.version=? ${intervalCheck}),?,?,?,?,
    (SELECT ${projection} FROM jobs j WHERE j.id=? AND j.operation_id=? AND j.version=?),?,?,?)`)
    .bind(crypto.randomUUID(), id, operationId, version, actor.id, event, version, previous === null ? null : JSON.stringify(previous), id, operationId, version, at, operationId, hash);
}

async function execute(db: D1Database, actor: User, operation: Operation, statements: D1PreparedStatement[]) {
  statements.push(db.prepare("UPDATE org_settings SET revision=revision+1 WHERE id=1"));
  try { await db.batch(statements); }
  catch (error) {
    if (isConstraint(error)) {
      const prior = await replay(db, actor, operation);
      if (prior) return prior;
      throw conflict();
    }
    throw unavailable();
  }
  const stored = await replay(db, actor, operation);
  if (!stored) throw unavailable();
  return stored;
}

export async function createJobs(db: D1Database, actor: User, items: JobInput[], operation: Operation, at: number) {
  requirePlanner(actor);
  const prior = await replay(db, actor, operation);
  if (prior) return prior;
  const statements: D1PreparedStatement[] = [];
  for (const [index, item] of items.entries()) {
    const operationId = operation.ids[index];
    if (!operationId) throw unavailable();
    const id = crypto.randomUUID();
    const week = mondayWeekRange(item.workDate);
    // D1 batch inserts are sequential: allocate the next unused weekly number on the server.
    statements.push(db.prepare(`INSERT INTO jobs (id,title,description,target_skids,day_order,queue_position,work_date,line_id,created_by,created_at,updated_at,operation_id)
      SELECT ?,?,?,?,(SELECT COALESCE(MAX(day_order),0)+1 FROM jobs WHERE work_date BETWEEN ? AND ?),(SELECT COALESCE(MAX(queue_position),0)+1 FROM jobs WHERE work_date=? AND line_id=?),?,?,?,?,?,?
      WHERE ${plannerGuard} AND EXISTS (SELECT 1 FROM production_lines WHERE id=? AND active=1)`)
      .bind(id, item.title, item.description ?? "", item.targetSkids ?? null, week.from, week.to, item.workDate, item.lineId,
        item.workDate, item.lineId, actor.id, at, at, operationId, actor.id, item.lineId));
    statements.push(audit(db, { id, actor, operationId, hash: operation.hash, version: 1, at, event: "created", previous: null }));
  }
  return execute(db, actor, operation, statements);
}

export async function editJob(db: D1Database, actor: User, id: string, edit: z.infer<typeof editJobInputSchema>, operation: Operation, at: number) {
  requirePlanner(actor);
  const prior = await replay(db, actor, operation);
  if (prior) return prior[0];
  const previous = await findJob(db, actor, id, at);
  const operationId = operation.ids[0];
  if (!operationId) throw unavailable();
  const next = { ...previous, ...edit };
  const destination = mondayWeekRange(next.workDate);
  const movedWeek = destination.from !== mondayWeekRange(previous.workDate).from;
  const movedQueue = next.workDate !== previous.workDate || next.lineId !== previous.lineId;
  const statements = [db.prepare(`UPDATE jobs SET title=?,description=?,target_skids=?,
    day_order=CASE WHEN ?=1 OR EXISTS (SELECT 1 FROM jobs collision WHERE collision.work_date=? AND collision.day_order=jobs.day_order AND collision.id<>jobs.id)
      THEN (SELECT COALESCE(MAX(day_order),0)+1 FROM jobs WHERE work_date BETWEEN ? AND ?) ELSE day_order END,
    queue_position=CASE WHEN ?=1 THEN (SELECT COALESCE(MAX(queue_position),0)+1 FROM jobs WHERE work_date=? AND line_id=?) ELSE queue_position END,
    work_date=?,line_id=?,updated_at=?,version=version+1,operation_id=?
    WHERE id=? AND version=? AND status='todo' AND cancelled_at IS NULL AND ${plannerGuard}
    AND EXISTS (SELECT 1 FROM production_lines WHERE id=? AND active=1)`)
    .bind(next.title, next.description, next.targetSkids,
      movedWeek ? 1 : 0, next.workDate, destination.from, destination.to,
      movedQueue ? 1 : 0, next.workDate, next.lineId, next.workDate, next.lineId,
      at, operationId, id, edit.expectedVersion, actor.id, next.lineId),
    audit(db, { id, actor, operationId, hash: operation.hash, version: edit.expectedVersion + 1, at, event: "edited", previous }),
  ];
  return (await execute(db, actor, operation, statements))[0];
}

export async function actOnJob(db: D1Database, actor: User, id: string, action: JobAction, expectedVersion: number, operation: Operation, at: number) {

  const previous = await findJob(db, actor, id, at);
  const line = await db.prepare("SELECT id FROM production_lines WHERE id=? AND active=1").bind(previous.lineId).first<unknown>();
  if (!line) throw forbidden();
  const prior = await replay(db, actor, operation);
  if (prior) return prior[0];
  const operationId = operation.ids[0];
  if (!operationId) throw unavailable();
  const transition = transitions[action];
  const doneFromPaused = action === "done" && previous.status === "paused";
  const isStarting = transition.to === "in_progress";
  const lineBusy = async () => db.prepare(`SELECT title FROM jobs
    WHERE line_id=? AND status='in_progress' AND id<>? LIMIT 1`)
    .bind(previous.lineId, id).first<{ title: string }>();
  const busyConflict = (title: string) => new ApiError(409, "CONFLICT",
    `This production line is already running "${title}". Pause or Done that job before starting or resuming another.`);
  // Friendly preflight validation; the guarded UPDATE and unique index below
  // are authoritative for concurrent requests.
  if (isStarting) {
    const busy = await lineBusy();
    if (busy) throw busyConflict(busy.title);
  }
  const lineGuard = isStarting ? `AND NOT EXISTS (
      SELECT 1 FROM jobs active WHERE active.line_id=jobs.line_id
      AND active.status='in_progress' AND active.id<>jobs.id
    )` : "";
  const statements = [db.prepare(`UPDATE jobs SET status=?,updated_at=?,version=version+1,operation_id=?,
    started_at=CASE WHEN ?='start' THEN ? ELSE started_at END,completed_at=CASE WHEN ?='done' THEN ? ELSE completed_at END
    WHERE id=? AND version=? AND status=? AND cancelled_at IS NULL AND ${executorGuard} ${lineGuard}`)
    .bind(transition.to, at, operationId, action, at, action, at, id, expectedVersion, doneFromPaused ? "paused" : transition.from, actor.id)];
  if (transition.interval === "open") {
    statements.push(db.prepare(`INSERT INTO work_intervals (id,job_id,opened_at,opened_by,open_operation_id)
      SELECT ?,id,?,?,? FROM jobs WHERE id=? AND operation_id=? AND version=? AND ${executorGuard}`)
      .bind(crypto.randomUUID(), at, actor.id, operationId, id, operationId, expectedVersion + 1, actor.id));
  } else if (!doneFromPaused) {
    statements.push(db.prepare(`UPDATE work_intervals SET closed_at=?,closed_by=?,close_operation_id=? WHERE job_id=? AND closed_at IS NULL
      AND EXISTS (SELECT 1 FROM jobs WHERE jobs.id=work_intervals.job_id AND operation_id=? AND version=? AND ${executorGuard})`)
      .bind(at, actor.id, operationId, id, operationId, expectedVersion + 1, actor.id));
  }
  statements.push(audit(db, { id, actor, operationId, hash: operation.hash, version: expectedVersion + 1, at, event: transition.event, previous, interval: doneFromPaused ? undefined : transition.interval }));
  try {
    return (await execute(db, actor, operation, statements))[0];
  } catch (error) {
    // If a competing Start/Resume wins between validation and the batch,
    // translate the atomic constraint conflict into actionable feedback.
    if (isStarting && error instanceof ApiError && error.status === 409) {
      const busy = await lineBusy();
      if (busy) throw busyConflict(busy.title);
    }
    throw error;
  }
}
