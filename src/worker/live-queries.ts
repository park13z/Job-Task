import type { User } from "../shared/contracts";
import { torontoDayRange } from "../shared/time";
import { businessDate, jobJson, readPermission } from "./job-projection";
import { parseJobRow } from "./reads";

/** Live shows overdue/today unstarted work, every active/paused job, and jobs completed today. */
export async function liveJobs(db: D1Database, actor: User, at: number) {
  const date = businessDate(at);
  const { start, end } = torontoDayRange(date);
  const result = await db.prepare(`SELECT ${jobJson(at)} AS json FROM jobs j
    WHERE ${readPermission} AND (
      (j.status='todo' AND j.cancelled_at IS NULL AND j.work_date<=?)
      OR j.status IN ('in_progress','paused')
      OR (j.status='done' AND j.completed_at>=? AND j.completed_at<?)
    )
    ORDER BY j.work_date,j.line_id,j.queue_position,j.day_order,j.id`)
    .bind(actor.id, date, start, end).all<unknown>();
  const jobs = result.results.map(parseJobRow);
  return {
    date,
    inProgress: jobs.filter(job => job.status === "in_progress"),
    paused: jobs.filter(job => job.status === "paused"),
    done: jobs.filter(job => job.status === "done"),
    queued: jobs.filter(job => job.status === "todo"),
  };
}
