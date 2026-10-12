import { businessDateSchema } from "../shared/contracts";

export function businessDate(at: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const part = (type: string) => parts.find((value) => value.type === type)?.value;
  return businessDateSchema.parse(`${part("year")}-${part("month")}-${part("day")}`);
}

export function jobJson(at: number, event?: "paused" | "resumed"): string {
  if (!Number.isSafeInteger(at) || at < 0) throw new Error("Invalid server time");
  const day = businessDate(at);
  const latest = (kind: "paused" | "resumed") => event === kind ? String(at) :
    `(SELECT MAX(e.happened_at) FROM job_events e WHERE e.job_id=j.id AND e.event_type='${kind}')`;
  return `json_object(
    'id',j.id,'title',j.title,'description',j.description,'targetSkids',j.target_skids,
    'dayOrder',j.day_order,'queuePosition',j.queue_position,'insertedNumber',j.inserted_number,
    'cancelledAt',j.cancelled_at,'workDate',j.work_date,'lineId',j.line_id,'createdBy',j.created_by,
    'version',j.version,'createdAt',j.created_at,'updatedAt',j.updated_at,
    'status',j.status,'startedAt',j.started_at,'completedAt',j.completed_at,
    'lastPausedAt',${latest("paused")},'lastResumedAt',${latest("resumed")},
    'overdue',json(CASE WHEN j.status!='done' AND j.cancelled_at IS NULL AND j.work_date<'${day}' THEN 'true' ELSE 'false' END),
    'activeMs',COALESCE((SELECT SUM(COALESCE(w.closed_at,${at})-w.opened_at) FROM work_intervals w WHERE w.job_id=j.id),0)
  )`;
}

export const readPermission = `EXISTS (SELECT 1 FROM users actor WHERE actor.id=? AND actor.active=1 AND
  (actor.role IN ('manager','supervisor') OR (actor.role IN ('line_leader','assistant') AND
  EXISTS (SELECT 1 FROM line_members member WHERE member.user_id=actor.id AND member.line_id=j.line_id))))`;

export const plannerGuard = `EXISTS (SELECT 1 FROM users actor WHERE actor.id=? AND actor.active=1 AND actor.role IN ('manager','supervisor'))`;
export const managerGuard = `EXISTS (SELECT 1 FROM users actor WHERE actor.id=? AND actor.active=1 AND actor.role='manager')`;
export const executorGuard = `EXISTS (SELECT 1 FROM users actor
  JOIN production_lines line ON line.id=jobs.line_id
  WHERE actor.id=? AND actor.active=1 AND line.active=1
  AND (actor.role IN ('manager','supervisor') OR
    (actor.role IN ('line_leader','assistant') AND EXISTS
      (SELECT 1 FROM line_members member WHERE member.user_id=actor.id AND member.line_id=jobs.line_id))))`;