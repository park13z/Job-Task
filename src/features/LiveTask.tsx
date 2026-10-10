import { CheckCircle2, Clock3, PauseCircle, PlayCircle } from "lucide-react";
import type { Job, Line } from "../shared/contracts";
import { businessDate, formatBusinessDate, formatDuration, formatInstant, TORONTO_TIME_ZONE } from "../shared/time";

const clock = new Intl.DateTimeFormat("en-CA", {
  timeZone: TORONTO_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const jobStatusLabel: Record<Job["status"], string> = {
  done: "DONE", in_progress: "In Progressing", paused: "Paused", todo: "Waiting",
};
function shortTimestamp(instant: number, today: string): string {
  const day = businessDate(instant);
  return day === today ? clock.format(instant) : `${formatBusinessDate(day)} ${clock.format(instant)}`;
}

/** Three original anime-chibi workers lifted from the approved visual mockup. */
function LiveWorker({ variant }: { variant: number }) {
  return <span className={"live-worker live-worker-" + variant} aria-hidden="true">
    <span className="live-worker-upper" />
    <span className="live-worker-leg live-worker-leg-left" />
    <span className="live-worker-leg live-worker-leg-right" />
  </span>;
}

export function LiveTask({ job, lines, today }: { job: Job; lines: Line[]; today: string }) {
  const line = lines.find(item => item.id === job.lineId);
  const active = job.status === "in_progress";
  const endTime = job.status === "done" ? job.completedAt : null;
  return <article className={"live-task live-task-" + job.status}>
    <div className="live-task-origin" data-label="Line">
      <strong className="live-line-pill">{line?.code ?? "Line"}</strong>
      <span className="live-task-sequence">#{job.dayOrder}</span>
    </div>
    <div className="live-task-main" data-label="Task / Product">
      <h4>{job.title}</h4>
      {job.description && <p className="live-task-description">{job.description}</p>}
    </div>
    <div className="live-task-fact live-target" data-label="Target">
      <strong>{job.targetSkids !== null ? job.targetSkids + " skids" : "—"}</strong>
    </div>
    {active && <div className="live-task-fact live-progress-cell" data-label="Progress">
      <div className="live-progress-track" role="img" aria-label="Indeterminate activity, not a completion percentage"><span /></div>
    </div>}
    <div className="live-task-fact live-start" data-label="Start Time">
      {job.startedAt !== null ? <time title={formatInstant(job.startedAt)}>{shortTimestamp(job.startedAt, today)}</time> : "—"}
    </div>
    <div className="live-task-fact live-end" data-label={job.status === "done" ? "End Time" : "Est. End"}>
      {endTime !== null ? <time title={formatInstant(endTime)}>{shortTimestamp(endTime, today)}</time> : <span title="No estimated end time recorded">—</span>}
    </div>
    <div className="live-task-fact live-active" data-label="Active Time">
      <strong>{job.startedAt !== null ? formatDuration(job.activeMs) : "—"}</strong>
    </div>
    <div className="live-task-fact live-status" data-label="Status">
      <span className="live-task-state">{active ? <PlayCircle size={14} aria-hidden="true" /> :
        job.status === "done" ? <CheckCircle2 size={14} aria-hidden="true" /> :
        job.status === "paused" ? <PauseCircle size={14} aria-hidden="true" /> : <Clock3 size={14} aria-hidden="true" />}
        {jobStatusLabel[job.status]}</span>
    </div>
    {active && <div className="live-worker-track" aria-hidden="true">{[0, 1, 2].map(variant =>
      <div className={"live-worker-pacer live-worker-pacer-" + variant} key={variant}>
        <LiveWorker variant={variant} />
      </div>)}</div>}
  </article>;
}
