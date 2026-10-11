import { Clock3 } from "lucide-react";
import type { Job, Line } from "../shared/contracts";
import { formatBusinessDate, formatDuration } from "../shared/time";
import { JobTimes, OverdueBadge, Status } from "./JobDisplay";

export function DashboardJobRow({ job, lines }: { job: Job; lines: Line[] }) {
  return <article aria-label={formatBusinessDate(job.workDate) + ", task " + job.dayOrder} className={"dash-row is-" + (job.status === "in_progress" ? "active" : job.status)}>
    <div className="task-sequence dash-sequence" aria-label={"Daily order " + job.dayOrder}>{job.dayOrder}</div>
    <p className="dash-line"><span className="sr-only">Line </span>{lines.find(line => line.id === job.lineId)?.code ?? "Line"}</p>
    <div className="dash-title"><h3>{job.title}</h3>{job.overdue && <OverdueBadge />}</div>
    <p className="dash-target"><span className="sr-only">Target </span><span className="dash-mobile-label" aria-hidden="true">Target </span>{job.targetSkids === null ? "—" : <>{job.targetSkids}<span className="sr-only"> skids</span><span className="dash-mobile-label" aria-hidden="true"> skids</span></>}</p>
    <div className="dash-status"><Status job={job} /></div>
    <p className="dash-active"><Clock3 size={14} aria-hidden="true" /><span className="sr-only">Active </span>{formatDuration(job.activeMs)}</p>
    <div className="dash-times"><JobTimes job={job} /></div>
  </article>;
}
