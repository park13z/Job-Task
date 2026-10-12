import { type User, type Job, type JobInput } from "../shared/contracts";
import { requirePlanner } from "./auth";
import { ApiError, conflict, isConstraint, unavailable } from "./errors";
import { jobJson, plannerGuard } from "./job-projection";
import { findJob } from "./reads";
import type { Operation } from "./idempotency";
import { mondayWeekRange } from "../shared/time";

type QueueRow = {
  id: string; status: Job["status"]; cancelled_at: number | null;
  queue_position: number; inserted_number: number | null; day_order: number;
};
type QueueAction = "insert" | "delete" | "cancel" | "recall" | "reorder";
type Change = { expectedRevision: number; reason: string };

async function queue(db: D1Database, date: string, line: string) {
  const result = await db.prepare(`SELECT id,status,cancelled_at,queue_position,inserted_number,day_order
    FROM jobs WHERE work_date=? AND line_id=? ORDER BY queue_position,day_order,id`)
    .bind(date,line).all<QueueRow>();
  return result.results;
}
const waiting = (rows: QueueRow[]) => rows.filter(row => row.status === "todo" && row.cancelled_at === null);
const ids = (rows: QueueRow[]) => rows.map(row => row.id);
const positions = (db: D1Database, ordered: string[]) =>
  ordered.map((jobId, index) => db.prepare("UPDATE jobs SET queue_position=? WHERE id=? AND status='todo' AND cancelled_at IS NULL")
    .bind(index + 1, jobId));

async function priorChange(db: D1Database, actor: User, op: Operation, action: QueueAction) {
  const existing = await db.prepare("SELECT actor_id,request_hash,action,job_id FROM queue_actions WHERE id=?")
    .bind(op.ids[0]).first<{actor_id:string;request_hash:string;action:string;job_id:string|null}>();
  if (!existing) return null;
  if (existing.actor_id !== actor.id || existing.request_hash !== op.hash || existing.action !== action)
    throw new ApiError(409,"IDEMPOTENCY_CONFLICT","This request key belongs to another operation.");
  return existing;
}

function record(db:D1Database, actor:User, op:Operation, action:QueueAction, jobId:string|null,
  date:string, line:string, reason:string, before:string[], after:string[], at:number, revision:number, jobGuard?:{id:string;version:number}) {
  // The NOT NULL constraint rejects a stale revision or job inside the same atomic D1 batch.
  const jobCheck = jobGuard
    ? " AND EXISTS (SELECT 1 FROM jobs WHERE id=? AND version=? AND status='todo')"
    : "";
  const sql = `INSERT INTO queue_actions
    (id,actor_id,request_hash,action,job_id,work_date,line_id,reason,previous_order,next_order,happened_at)
    VALUES ((SELECT CASE WHEN revision=? ${jobCheck} THEN ? ELSE NULL END FROM org_settings WHERE id=1),
      ?,?,?,?,?,?,?,?,?,?)`;
  const args: (string|number|null)[] = [revision];
  if (jobGuard) args.push(jobGuard.id,jobGuard.version);
  args.push(op.ids[0],actor.id,op.hash,action,jobId,date,line,reason,JSON.stringify(before),JSON.stringify(after),at);
  return db.prepare(sql).bind(...args);
}

async function apply(db:D1Database, statements:D1PreparedStatement[]) {
  try { await db.batch([...statements,db.prepare("UPDATE org_settings SET revision=revision+1 WHERE id=1")]); }
  catch(error) { if (isConstraint(error)) throw conflict(); throw unavailable(); }
}

export async function insertQueue(db:D1Database,actor:User, data:Change & {job:JobInput;aboveQueue:number},
  op:Operation,at:number) {
  requirePlanner(actor);
  const replay = await priorChange(db,actor,op,"insert");
  if (replay?.job_id) return findJob(db,actor,replay.job_id,at);
  const row = data.job;
  const before = waiting(await queue(db,row.workDate,row.lineId));
  const ordinary = before.filter(row => row.inserted_number === null);
  if (data.aboveQueue > ordinary.length + 1) throw conflict();
  const jobId = crypto.randomUUID();
  const anchor = ordinary[data.aboveQueue-1];
  const insertIndex = anchor ? before.findIndex(row => row.id === anchor.id) : before.length;
  const next = ids(before);
  next.splice(insertIndex,0,jobId);
  const wk = mondayWeekRange(row.workDate);
  const number = await db.prepare("SELECT COALESCE(MAX(inserted_number),0)+1 AS n FROM jobs WHERE work_date=? AND line_id=?")
    .bind(row.workDate,row.lineId).first<{n:number}>();
  if (!number) throw unavailable();
  const statements = [
    record(db,actor,op,"insert",jobId,row.workDate,row.lineId,data.reason,ids(before),next,at,data.expectedRevision),
    db.prepare(`INSERT INTO jobs(id,title,description,target_skids,day_order,queue_position,inserted_number,work_date,line_id,created_by,created_at,updated_at,operation_id)
      SELECT ?,?,?,?,(SELECT COALESCE(MAX(day_order),0)+1 FROM jobs WHERE work_date BETWEEN ? AND ?),
        ?,?,?,?,?,?,?,? WHERE ${plannerGuard} AND EXISTS (SELECT 1 FROM production_lines WHERE id=? AND active=1)`)
      .bind(jobId,row.title,row.description??"",row.targetSkids??null,wk.from,wk.to,before.length+1,number.n,
        row.workDate,row.lineId,actor.id,at,at,op.ids[0],actor.id,row.lineId),
    ...positions(db,next),
    db.prepare(`INSERT INTO job_events
      (id,job_id,actor_id,event_type,version,previous_state,new_state,happened_at,operation_id,request_hash)
      SELECT ?,j.id,?,'created',1,NULL,${jobJson(at)},?,?,?
      FROM jobs j WHERE j.id=?`)
      .bind(crypto.randomUUID(),actor.id,at,op.ids[0],op.hash,jobId),
  ];
  await apply(db,statements);
  return findJob(db,actor,jobId,at);
}

export async function reorderQueue(db:D1Database,actor:User, data:Change & {workDate:string;lineId:string;ids:string[]},
  op:Operation,at:number) {
  requirePlanner(actor);
  if (await priorChange(db,actor,op,"reorder")) return;
  const before = ids(waiting(await queue(db,data.workDate,data.lineId)));
  if (before.length !== data.ids.length || before.some(id=>!data.ids.includes(id))) throw conflict();
  if (before.every((id,i)=>id===data.ids[i])) return;
  await apply(db,[
    record(db,actor,op,"reorder",null,data.workDate,data.lineId,data.reason,before,data.ids,at,data.expectedRevision),
    ...positions(db,data.ids),
  ]);
}

export async function changeQueueJob(db:D1Database,actor:User,id:string,action:"delete"|"cancel"|"recall",
  data:Change & {expectedVersion:number},op:Operation,at:number) {
  requirePlanner(actor);
  if (await priorChange(db,actor,op,action)) return;
  const job = await findJob(db,actor,id,at);
  if (job.status !== "todo" || job.version !== data.expectedVersion) throw conflict();
  if (action === "cancel" && job.cancelledAt !== null) throw conflict();
  if (action === "recall" && job.cancelledAt === null) throw conflict();
  const rows = await queue(db,job.workDate,job.lineId);
  const before = ids(waiting(rows));
  const next = [...before];
  if (action !== "recall") {
    const i = next.indexOf(id);
    if (i >= 0) next.splice(i,1);
  } else next.splice(Math.min(Math.max(0,job.queuePosition-1),next.length),0,id);
  const statements: D1PreparedStatement[] = [
    record(db,actor,op,action,id,job.workDate,job.lineId,data.reason,before,next,at,
      data.expectedRevision,{id,version:data.expectedVersion}),
  ];
  if (action === "delete") {
    statements.push(db.prepare("DELETE FROM job_events WHERE job_id=?").bind(id));
    statements.push(db.prepare("DELETE FROM jobs WHERE id=? AND status='todo' AND started_at IS NULL").bind(id));
  } else {
    statements.push(db.prepare("UPDATE jobs SET cancelled_at=? WHERE id=? AND status='todo'")
      .bind(action==="cancel"?at:null,id));
  }
  statements.push(...positions(db,next));
  await apply(db,statements);
}
